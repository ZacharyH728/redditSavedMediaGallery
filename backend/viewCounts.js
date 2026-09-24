// backend/viewCounts.js
//
// Per-file "times shown" counters, and the frozen per-session baselines the
// `least_shown` sort orders against.
//
// Counts live in a Map because reads sit directly in the sort path for every
// /api/media request; nothing here ever blocks a response on disk. Persistence
// is one JSON file in CACHE_DIR, rewritten on a debounce. Everything in this
// module is advisory data: if the file is missing, corrupt, or unwritable, the
// gallery must still serve media, so every failure path here logs and continues
// rather than throwing.

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// The whole file is rewritten per flush (~2.8MB / ~15ms of JSON.stringify at
// 30k entries), so this is deliberately not aggressive. A hard kill loses at
// most this window, which costs a handful of items an off-by-one view count.
const FLUSH_DEBOUNCE_MS = parseInt(process.env.VIEW_FLUSH_DEBOUNCE_MS || '30000', 10);

// Snapshots are delta maps (see getSnapshot), so they cost a few KB each and
// are O(1) to create. That is what lets this be 32 rather than a handful — the
// only real hazard in the design is a client returning with a seed whose
// snapshot has been evicted, and a big LRU is what makes that not happen.
const SNAPSHOT_LIMIT = 32;
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
// Built views, unlike the deltas, are full-library arrays plus a full-library
// id->index Map. Only the few most recent seeds keep theirs.
const VIEWS_RETAINED = 3;

// How many consecutive *trusted* scans an id must be absent from before its
// history is deleted. See pruneViewCounts.
const PRUNE_MISSING_STREAK = 3;

const viewCounts = new Map();  // id -> total times shown
const snapshots = new Map();   // seed -> { since, views, used } (insertion order == LRU)

let VIEWS_FILE = null;
let dirty = false;
let flushTimer = null;
let flushing = false;

// Set by server.js to () => globalIdSet. Pruning needs to know what is still in
// the library, but this module deliberately doesn't import the media index.
let libraryIds = () => null;
function setLibraryIdsProvider(fn) { libraryIds = fn; }

// --- Load ---

async function loadViewCounts(cacheDir) {
  VIEWS_FILE = path.join(cacheDir, 'view_counts.json');
  try {
    const parsed = JSON.parse(await fs.readFile(VIEWS_FILE, 'utf8'));
    for (const id of Object.keys(parsed)) {
      const n = Number(parsed[id]);
      if (Number.isFinite(n) && n > 0) viewCounts.set(id, n);
    }
    console.log(`Loaded view counts for ${viewCounts.size} files from ${VIEWS_FILE}`);
  } catch (err) {
    if (err.code === 'ENOENT') console.log('No view counts file yet — starting from empty.');
    else console.error('View counts unreadable, starting from empty:', err.message);
  }
}

// --- Recording ---

function recordView(id) {
  viewCounts.set(id, (viewCounts.get(id) || 0) + 1);
  // Every live snapshot records that this id moved since its baseline was
  // taken, so snapshotCount can subtract it back out. At most SNAPSHOT_LIMIT
  // iterations, so this stays trivial.
  for (const s of snapshots.values()) s.since.set(id, (s.since.get(id) || 0) + 1);
  dirty = true;
  scheduleFlush();
}

// --- Session baselines ---
//
// The problem this solves: a `least_shown` view is cached per cacheVersion, and
// cacheVersion bumps on every rescan (the 15-minute backstop, plus watcher
// events). Rebuilding that view from LIVE counts mid-session would give every
// item the user has already seen count+1, sorting all of them behind the entire
// unseen count-0 population. The id cursor would then resolve to a position
// near the end of the array and the next page would come off the tail, silently
// skipping thousands of unseen items. The client's seenIds retry loop cannot
// catch that, because those items are not duplicates of *this* session.
//
// So the order has to be computed against counts as they were when the session
// started. Copying the whole count map per seed would be O(n) and megabytes.
// But counts only ever increase, so
//
//     countAsOf(T0, id) === liveCount(id) - (increments to id since T0)
//
// and the right-hand delta set is one entry per item viewed since the session
// began — hundreds, not one per file in the library. A snapshot is therefore
// free to create and nearly free to hold.
//
// A pleasant consequence: a session's own reported views are subtracted back
// out of its own baseline, so browsing never perturbs the order being browsed.

function getSnapshot(seed) {
  const now = Date.now();
  let s = snapshots.get(seed);
  if (s && now - s.used > SNAPSHOT_TTL_MS) { snapshots.delete(seed); s = undefined; }

  if (s) {
    snapshots.delete(seed); // LRU bump: delete + re-set moves it to the end
  } else {
    if (snapshots.size >= SNAPSHOT_LIMIT) snapshots.delete(snapshots.keys().next().value);
    s = { since: new Map(), views: new Map(), used: 0 };
  }
  s.used = now;
  snapshots.set(seed, s);

  // Deltas are cheap to keep for all 32 seeds; their built views are not.
  // Iteration is oldest-first, so this clears views on everything but the
  // VIEWS_RETAINED most recently used.
  let rank = snapshots.size;
  for (const e of snapshots.values()) if (rank-- > VIEWS_RETAINED) e.views.clear();

  return s;
}

function snapshotCount(snap, id) {
  const live = viewCounts.get(id) || 0;
  const since = snap.since.get(id) || 0;
  // Clamp: an id can be pruned and then reappear, leaving `since` ahead of the
  // live count. Treat that as unshown rather than as a negative sort key.
  return live > since ? live - since : 0;
}

// --- Pruning ---
//
// Entries for files that have left the library should eventually go, but the
// guard's failure mode must be "keep stale entries", never "delete history":
// a stale entry costs ~90 bytes, and wiped history is unrecoverable. The
// library is on an NFS mount where a partial listing looks exactly like a mass
// deletion, so nothing is removed until it has been absent from several scans
// that were themselves large enough to be trustworthy.

let libraryHighWater = 0;
const missingStreak = new Map();

function pruneViewCounts(idSet) {
  if (!idSet || idSet.size === 0) return;          // failed or pre-boot scan
  libraryHighWater = Math.max(libraryHighWater, idSet.size);
  if (idSet.size < libraryHighWater * 0.5) return; // looks like a truncated listing
  if (viewCounts.size <= idSet.size * 2) return;   // nothing worth reclaiming yet

  let removed = 0;
  for (const id of viewCounts.keys()) {
    if (idSet.has(id)) { missingStreak.delete(id); continue; }
    const n = (missingStreak.get(id) || 0) + 1;
    if (n >= PRUNE_MISSING_STREAK) {
      viewCounts.delete(id);
      missingStreak.delete(id);
      removed++;
    } else {
      missingStreak.set(id, n);
    }
  }
  if (removed) console.log(`View counts: pruned ${removed} entries for files no longer in the library.`);
}

// --- Persistence ---

function serialize() {
  const out = Object.create(null);
  for (const [id, n] of viewCounts) if (n > 0) out[id] = n;
  return JSON.stringify(out);
}

function scheduleFlush() {
  if (flushTimer || flushing) return;
  flushTimer = setTimeout(() => { flushTimer = null; flushViews(); }, FLUSH_DEBOUNCE_MS);
  // Never hold the process open just to write advisory counters.
  if (flushTimer.unref) flushTimer.unref();
}

async function flushViews() {
  if (flushing || !dirty || !VIEWS_FILE) return;
  flushing = true;
  dirty = false;
  try {
    pruneViewCounts(libraryIds());
    // Temp file in the SAME directory, then rename. CACHE_DIR is an NFS mount
    // and not the container's overlay fs, so a temp anywhere else would make
    // this rename fail with EXDEV — the same rule faststart.py documents.
    const tmp = `${VIEWS_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, serialize());
    await fs.rename(tmp, VIEWS_FILE);
  } catch (err) {
    // A NAS blip must not lose the counts or kill the timer. Put the dirty flag
    // back and try again on the next tick.
    dirty = true;
    console.error('View counts: flush failed, will retry:', err.message);
  } finally {
    flushing = false;
    if (dirty) scheduleFlush();
  }
}

// Shutdown path. A few MB written synchronously is milliseconds even on NFS,
// and there is no time for anything cleverer inside a stop grace period.
function flushViewsSync() {
  if (!dirty || !VIEWS_FILE) return;
  try {
    const tmp = `${VIEWS_FILE}.${process.pid}.tmp`;
    fsSync.writeFileSync(tmp, serialize());
    fsSync.renameSync(tmp, VIEWS_FILE);
    dirty = false;
    console.log('View counts flushed on shutdown.');
  } catch (err) {
    console.error('View counts: final flush failed:', err.message);
  }
}

module.exports = {
  viewCounts,
  loadViewCounts,
  setLibraryIdsProvider,
  recordView,
  getSnapshot,
  snapshotCount,
  pruneViewCounts,
  flushViews,
  flushViewsSync,
};

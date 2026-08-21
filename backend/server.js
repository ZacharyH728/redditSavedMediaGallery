// backend/server.js - OPTIMIZED
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const cors = require('cors');
const chokidar = require('chokidar');

// Defense in depth: a single failed ffmpeg call, corrupt file, or other
// per-request error must never take down the whole server for every other
// active user. One such gap already crashed this process in production
// (see the /api/thumbnail route below) — this is a backstop for any others.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (ignored to keep the server alive):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (ignored to keep the server alive):', err);
});

const app = express();
const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, 'media');
const CACHE_FILE = path.join(__dirname, 'media_cache.json');
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const THUMBNAIL_CONCURRENCY = parseInt(process.env.THUMBNAIL_CONCURRENCY || '4', 10);

// Deduplicates concurrent thumbnail requests for the same file
const pendingThumbnails = new Map();

// Caps how many ffmpeg thumbnail jobs run at once — without this, scrolling
// fast through a batch of never-thumbnailed media can spawn one ffmpeg
// process per image/video in view simultaneously.
const thumbnailQueue = [];
let activeThumbnails = 0;

function enqueueThumbnail(run) {
  return new Promise((resolve, reject) => {
    thumbnailQueue.push({ run, resolve, reject });
    drainThumbnailQueue();
  });
}

function drainThumbnailQueue() {
  while (thumbnailQueue.length > 0 && activeThumbnails < THUMBNAIL_CONCURRENCY) {
    const { run, resolve, reject } = thumbnailQueue.shift();
    activeThumbnails++;
    run().then(resolve, reject).finally(() => {
      activeThumbnails--;
      drainThumbnailQueue();
    });
  }
}

// --- Caches ---
// 1. Query Cache: key (seed+sort) -> array (sorted file list)
const queryCache = new Map();
// 2. Global File Index
let globalFileCache = [];
// Bumped every time globalFileCache is (re)built. Deterministic sorts fold this
// into their cache key so that when files are added/removed the next request
// recomputes against the fresh index instead of serving a stale frozen list —
// otherwise newly-downloaded items never appear in the "added" sort.
let cacheVersion = 0;

// --- Middleware ---
app.use(cors());

// Serve static files via Node.js as a fallback (primary serving happens via Nginx)
app.use('/media', express.static(PHOTOS_DIR));
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// --- Utilities ---
function createSeededRandom(seed) {
  if (!seed) return Math.random;
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return function() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function shuffleArray(array, seed = null) {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array];
  const randomFn = seed ? createSeededRandom(seed) : Math.random;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(randomFn() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]];
  }
  return newArray;
}

// "Newest" timestamp for sorting: modified time, i.e. the same field a plain
// file browser (copyparty, `ls -t`, Finder's "Date Modified") sorts by, so the
// gallery's order matches what you see on the share.
//
// This used to prefer birth time. Don't: the library lives on an NFS mount, and
// Node/libuv only reports a real birth time when the kernel+FS answer statx()
// with STATX_BTIME. When they don't, birthtimeMs is either 0 or a copy of
// *ctime* (inode-change time) — and ctime is rewritten by any copy, rsync,
// move, chmod or chown, so a bulk transfer to the NAS stamps thousands of old
// files with the same recent "creation" date. That produced an order unrelated
// to when anything was actually downloaded, while copyparty (mtime) stayed
// correct. Worse, the old per-file fallback mixed the two bases in one sort:
// files with a real btime were compared against other files' mtime.
//
// Birth time is kept only as a fallback for the (unusual) case of a file with
// no usable mtime, so entries never sort as if they were from 1970.
function addedTime(file) {
  return file.modified_utc > 0 ? file.modified_utc : file.created_utc;
}

// --- File Discovery ---
const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i;
const videoExts = /\.(mp4|webm|mov|mkv|avi|wmv|flv|m4v)$/i;
const audioExts = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;

// fs.stat/fs.readdir are dispatched to libuv's small fixed-size thread pool
// (4 threads by default). Scanning a large library with unbounded concurrency
// floods that pool — a full scan of tens of thousands of files can take
// minutes instead of seconds, and every request queues up behind it.
const FS_SCAN_CONCURRENCY = parseInt(process.env.FS_SCAN_CONCURRENCY || '32', 10);
let activeFsOps = 0;
const fsOpQueue = [];

function limitFsOp(fn) {
  return new Promise((resolve, reject) => {
    fsOpQueue.push({ fn, resolve, reject });
    drainFsOpQueue();
  });
}

function drainFsOpQueue() {
  while (fsOpQueue.length > 0 && activeFsOps < FS_SCAN_CONCURRENCY) {
    const { fn, resolve, reject } = fsOpQueue.shift();
    activeFsOps++;
    fn().then(resolve, reject).finally(() => {
      activeFsOps--;
      drainFsOpQueue();
    });
  }
}

// Directories under PHOTOS_DIR that must never be indexed as library media.
//
// `transcodes` and `.tmp-transcode` are leftovers from the removed transcoding
// feature. The generated .mp4s still sit on the NAS share at
// /mnt/media/Photos/transcodes, i.e. *inside* the photos tree, so this guard is
// still load-bearing: without it the scanner indexes every one of them as a
// second copy of a video already in the library, and — because their mtimes are
// whenever the transcoder happened to run — buries the "newest" sort under
// thousands of freshly-restamped duplicates ordered alphabetically rather than
// by download date. Keep these names excluded until that folder is deleted from
// the share.
//
// The match is by NAME, deliberately hardcoded: any directory so named anywhere
// under PHOTOS_DIR is skipped outright, so no env var or mount layout can
// quietly re-open the hole, and already-nested leftovers
// (transcodes/transcodes/…) are caught too.
//
// registerExcludedDir additionally matches by DEVICE+INODE, which is what
// covers a dir reached under a different path than the one we know it by — two
// bind mounts of the same NAS folder have different paths but, since a bind
// mount preserves the superblock, the same dev+ino. THUMBNAILS_DIR is
// registered that way at startup.
const EXCLUDED_DIR_NAMES = new Set(['transcodes', 'thumbnails', '.tmp-transcode']);
const excludedDirIds = new Set();   // "dev:ino"
const excludedDirPaths = new Set(); // resolved paths, incl. ones matched by id

// Only segments *below* PHOTOS_DIR are checked — if the library itself lived at
// e.g. /mnt/media/thumbnails, matching against the full path would exclude
// everything.
function hasExcludedName(fullPath) {
  const rel = path.relative(PHOTOS_DIR, path.resolve(fullPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return rel.split(path.sep).some(seg => EXCLUDED_DIR_NAMES.has(seg.toLowerCase()));
}

async function registerExcludedDir(dir) {
  excludedDirPaths.add(path.resolve(dir));
  try {
    const s = await fs.stat(dir);
    excludedDirIds.add(`${s.dev}:${s.ino}`);
  } catch {
    // Doesn't exist — nothing to match by id; the name guard still covers it.
  }
}

function isExcludedPath(fullPath) {
  if (hasExcludedName(fullPath)) return true;
  const resolved = path.resolve(fullPath);
  for (const ex of excludedDirPaths) {
    if (resolved === ex || resolved.startsWith(ex + path.sep)) return true;
  }
  return false;
}

async function isExcludedDir(dirPath) {
  if (isExcludedPath(dirPath)) return true;
  if (excludedDirIds.size === 0) return false;
  try {
    const s = await limitFsOp(() => fs.stat(dirPath));
    if (excludedDirIds.has(`${s.dev}:${s.ino}`)) {
      // Memoize the path this dir is reached by, so the sync path check (and
      // the watcher's sync `ignored`) catches it without re-statting.
      excludedDirPaths.add(path.resolve(dirPath));
      return true;
    }
  } catch { /* unreadable dir — the caller's own stat will handle it */ }
  return false;
}

async function getImageFiles(dir) {
  if (await isExcludedDir(dir)) return [];

  try {
    const dirents = await limitFsOp(() => fs.readdir(dir, { withFileTypes: true }));
    
    // --- LIVE PHOTO DEDUPLICATION LOGIC ---
    // 1. Identify all image base names in this specific directory first.
    //    If we have 'vacation.heic', we store 'vacation' in the set.
    const imageBaseNames = new Set();
    for (const dirent of dirents) {
      if (!dirent.isDirectory() && imageExts.test(dirent.name)) {
        // 'IMG_1234.HEIC' -> 'img_1234'
        const baseName = path.parse(dirent.name).name.toLowerCase();
        imageBaseNames.add(baseName);
      }
    }
    // --------------------------------------

    const filesPromises = dirents.map(async (dirent) => {
      const fullPath = path.join(dir, dirent.name);
      
      try {
        if (dirent.isDirectory()) {
          return await getImageFiles(fullPath);
        } else {
          let type = null;
          if (imageExts.test(dirent.name)) type = 'image';
          else if (videoExts.test(dirent.name)) type = 'video';
          else if (audioExts.test(dirent.name)) type = 'audio';

          if (type) {
            // Check for Live Photo duplicate
            if (type === 'video') {
              const baseName = path.parse(dirent.name).name.toLowerCase();
              // If there is an image with the exact same name, assume this video is just the "Live" part
              if (imageBaseNames.has(baseName)) {
                return []; // SKIP this file
              }
            }

            // Optimization: Get stats strictly for what we need
            const stats = await limitFsOp(() => fs.stat(fullPath));
            const relativePath = path.relative(PHOTOS_DIR, fullPath).replace(/\\/g, '/');
            const encodedUrlPath = relativePath.split('/').map(encodeURIComponent).join('/');
            
            const fileObj = {
              id: Buffer.from(relativePath).toString('base64'),
              url: `/media/${encodedUrlPath}`,
              thumbnail_url: (type === 'video' || type === 'image') ? `/thumbnail/${encodedUrlPath}` : null,
              title: dirent.name,
              created_utc: stats.birthtimeMs / 1000,
              modified_utc: stats.mtimeMs / 1000,
              author: 'Local Library',
              subreddit: path.basename(path.dirname(fullPath)),
              post_hint: type,
            };
            return [fileObj];
          }
        }
      } catch (err) {
        console.error(`Error processing file ${fullPath}:`, err.message);
        return []; 
      }
      return []; 
    });

    const results = await Promise.all(filesPromises);
    return results.flat();

  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
    return []; 
  }
}

function groupGalleryItems(files) {
  const groups = new Map();
  const singles = [];

  for (const file of files) {
    // Pass already-grouped gallery items through unchanged (cache idempotency)
    if (file.post_hint === 'gallery') { singles.push(file); continue; }
    const match = file.title.match(/^(.+)_(\d+)(\.[^.]+)$/);
    if (!match) { singles.push(file); continue; }
    const [, baseName, num, ext] = match;
    const dir = file.url.substring(0, file.url.lastIndexOf('/'));
    const key = `${dir}/${baseName}${ext}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ file, num: parseInt(num, 10) });
  }

  const result = [...singles];
  for (const [, items] of groups) {
    items.sort((a, b) => a.num - b.num);
    const nums = items.map(i => i.num);
    // Require 2+ items with no gaps. Starting number is unconstrained so
    // galleries numbered _0…_N and _2…_N both work. A lone _3.jpg (1 item)
    // or two files with a gap (_1, _3) are left as regular files.
    const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (items.length < 2 || !isConsecutive) {
      items.forEach(({ file }) => result.push(file));
    } else {
      const first = items[0].file;
      const baseName = first.title.match(/^(.+)_\d+(\.[^.]+)$/)?.[1] ?? first.title;
      result.push({
        id: `gallery_${first.id}`,
        title: baseName,
        post_hint: 'gallery',
        subreddit: first.subreddit,
        created_utc: first.created_utc,
        modified_utc: first.modified_utc,
        items: items.map(({ file }) => ({
          url: file.url,
          thumbnail_url: file.thumbnail_url,
          title: file.title,
          post_hint: file.post_hint,
        })),
      });
    }
  }
  return result;
}

async function updateFileCache() {
  console.log('Updating file cache from disk...');
  const start = Date.now();
  globalFileCache = groupGalleryItems(await getImageFiles(PHOTOS_DIR));
  cacheVersion += 1;

  // Optimization: Write cache to disk
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(globalFileCache));
    console.log(`Cache persisted to ${CACHE_FILE}`);
  } catch (err) {
    console.error('Failed to write cache file:', err);
  }

  // Note: queryCache is intentionally left alone here. Each entry is a frozen
  // permutation for one (sort, seed) pair; wiping it while a session is still
  // paginating through it would make later pages reslice a differently-shaped
  // array under the same seed, producing duplicate/skipped items mid-scroll.
  // New files become visible via new cache keys (e.g. the next reshuffle).

  console.log(`Cache updated with ${globalFileCache.length} files in ${Date.now() - start}ms`);
}

// Dedupes concurrent callers (watcher, cold-start /api/media, manual refresh)
// onto a single in-flight scan instead of each kicking off its own full walk.
let cacheUpdateInFlight = null;
function updateFileCacheOnce() {
  if (!cacheUpdateInFlight) {
    cacheUpdateInFlight = updateFileCache().finally(() => { cacheUpdateInFlight = null; });
  }
  return cacheUpdateInFlight;
}

// --- Load Cache on Start ---
async function loadCacheFromDisk() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    globalFileCache = groupGalleryItems(JSON.parse(data));
    console.log(`Loaded ${globalFileCache.length} files from persistent cache.`);
    // The persisted cache is a snapshot — serve from it immediately (fast boot),
    // but refresh it in the background so a restart always picks up files (and
    // updated mtimes) that appeared on the share while this was down or while
    // the inotify watcher was blind to remote writes.
    updateFileCacheOnce().catch(err => console.error('Startup rescan failed:', err));
  } catch (err) {
    console.log('No persistent cache found, scanning now...');
    await updateFileCacheOnce();
  }
}

// --- Watcher ---
let debounceTimer;
function scheduleCacheUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log('File change detected. Updating cache...');
    updateFileCacheOnce();
  }, 5000); // 5 seconds debounce
}

function startWatcher() {
  const watcher = chokidar.watch(PHOTOS_DIR, {
    // Ignore dotfiles and every excluded dir (see EXCLUDED_DIR_NAMES) — those
    // live inside PHOTOS_DIR, so without this each write under them would
    // schedule a full rescan.
    ignored: (p) => /(^|[\/\\])\../.test(path.basename(p)) || isExcludedPath(p),
    persistent: true,
    ignoreInitial: true, // Don't trigger on existing files at startup
    depth: 99
  });

  watcher
    .on('add', path => scheduleCacheUpdate())
    .on('unlink', path => scheduleCacheUpdate());
    // .on('change', ...) - usually we don't care if content changes, only if files are added/removed for the gallery list, 
    // but if metadata changes it might be useful. Keeping it simple for now.
    
  console.log('File watcher started on ' + PHOTOS_DIR);
}

// The watcher above is inotify-based, and inotify does not see writes made by
// *another host* to an NFS/SMB share — the downloader writes to the NAS, not to
// this container, so 'add'/'unlink' may never fire here. Combined with the
// persistent media_cache.json (loaded verbatim on boot), the index could stay
// frozen indefinitely, which makes "newest" show the newest file as of the last
// scan rather than the newest file on disk. Rescan on a timer as a backstop.
// Set RESCAN_INTERVAL_MS=0 to disable (e.g. for a local, watcher-visible dir).
const RESCAN_INTERVAL_MS = parseInt(process.env.RESCAN_INTERVAL_MS || String(15 * 60 * 1000), 10);

function startPeriodicRescan() {
  if (!RESCAN_INTERVAL_MS) return;
  setInterval(() => {
    updateFileCacheOnce().catch(err => console.error('Periodic rescan failed:', err));
  }, RESCAN_INTERVAL_MS);
  console.log(`Periodic rescan every ${Math.round(RESCAN_INTERVAL_MS / 1000)}s`);
}

// Old media_cache.json files (written while video transcoding still existed)
// carry these internal fields. Strip them so they can't leak to the client in
// the window between boot and the startup rescan that rewrites the cache.
function buildClientFile(file) {
  const { _relPath, _transcodedRelPath, ...out } = file;
  if (out.post_hint === 'gallery' && Array.isArray(out.items)) {
    out.items = out.items.map(({ _relPath: _ir, _transcodedRelPath: _itp, ...itemOut }) => itemOut);
  }
  return out;
}

// --- Thumbnail Generation ---
async function generateThumbnail(mediaPath, thumbPath, isVideo) {
  const args = isVideo
    ? ['-ss', '1', '-i', mediaPath, '-vframes', '1', '-vf', 'scale=640:-1', '-q:v', '5', '-f', 'image2', thumbPath, '-y']
    : ['-i', mediaPath, '-vf', 'scale=800:-1', '-q:v', '5', '-f', 'image2', thumbPath, '-y'];
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 30000 }, (err) => err ? reject(err) : resolve());
  });
}

app.use('/api/thumbnail', async (req, res) => {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const relPath = req.path.slice(1); // strip leading '/', already URL-decoded by Express
    if (!relPath) { res.status(400).end(); return; }

    const mediaPath = path.resolve(PHOTOS_DIR, relPath);
    const base = PHOTOS_DIR.endsWith(path.sep) ? PHOTOS_DIR : PHOTOS_DIR + path.sep;
    if (!mediaPath.startsWith(base)) { res.status(403).end(); return; }

    const thumbPath = path.join(THUMBNAILS_DIR, relPath + '.jpg');

    // Serve from cache
    try { await fs.access(thumbPath); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); return res.sendFile(thumbPath); } catch {}

    // Ensure source exists
    try { await fs.access(mediaPath); } catch { res.status(404).end(); return; }

    const isVideo = videoExts.test(relPath);
    const isImage = imageExts.test(relPath) && !/\.svg$/i.test(relPath);
    if (!isVideo && !isImage) { res.status(400).end(); return; }

    // Deduplicate concurrent requests for the same thumbnail, and cap how many
    // distinct thumbnails generate at once via the queue.
    if (!pendingThumbnails.has(thumbPath)) {
      const p = enqueueThumbnail(async () => {
        await fs.mkdir(path.dirname(thumbPath), { recursive: true });
        await generateThumbnail(mediaPath, thumbPath, isVideo);
      });
      pendingThumbnails.set(thumbPath, p);
      // .finally() propagates a rejection from p into a new promise that
      // nothing else awaits; left unhandled, that crashes the whole process
      // the moment ffmpeg fails on any one file. The actual rejection is
      // already delivered to the caller via `await pendingThumbnails.get(...)`
      // below — this chain exists only for the cleanup side effect.
      p.finally(() => pendingThumbnails.delete(thumbPath)).catch(() => {});
    }
    await pendingThumbnails.get(thumbPath);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(thumbPath);
  } catch (err) {
    console.error('Thumbnail error:', err.message);
    res.status(500).end();
  }
});

// --- API Route ---
app.get('/api/media', async (req, res) => {
  try {
    const limit = 50;
    const page = parseInt(req.query.page) || 1;
    const sort = req.query.sort || 'random';
    const seed = req.query.seed ? parseInt(req.query.seed) : Date.now();

    // Optimization: Generate a unique key for this view configuration.
    // Non-random sorts don't depend on the seed, so every session sharing a
    // sort order shares one cache entry instead of one each — but they DO depend
    // on the current file index, so fold in cacheVersion to pick up added/removed
    // files after a rescan.
    const cacheKey = sort === 'random' ? `random_${seed}` : `${sort}_v${cacheVersion}`;

    if (globalFileCache.length === 0) {
      // Fallback if empty
      await updateFileCacheOnce();
    }

    let processedFiles;

    // Optimization: Check Query Cache
    if (queryCache.has(cacheKey)) {
      processedFiles = queryCache.get(cacheKey);
      // Bump recency: delete + re-set moves this key to the end of the Map's
      // iteration order, which the eviction below treats as "most recent".
      queryCache.delete(cacheKey);
      queryCache.set(cacheKey, processedFiles);
    } else {
      // If not in cache, calculate and store it
      // NOTE: This prevents re-sorting/re-shuffling on every page turn
      processedFiles = [...globalFileCache];

      if (sort === 'random') {
        processedFiles = shuffleArray(processedFiles, seed);
      } else if (sort === 'date' || sort === 'added') {
        // Newest first, by modified time — see addedTime() for why not birth time.
        processedFiles.sort((a, b) => addedTime(b) - addedTime(a));
      } else if (sort === 'modified') {
        processedFiles.sort((a, b) => b.modified_utc - a.modified_utc);
      } else {
        processedFiles.sort((a, b) => a.title.localeCompare(b.title));
      }

      // Evict only the single least-recently-used entry once at capacity.
      // A full clear() here would blow away other sessions' (or this one's,
      // after a later refresh) frozen permutation mid-scroll — the same
      // failure mode as the watcher-triggered clear() removed above.
      if (queryCache.size >= 100) {
        const oldestKey = queryCache.keys().next().value;
        queryCache.delete(oldestKey);
      }
      queryCache.set(cacheKey, processedFiles);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const files = processedFiles.slice(startIndex, endIndex).map(buildClientFile);
    const hasMore = endIndex < processedFiles.length;

    res.json({
      data: {
        children: files,
        after: hasMore,
      }
    });
  } catch (error) {
    console.error("Error in /api/media route:", error);
    res.status(500).json({ error: "Failed to retrieve media." });
  }
});

app.get('/api/refresh', (req, res) => {
  // Even with bounded fs concurrency, a full scan of a very large library can
  // take a while — don't hold the HTTP request (and whatever proxy sits in
  // front of it) open for the whole duration. Kick it off and report the
  // (possibly stale, about to be updated) count immediately.
  updateFileCacheOnce().catch((error) => {
    console.error("Error in background /api/refresh scan:", error);
  });
  res.json({ message: 'Cache refresh started in the background', count: globalFileCache.length });
});

app.get('/api/refresh-status', (req, res) => {
  res.json({ inProgress: cacheUpdateInFlight !== null, count: globalFileCache.length });
});

async function startServer() {
  try {
    await fs.access(PHOTOS_DIR);
  } catch (error) {
    console.log(`Media directory not found at ${PHOTOS_DIR}. Creating it.`);
    await fs.mkdir(PHOTOS_DIR, { recursive: true });
  }

  // Must happen before any scan: identifies the dir by dev+inode so the scanner
  // recognises it even when reached under a different mount path.
  await registerExcludedDir(THUMBNAILS_DIR);

  // Optimization: Load from disk first
  await loadCacheFromDisk();

  // Start watching for changes
  startWatcher();
  startPeriodicRescan();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`Optimized Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving media from: ${PHOTOS_DIR}`);
    console.log(`==================================================\n`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});


// Prefetches the REAL media files for the items just below the viewport, so
// scrolling onto one paints/plays immediately instead of starting a download.
//
// What this replaces: the old preload ran once per API page, over all 50 items
// of that page at once, and fetched each item's *thumbnail* — while videos got
// nothing at all. Two things were wrong with that. It warmed the wrong bytes
// (a 640px JPEG is not what the item renders once you reach it), and it fired
// 50 requests for content thousands of pixels away, which just queued behind
// itself and was usually evicted or still in flight by the time it mattered.
//
// This module instead tracks a small sliding window of the next few items,
// pulls the full file for each one, and aborts anything that scrolls back out
// of range before it finished so the connection pool stays free for what's
// actually on screen.

// Browsers give us ~6 connections per host over HTTP/1.1 and nginx here is
// HTTP/2, but the constraint is bandwidth, not sockets: the item on screen must
// win. Two background transfers is enough to stay ahead of scrolling without
// starving it.
const MAX_CONCURRENT = 2;

// Remembering a URL is cheap; the bytes themselves live in the browser's HTTP
// cache (nginx serves /media with `Cache-Control: public, immutable, 1y`).
// This set only exists to avoid re-issuing a request we know already completed.
const DONE_CAP = 500;

const done = new Set();
const inFlight = new Map(); // url -> { promise, abort }
let queue = []; // [{ url, type }] in priority order, nearest item first

// Respect an explicitly metered connection — pulling full-size originals ahead
// of the viewport is exactly the kind of speculative traffic Data Saver means
// to suppress. Re-read per call: the user can toggle it mid-session.
function bytesBudgetAllowed(type) {
  const c = navigator.connection;
  if (!c) return true;
  if (c.saveData) return false;
  // 2g/slow-2g can't finish a video ahead of time anyway, and trying only
  // steals throughput from the item being watched.
  if (type !== 'image' && (c.effectiveType === 'slow-2g' || c.effectiveType === '2g')) {
    return false;
  }
  return true;
}

function markDone(url) {
  done.add(url);
  if (done.size > DONE_CAP) {
    // Sets iterate in insertion order, so this drops the oldest entries.
    const excess = done.size - DONE_CAP;
    let i = 0;
    for (const u of done) {
      if (i++ >= excess) break;
      done.delete(u);
    }
  }
}

// Images: load through an <img> rather than fetch(), so the browser ends up
// holding a *decoded* bitmap and not just cached bytes. decode() makes the
// difference between a visible decode hitch on scroll and none.
function loadImage(url) {
  const img = new Image();
  let aborted = false;
  const promise = new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.decoding = 'async';
    img.src = url;
  }).then(async (ok) => {
    if (ok && !aborted && img.decode) {
      await img.decode().catch(() => {});
    }
    return ok;
  });
  return {
    promise,
    abort() {
      aborted = true;
      // Documented way to cancel an in-progress image load. Assigning '' would
      // instead re-resolve against the document URL and issue a bogus request.
      img.removeAttribute('src');
    },
  };
}

// Video/audio: stream the response and discard each chunk. Draining the body is
// what commits the response to the HTTP cache; we deliberately don't keep the
// bytes in JS (an arrayBuffer() here would spike memory by the size of the file
// for no benefit, since <video> reads from the cache, not from us).
function loadBytes(url) {
  const ac = new AbortController();
  const promise = fetch(url, { signal: ac.signal, credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok || !res.body) return false;
      const reader = res.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done: finished } = await reader.read();
        if (finished) break;
      }
      return true;
    })
    .catch(() => false);
  return { promise, abort: () => ac.abort() };
}

function drain() {
  while (inFlight.size < MAX_CONCURRENT && queue.length > 0) {
    const { url, type } = queue.shift();
    if (done.has(url) || inFlight.has(url)) continue;

    const task = type === 'image' ? loadImage(url) : loadBytes(url);
    inFlight.set(url, task);
    task.promise
      .then((ok) => { if (ok) markDone(url); })
      .finally(() => {
        inFlight.delete(url);
        drain();
      });
  }
}

/**
 * Declare the current prefetch window. Call this whenever the viewport moves.
 * Anything in flight that is no longer in the window is aborted; anything new
 * is queued in the order given (nearest item first).
 *
 * @param {Array<{url: string, type: string}>} entries
 */
export function setPrefetchWindow(entries) {
  const wanted = new Map();
  for (const e of entries) {
    if (!e || !e.url || done.has(e.url)) continue;
    if (!bytesBudgetAllowed(e.type)) continue;
    if (!wanted.has(e.url)) wanted.set(e.url, e.type);
  }

  // Cancel transfers for items that have scrolled out of the window. Without
  // this a fast scroll leaves a backlog of stale downloads competing with the
  // item the user actually landed on.
  for (const [url, task] of inFlight) {
    if (!wanted.has(url)) {
      task.abort();
      inFlight.delete(url);
    }
  }

  queue = [...wanted].map(([url, type]) => ({ url, type }));
  drain();
}

/** Drops all prefetch state. Used on reshuffle, when the whole feed changes. */
export function resetPrefetcher() {
  for (const [, task] of inFlight) task.abort();
  inFlight.clear();
  queue = [];
  done.clear();
}

/** True once the full file for `url` is in the browser cache. */
export function isPrefetched(url) {
  return done.has(url);
}

// Centralized autoplay coordinator — tracks all registered media elements and
// ensures only the most-visible one plays at any time.

const registrations = new Map(); // key → { ratio, active, play, pause, resume }
let rafId = null;
let watchdogId = null;

const MIN_RATIO = 0.2; // minimum visible fraction required to be eligible to play
const WATCHDOG_MS = 1000;

function flush() {
  rafId = null;
  let bestKey = null;
  let bestRatio = MIN_RATIO;

  for (const [key, reg] of registrations) {
    if (reg.ratio > bestRatio) {
      bestRatio = reg.ratio;
      bestKey = key;
    }
  }

  // Only act on TRANSITIONS.
  //
  // This used to call play() on the winner and pause() on every loser on every
  // single animation frame that any ratio changed. On iOS that was actively
  // harmful: MediaItem's play() handler kicks load() when the element hasn't
  // buffered yet, and each load() aborts the fetch the previous one started —
  // so while scrolling, the video in view was told to restart loading dozens of
  // times a second and never reached readyState 2. It stayed black and silent,
  // which is the "videos stop autoplaying after a while" symptom.
  for (const [key, reg] of registrations) {
    const shouldPlay = key === bestKey;
    if (reg.active === shouldPlay) continue;
    reg.active = shouldPlay;
    if (shouldPlay) reg.play();
    else reg.pause();
  }

  ensureWatchdog();
}

function schedule() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(flush);
}

// iOS reclaims AVPlayer instances under memory pressure and suspends decoding
// when a standalone PWA loses and regains focus, in both cases without firing
// any event we can hook — the element simply ends up paused with the network
// idle. The old per-frame play() call papered over that by accident. Now that
// flush() is edge-triggered, re-assert the active element on a slow timer
// instead: same recovery, without the load() storm above.
function ensureWatchdog() {
  const hasActive = [...registrations.values()].some((r) => r.active);
  if (hasActive && watchdogId === null) {
    watchdogId = setInterval(() => {
      for (const reg of registrations.values()) {
        if (reg.active && reg.resume) reg.resume();
      }
    }, WATCHDOG_MS);
  } else if (!hasActive && watchdogId !== null) {
    clearInterval(watchdogId);
    watchdogId = null;
  }
}

// Register a media element. Returns an updateRatio function to call from
// IntersectionObserver callbacks as the element's visibility changes.
export function registerMedia(key, { play, pause, resume }) {
  registrations.set(key, { ratio: 0, active: false, play, pause, resume });
  return (ratio) => {
    const reg = registrations.get(key);
    if (reg) {
      reg.ratio = ratio;
      schedule();
    }
  };
}

export function unregisterMedia(key) {
  const reg = registrations.get(key);
  if (reg && reg.active) reg.pause();
  registrations.delete(key);
  schedule();
}

// Shared threshold array for all play observers — 6 steps is enough granularity
// to pick the clearly-most-visible video without excessive observer callbacks.
export const PLAY_THRESHOLDS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

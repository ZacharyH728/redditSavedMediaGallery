// Centralized autoplay coordinator — tracks all registered media elements and
// ensures only the most-visible one plays at any time.

const registrations = new Map(); // key → { ratio, play, pause }
let rafId = null;

function flush() {
  rafId = null;
  let bestKey = null;
  let bestRatio = 0.2; // minimum ratio required to be eligible to play

  for (const [key, reg] of registrations) {
    if (reg.ratio > bestRatio) {
      bestRatio = reg.ratio;
      bestKey = key;
    }
  }

  for (const [key, reg] of registrations) {
    if (key === bestKey) {
      reg.play();
    } else {
      reg.pause();
    }
  }
}

function schedule() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(flush);
}

// Register a media element. Returns an updateRatio function to call from
// IntersectionObserver callbacks as the element's visibility changes.
export function registerMedia(key, { play, pause }) {
  registrations.set(key, { ratio: 0, play, pause });
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
  if (reg) reg.pause();
  registrations.delete(key);
  schedule();
}

// Shared threshold array for all play observers — 6 steps is enough granularity
// to pick the clearly-most-visible video without excessive observer callbacks.
export const PLAY_THRESHOLDS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

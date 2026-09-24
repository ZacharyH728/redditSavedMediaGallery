// src/stores/viewReporter.js
//
// Reports which media the user has actually been shown, so the backend can
// offer a "least shown first" order. Batched, fire-and-forget, and completely
// non-blocking: these counts are advisory, so every failure here is swallowed
// rather than surfaced.

import { config } from './config.js';

const BATCH_MAX = 200;
const BATCH_MS = 8000;

// Every id reported this PAGE LOAD. Deliberately not cleared by reshuffle —
// unlike galleryStore's seenIds, which must clear so a new order has no holes.
// Clearing this would let a single reshuffle double-count anything the new
// order happens to surface again a minute later, and the whole point of the
// count is that it reflects distinct viewings.
const counted = new Set();

let pending = [];
let timer = null;

export function reportView(id) {
  if (!id || counted.has(id)) return;
  counted.add(id);
  pending.push(id);
  if (pending.length >= BATCH_MAX) flush();
  else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, BATCH_MS);
}

export function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (pending.length === 0) return;

  const ids = pending;
  pending = [];
  const url = `${config.apiUrl}/views`;
  const body = JSON.stringify({ ids });

  try {
    // text/plain, not application/json, on BOTH paths. A JSON content-type is
    // not CORS-simple, so it triggers a preflight — and a preflight fired from
    // pagehide is routinely dropped by iOS Safari before it completes, which
    // silently loses the batch. This runs as a home-screen PWA, so that is the
    // common case, not an edge case. The backend accepts both types.
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(url, blob)) return;
      // sendBeacon refused (queue full / too large) — fall through to fetch.
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let a reporting failure reach the feed.
  }
}

if (typeof window !== 'undefined') {
  let leaving = false;
  const onLeave = () => {
    if (leaving) return;
    leaving = true;
    flush(true);
    // Re-arm: a hidden PWA is frequently brought back rather than killed.
    setTimeout(() => { leaving = false; }, 0);
  };
  // Both events, because iOS fires visibilitychange far more reliably than
  // pagehide, and the sent-guard above keeps the overlap from double-posting.
  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave();
  });
}

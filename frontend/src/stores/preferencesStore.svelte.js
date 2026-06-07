// src/stores/preferencesStore.svelte.js

// Global state using Svelte 5 Runes
export const audioPreferences = $state({
  muted: true // Default to muted to ensure autoplay works initially
});

// iOS standalone (home screen web app) blocks programmatic video.play() unless
// the call originates from a user gesture. This flag is set on the first touchstart
// so that video elements can prime themselves and become playable by the
// IntersectionObserver afterwards.
export const mediaPolicy = $state({
  unlocked: false
});

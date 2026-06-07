// src/stores/preferencesStore.svelte.js

// Global state using Svelte 5 Runes
export const audioPreferences = $state({
  muted: true // Default to muted to ensure autoplay works initially
});

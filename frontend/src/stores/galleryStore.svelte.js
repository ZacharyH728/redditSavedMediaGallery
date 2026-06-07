// src/stores/galleryStore.svelte.js
import axios from 'axios';
import { config } from './config.js';

function getMediaType(filename, hint) {
  if (hint && ['image', 'video', 'audio'].includes(hint)) return hint;
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
  return 'image';
}

function preloadItems(items) {
  for (const item of items) {
    const type = getMediaType(item.title || '', item.post_hint);
    if (type === 'image') {
      new Image().src = item.url;
    }
    // Videos are not preloaded here — off-screen video elements with preload="auto"
    // saturate the browser's connection pool and starve visible videos of bandwidth.
    // Each MediaItem fetches only metadata on mount and buffers on play().
  }
}

const store = $state({
  posts: [],
  isLoading: false,
  hasMorePosts: true,
  error: null,
  page: 1,
  seed: Date.now(),
  order: 'random', // Default order

  // ACTION: Fetches the NEXT page of media
  async fetchMedia() {
    if (this.isLoading || !this.hasMorePosts) return;

    this.isLoading = true;
    this.error = null;

    try {
      // Pass params to backend: seed, page, and sort order
      const response = await axios.get(`${config.apiUrl}/media`, {
        params: {
          seed: this.seed,
          page: this.page,
          sort: this.order
        }
      });
      
      const newItems = response.data.data.children || [];
      const hasMore = response.data.data.after;

      if (newItems.length > 0) {
        // DEDUPLICATION:
        // Filter out any items that are already in the list.
        // This is a safety net in case the backend shuffle isn't perfect or state gets desynced.
        const uniqueNewItems = newItems.filter(newItem => 
          !this.posts.some(existing => existing.id === newItem.id)
        );

        // Append the new, unique items
        this.posts = [...this.posts, ...uniqueNewItems];

        // Preload media bytes in the background before they're scrolled to
        preloadItems(uniqueNewItems);

        // Prepare for the next page
        this.page += 1;
      }
      
      // Update the "has more" flag based on backend response
      this.hasMorePosts = hasMore;

    } catch (err) {
      console.error('Error fetching media:', err);
      this.error = `Failed to load media: ${err.message}`;
    } finally {
      this.isLoading = false;
    }
  },

  // ACTION: Reshuffles the gallery (new seed, reset page)
  reshuffle() {
    this.posts = [];
    this.hasMorePosts = true;
    this.error = null;
    this.isLoading = false;
    this.page = 1;
    this.seed = Date.now(); // New seed = new random order
    this.fetchMedia();
  },

  // ACTION: Sets the sort order and reloads the gallery
  setOrder(newOrder) {
    this.order = newOrder;
    this.reshuffle();
  },

  // ACTION: Resets the gallery
  clearAndFetch() {
    this.reshuffle();
  },
});

export const galleryStore = store;

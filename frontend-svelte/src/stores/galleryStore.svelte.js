// src/stores/galleryStore.js
import axios from 'axios';
import { config } from './config.js';

// Svelte 5 introduces a new, simpler way to create stores using runes.
// We just create a reactive object with state and actions.
const store = $state({
  posts: [],
  isLoading: true,
  hasMorePosts: true,
  error: null,
  order: 'random',
  page: 0,

  // ACTION: Fetches media from the backend
  async fetchMedia() {
    // Prevent fetching if we're already loading or at the end
    if (this.isLoading && this.posts.length > 0) return;
    if (!this.hasMorePosts) return;

    this.isLoading = true;
    try {
      const response = await axios.get(`${config.apiUrl}/media`, {
        params: { page: this.page, order: this.order },
      });
      const newItems = response.data.data.children || [];

      // If it's the first page, replace the posts. Otherwise, append.
      this.posts = this.page === 0 ? newItems : [...this.posts, ...newItems];
      this.page += 1;
      this.hasMorePosts = !!response.data.data.after;

    } catch (err) {
      console.error('Error fetching media:', err);
      this.error = `Failed to load media: ${err.message}`;
    } finally {
      this.isLoading = false;
    }
  },

  // ACTION: Sets a new order, resets the state, and fetches the first page
  async setOrder(newOrder) {
    this.order = newOrder;
    this.posts = [];
    this.page = 0;
    this.hasMorePosts = true;
    this.error = null;
    this.isLoading = false; // Ensure we are ready to load
    await this.fetchMedia();
  },

  // ACTION: A simple alias for re-shuffling
  async reshuffle() {
    await this.setOrder('random');
  },
});

export const galleryStore = store;

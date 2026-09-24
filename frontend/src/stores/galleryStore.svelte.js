import axios from 'axios';
import { config } from './config.js';
import { resetPrefetcher } from './mediaPrefetcher.js';
import { flush as flushViewReports } from './viewReporter.js';

// Every id this session has ever appended. Deliberately NOT cleared by
// trimFront: the dedupe filter used to compare against `posts`, so as soon as
// an item was evicted off the front of the feed the client lost all memory of
// it and would happily re-append it if the backend ever sent it again. Combined
// with the old unstable pagination, that is how already-seen runs of items
// reappeared further down the scroll. Kept as a plain Set (not $state) — it is
// only ever consulted, never rendered.
let seenIds = new Set();

const store = $state({
  posts: [],
  isLoading: false,
  hasMorePosts: true,
  error: null,
  // Cursor pagination: `cursor` is the id of the last item received, `offset`
  // its position in the ordered view. The server prefers the cursor (exact,
  // survives a mid-session re-index) and only falls back to the offset if that
  // item has since been deleted from the library.
  cursor: null,
  offset: 0,
  seed: Date.now(),
  order: 'random', // Default order: a fresh full-library shuffle each session

  // ACTION: Fetches the NEXT page of media.
  // `retriesLeft` covers the case where a whole page comes back as items this
  // session has already shown (possible right after a library re-index): the
  // feed's "near the end" effect won't re-fire on its own because posts.length
  // didn't change, so keep pulling rather than stalling at the bottom.
  async fetchMedia(retriesLeft = 5) {
    if (this.isLoading || !this.hasMorePosts) return;

    this.isLoading = true;
    this.error = null;

    let appended = 0;
    try {
      const response = await axios.get(`${config.apiUrl}/media`, {
        params: {
          seed: this.seed,
          sort: this.order,
          cursor: this.cursor ?? undefined,
          offset: this.offset,
        }
      });

      const body = response.data.data;
      const newItems = body.children || [];

      // Advance the cursor from the response even if every item turns out to be
      // a duplicate — otherwise the next request asks for the same slice again
      // and the feed deadlocks at the bottom.
      if (body.cursor) this.cursor = body.cursor;
      if (typeof body.offset === 'number') this.offset = body.offset;

      if (newItems.length > 0) {
        // O(n) dedupe against everything seen this session (see seenIds above),
        // not just what's currently mounted.
        const uniqueNewItems = [];
        for (const item of newItems) {
          if (seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          uniqueNewItems.push(item);
        }
        appended = uniqueNewItems.length;
        if (appended > 0) {
          this.posts = [...this.posts, ...uniqueNewItems];
        }
      }

      // Update the "has more" flag based on backend response
      this.hasMorePosts = body.after;

    } catch (err) {
      console.error('Error fetching media:', err);
      this.error = `Failed to load media: ${err.message}`;
    } finally {
      this.isLoading = false;
    }

    if (appended === 0 && this.hasMorePosts && !this.error && retriesLeft > 0) {
      await this.fetchMedia(retriesLeft - 1);
    }
  },

  // ACTION: Drops the oldest `count` posts once they've scrolled far out of
  // view, so a long session doesn't grow the feed (and its height cache) forever.
  // Note this does NOT forget their ids — see seenIds.
  trimFront(count) {
    this.posts = this.posts.slice(count);
  },

  // ACTION: Reshuffles the gallery (new seed, reset pagination)
  reshuffle() {
    // Land the departing session's view reports before a new seed is minted.
    // The backend freezes a count baseline the first time it sees a seed, so
    // anything still sitting in the client's batch would otherwise be counted
    // against the NEW order after that baseline was taken, instead of the old
    // one it actually belongs to.
    flushViewReports();

    this.posts = [];
    this.hasMorePosts = true;
    this.error = null;
    this.isLoading = false;
    this.cursor = null;
    this.offset = 0;
    // A new seed is a genuinely new order over the whole library, so previously
    // shown items are fair game again and must be forgotten — otherwise every
    // reshuffle would return a feed with holes in it.
    seenIds = new Set();
    resetPrefetcher();
    this.seed = Date.now(); // New seed = new random order
    this.fetchMedia();
  },

  // ACTION: Sets the sort order and reloads the gallery.
  // Routing through reshuffle() mints a new seed, which is exactly right for
  // 'least_shown': a new seed means a new frozen count baseline, i.e.
  // "re-evaluate what is least shown as of now".
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

<script>
  import MediaItem from './MediaItem.svelte';
  import GalleryCarousel from './GalleryCarousel.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { galleryStore } from '../stores/galleryStore.svelte.js';

  // This component is now completely "dumb". It just displays the global state.
  let sentinelElement = $state(null);

  // --- Simplified Intersection Observer ---
  // A standard $effect is guaranteed to run AFTER the DOM has been updated.
  // This is the safest way to set up an observer and avoids the race condition.
  $effect(() => {
    if (!sentinelElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When the sentinel is on screen, call the store's action
        if (entries[0].isIntersecting) {
          galleryStore.fetchMedia();
        }
      },
      { 
        threshold: 0.1,
        // Trigger fetch when the sentinel is within 800px of entering the viewport.
        // This effectively "preloads" the next page of content.
        rootMargin: '3000px'
      }
    );

    observer.observe(sentinelElement);
    // Svelte automatically handles cleanup when the effect re-runs or the component unmounts.
    return () => observer.disconnect();
  });
</script>

<!-- The entire template is now just a reflection of the global store -->
{#if galleryStore.isLoading && galleryStore.posts.length === 0}
  <LoadingSpinner />
{:else if galleryStore.error && galleryStore.posts.length === 0}
  <div class="error-message">{galleryStore.error}</div>
{:else}
  <div class="media-feed">
    {#each galleryStore.posts as post (post.id)}
      {#if post.post_hint === 'gallery'}
        <GalleryCarousel {post} />
      {:else}
        <MediaItem {post} />
      {/if}
    {/each}

    {#if galleryStore.hasMorePosts}
      <div class="sentinel" bind:this={sentinelElement}>
        {#if galleryStore.isLoading}
          <LoadingSpinner />
        {/if}
      </div>
    {/if}
    
    {#if !galleryStore.hasMorePosts && galleryStore.posts.length > 0}
      <div class="end-message"><p>You've reached the end of the gallery!</p></div>
    {/if}
  </div>
{/if}

<style>
  .media-feed { display: flex; flex-direction: column; gap: 20px; }
  .end-message { text-align: center; padding: 60px 20px; color: #8b949e; font-size: 18px; }
  .error-message { background-color: #da3333; color: white; padding: 15px; border-radius: 6px; text-align: center; }
  .sentinel { height: 50px; width: 100%; }
</style>

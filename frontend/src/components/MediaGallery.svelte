<script>
  import MediaItem from './MediaItem.svelte';
  import GalleryCarousel from './GalleryCarousel.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { galleryStore } from '../stores/galleryStore.svelte.js';

  const BUFFER = 3000;
  const GAP = 20;
  const DEFAULT_HEIGHT = 600;

  let scrollY = $state(0);
  let vpHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
  let heightCache = new Map();
  let heightVersion = $state(0);

  let rafPending = false;

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      scrollY = window.scrollY;
      rafPending = false;
    });
  }

  function onResize() {
    vpHeight = window.innerHeight;
  }

  $effect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  });

  function trackHeight(el, id) {
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      if (h > 0 && heightCache.get(id) !== h) {
        heightCache.set(id, h);
        heightVersion += 1;
      }
    });
    ro.observe(el);
    return {
      destroy() {
        ro.disconnect();
      }
    };
  }

  const layout = $derived.by(() => {
    heightVersion;
    const posts = galleryStore.posts;
    const result = [];
    let top = 0;
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const height = heightCache.get(post.id) ?? DEFAULT_HEIGHT;
      result.push({ post, top, height });
      top += height + GAP;
    }
    return result;
  });

  const totalHeight = $derived(
    layout.length === 0
      ? 0
      : layout[layout.length - 1].top + layout[layout.length - 1].height
  );

  function findStart(lo, hi) {
    const limit = scrollY - BUFFER;
    let result = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (layout[mid].top + layout[mid].height >= limit) {
        result = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return result;
  }

  function findEnd(lo, hi) {
    const limit = scrollY + vpHeight + BUFFER;
    let result = lo;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (layout[mid].top <= limit) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  const startIdx = $derived(
    layout.length === 0 ? 0 : findStart(0, layout.length - 1)
  );

  const endIdx = $derived(
    layout.length === 0 ? -1 : findEnd(0, layout.length - 1)
  );

  const visibleItems = $derived(
    layout.length === 0 ? [] : layout.slice(startIdx, endIdx + 1)
  );

  const nearEnd = $derived(
    galleryStore.hasMorePosts && endIdx >= galleryStore.posts.length - 5
  );

  $effect(() => {
    if (nearEnd) {
      galleryStore.fetchMedia();
    }
  });
</script>

{#if galleryStore.isLoading && galleryStore.posts.length === 0}
  <LoadingSpinner />
{:else if galleryStore.error && galleryStore.posts.length === 0}
  <div class="error-message">{galleryStore.error}</div>
{:else}
  <div class="virtual-feed" style="height: {totalHeight}px;">
    {#each visibleItems as { post, top } (post.id)}
      <div
        class="item-wrapper"
        style="position: absolute; top: {top}px; left: 0; right: 0;"
        use:trackHeight={post.id}
      >
        {#if post.post_hint === 'gallery'}
          <GalleryCarousel {post} />
        {:else}
          <MediaItem {post} />
        {/if}
      </div>
    {/each}
  </div>

  {#if galleryStore.isLoading && galleryStore.posts.length > 0}
    <LoadingSpinner />
  {/if}

  {#if !galleryStore.hasMorePosts && galleryStore.posts.length > 0}
    <div class="end-message"><p>You've reached the end of the gallery!</p></div>
  {/if}
{/if}

<style>
  .virtual-feed { position: relative; }
  .item-wrapper { box-sizing: border-box; }
  .end-message { text-align: center; padding: 60px 20px; color: #8b949e; font-size: 18px; }
  .error-message { background-color: #da3333; color: white; padding: 15px; border-radius: 6px; text-align: center; }
</style>

<script>
  import { tick } from 'svelte';
  import MediaItem from './MediaItem.svelte';
  import GalleryCarousel from './GalleryCarousel.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { galleryStore } from '../stores/galleryStore.svelte.js';
  import { setPrefetchWindow } from '../stores/mediaPrefetcher.js';
  import { reportView } from '../stores/viewReporter.js';

  const BUFFER = 3000;
  const GAP = 20;
  const DEFAULT_HEIGHT = 600;
  // Once the viewport has scrolled this many items past the front of the feed,
  // drop the oldest batch from state so a long session doesn't grow forever.
  const KEEP_BEHIND = 150;
  const EVICT_BATCH = 100;
  // How many items past the one at the top of the viewport to pull the full
  // file for. Items are roughly one screen tall, so this is "the next few
  // swipes". Going much wider mostly wastes bandwidth on media the user
  // scrolls straight past.
  const PREFETCH_AHEAD = 4;
  // Gallery posts: only the slides the carousel will show without a swipe.
  const PREFETCH_SLIDES = 2;
  // How long an item has to hold the focus position before it counts as shown.
  // A fling-scroll crosses twenty items in about a second and the user saw none
  // of them, so counting on arrival would badly inflate the numbers that the
  // least-shown sort orders against.
  const DWELL_MS = 1000;

  let scrollY = $state(0);
  let vpHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
  let heightCache = new Map();
  let heightVersion = $state(0);

  let rafPending = false;
  let evicting = false;

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

  // Index of the item currently at the top of the viewport. Prefetching is
  // anchored here rather than to endIdx, because endIdx already includes BUFFER
  // (3000px) worth of mounted-but-offscreen items — anchoring there would start
  // prefetching only *past* the items the user is about to reach.
  function findFocus(lo, hi) {
    let result = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (layout[mid].top + layout[mid].height > scrollY) {
        result = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return result;
  }

  const focusIdx = $derived(
    layout.length === 0 ? 0 : findFocus(0, layout.length - 1)
  );

  function collectMedia(post, out) {
    if (post.post_hint === 'gallery') {
      for (const item of (post.items ?? []).slice(0, PREFETCH_SLIDES)) {
        out.push({ url: item.url, type: item.post_hint === 'video' ? 'video' : 'image' });
      }
    } else if (post.post_hint === 'video') {
      out.push({ url: post.url, type: 'video' });
    } else if (post.post_hint === 'image') {
      out.push({ url: post.url, type: 'image' });
    }
    // Audio is left out: it streams fine and there's no visual pop-in to hide.
  }

  const prefetchWindow = $derived.by(() => {
    const out = [];
    const last = Math.min(layout.length - 1, focusIdx + PREFETCH_AHEAD);
    // Nearest-first, so the queue drains in the order the user will reach them.
    for (let i = focusIdx + 1; i <= last; i++) {
      collectMedia(layout[i].post, out);
    }
    return out;
  });

  $effect(() => {
    setPrefetchWindow(prefetchWindow);
  });

  // Drop the oldest EVICT_BATCH posts once we're comfortably past them,
  // compensating scroll position so the viewport doesn't jump. KEEP_BEHIND
  // leaves enough slack that scrolling back up a bit doesn't run into the
  // evicted edge.
  async function evictFront(removeCount, shiftAmount, idsToForget) {
    evicting = true;
    for (const id of idsToForget) heightCache.delete(id);
    galleryStore.trimFront(removeCount);
    await tick(); // let the DOM re-layout against the shorter array first
    window.scrollBy(0, -shiftAmount);
    evicting = false;
  }

  $effect(() => {
    if (evicting || startIdx <= KEEP_BEHIND + EVICT_BATCH) return;

    const idsToForget = layout.slice(0, EVICT_BATCH).map(({ post }) => post.id);
    const shiftAmount = layout[EVICT_BATCH].top;
    evictFront(EVICT_BATCH, shiftAmount, idsToForget);
  });

  // --- "This was actually shown" tracking ---
  //
  // Anchored on focusIdx (the item at the top of the viewport), NOT on
  // visibleItems/endIdx — those carry BUFFER (3000px) worth of mounted but
  // never-seen items, and counting those would be flatly wrong.
  //
  // Keyed on the ID rather than on focusIdx or layout: `layout` is recomputed
  // on every ResizeObserver height measurement (heightVersion), so an effect
  // reading it would restart the dwell timer constantly and never fire.
  // $derived doesn't notify dependents when the new value is === the old, so a
  // string id is a stable gate — and it survives trimFront, which shifts every
  // index but no id. Gallery posts count once per group, since post.id is the
  // group id and carousel slide changes don't touch it.
  const focusId = $derived(layout[focusIdx]?.post?.id ?? null);

  $effect(() => {
    const id = focusId;
    if (!id) return;
    const t = setTimeout(() => reportView(id), DWELL_MS);
    return () => clearTimeout(t);
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

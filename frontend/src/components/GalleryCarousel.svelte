<script>
  import { registerMedia, unregisterMedia, PLAY_THRESHOLDS } from '../stores/videoPlayManager.js';

  let { post } = $props();

  let containerEl = $state(null);
  let currentIndex = $state(0);
  let showTitle = $state(false);
  let srcAttached = $state(false);
  let carouselInView = $state(false);
  const totalItems = post.items?.length ?? 0;

  // Plain (non-reactive) map of video DOM elements — used only for imperative
  // pause/load calls. A Svelte action populates this on element mount.
  const videoRefs = {};
  function videoRef(el, index) {
    videoRefs[index] = el;
    return { destroy() { delete videoRefs[index]; } };
  }

  // Near-viewport observer: attach/detach video sources to free decoder + buffer +
  // connection slots. Mirrors the same pattern used in MediaItem for single videos.
  $effect(() => {
    if (!containerEl) return;
    const nearObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        srcAttached = true;
      } else {
        srcAttached = false;
        // Force immediate release — Svelte's reactive src removal lands next tick,
        // so we also call pause/load directly to free the decoder slot right now.
        Object.values(videoRefs).forEach(el => {
          if (!el) return;
          el.pause();
          el.removeAttribute('src');
          el.load();
        });
      }
    }, { rootMargin: '800px' });
    nearObserver.observe(containerEl);
    return () => nearObserver.disconnect();
  });

  // Play manager registration: coordinates with all other media so only the
  // most-visible item plays. Sets carouselInView which the slide-play effect reads.
  $effect(() => {
    if (!containerEl) return;
    const updateRatio = registerMedia(containerEl, {
      play: () => { carouselInView = true; },
      pause: () => { carouselInView = false; },
    });
    const observer = new IntersectionObserver(
      (entries) => updateRatio(entries[0].intersectionRatio),
      { threshold: PLAY_THRESHOLDS }
    );
    observer.observe(containerEl);
    return () => {
      observer.disconnect();
      unregisterMedia(containerEl);
    };
  });

  // React to visibility + slide changes: pause all, play only the current slide if visible.
  $effect(() => {
    const shouldPlay = carouselInView && srcAttached;
    Object.entries(videoRefs).forEach(([idx, el]) => {
      if (!el) return;
      if (parseInt(idx) === currentIndex && shouldPlay) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    });
  });

  function goTo(index) {
    if (index < 0 || index >= totalItems) return;
    currentIndex = index;
  }
  function prev(e) { e.stopPropagation(); goTo(currentIndex - 1); }
  function next(e) { e.stopPropagation(); goTo(currentIndex + 1); }
  function jumpTo(e, i) { e.stopPropagation(); goTo(i); }

  let touchStartX = 0;
  function handleTouchStart(e) { touchStartX = e.touches[0].clientX; }
  function handleTouchEnd(e) {
    e.preventDefault();
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      goTo(dx < 0 ? currentIndex + 1 : currentIndex - 1);
    } else if (Math.abs(dx) < 5) {
      showTitle = !showTitle;
    }
  }

  function handleClick() { showTitle = !showTitle; }

  let imageErrors = $state({});
  function handleImageError(i) { imageErrors = { ...imageErrors, [i]: true }; }

  // Track which slides have had their src attached. Once loaded, a slide stays loaded
  // so navigating back doesn't trigger a re-fetch. Only loads current ±1 slides.
  let slideLoaded = $state(new Array(totalItems).fill(false));
  $effect(() => {
    if (!srcAttached) return;
    for (let offset = -1; offset <= 1; offset++) {
      const idx = currentIndex + offset;
      if (idx >= 0 && idx < totalItems) slideLoaded[idx] = true;
    }
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gallery-item" bind:this={containerEl} onclick={handleClick}>
  <div class="carousel-outer">
    <!--
      Transform-based positioning — no overflow-x scroll.
      .carousel-outer clips at its width; the track translates left to reveal each slide.
      100% widths on slides resolve to the track's declared width (= outer width),
      which is unambiguous on all browsers including iOS Safari.
    -->
    <div
      class="carousel-track"
      style="transform: translateX(-{currentIndex * 100}%)"
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      {#each post.items ?? [] as item, i}
        <div class="slide">
          {#if imageErrors[i]}
            <div class="slide-error">
              <span>⚠️</span>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <a href={item.url} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>Open file</a>
            </div>
          {:else if item.post_hint === 'video'}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              use:videoRef={i}
              src={srcAttached && slideLoaded[i] ? item.url : undefined}
              class="slide-media"
              preload="metadata"
              loop
              playsinline
              muted
              controls
              onerror={() => handleImageError(i)}
            ></video>
          {:else}
            <img
              src={srcAttached && slideLoaded[i] ? item.url : undefined}
              alt=""
              class="slide-media"
              decoding="async"
              onerror={() => handleImageError(i)}
            />
          {/if}
        </div>
      {/each}
    </div>

    {#if currentIndex > 0}
      <button class="nav-btn prev-btn" onclick={prev}>&#8249;</button>
    {/if}
    {#if currentIndex < totalItems - 1}
      <button class="nav-btn next-btn" onclick={next}>&#8250;</button>
    {/if}

    {#if totalItems > 1}
      <div class="indicator">
        {#if totalItems <= 8}
          <div class="dots">
            {#each post.items ?? [] as _, i}
              <button class="dot" class:active={i === currentIndex} onclick={(e) => jumpTo(e, i)}></button>
            {/each}
          </div>
        {:else}
          <span class="counter">{currentIndex + 1} / {totalItems}</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if showTitle}
    <div class="gallery-info">
      <h3 class="post-title">{post.title || 'Untitled'}</h3>
      <span class="item-count">{totalItems} images</span>
    </div>
  {/if}
</div>

<style>
  .gallery-item {
    background-color: #0d1117;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #30363d;
    content-visibility: auto;
    contain-intrinsic-size: auto 400px;
  }
  .carousel-outer {
    position: relative;
    width: 100%;
    overflow: hidden;
  }
  .carousel-track {
    display: flex;
    width: 100%;
    transition: transform 0.3s ease;
    touch-action: pan-y;
    will-change: transform;
  }
  .slide {
    width: 100%;
    flex-shrink: 0;
    background-color: #161b22;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }
  .slide-media { max-width: 100%; max-height: 80vh; width: 100%; height: auto; object-fit: contain; display: block; }
  .slide-error { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #8b949e; font-size: 14px; padding: 20px; }
  .slide-error a { color: #58a6ff; text-decoration: none; border: 1px solid #30363d; padding: 4px 10px; border-radius: 6px; }
  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.55);
    color: white;
    border: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 28px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }
  .nav-btn:hover { background: rgba(0, 0, 0, 0.8); }
  .prev-btn { left: 10px; }
  .next-btn { right: 10px; }
  .indicator {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }
  .dots { display: flex; gap: 6px; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s;
  }
  .dot.active { background: white; }
  .counter { background: rgba(0, 0, 0, 0.6); color: white; padding: 3px 10px; border-radius: 12px; font-size: 13px; }
  .gallery-info { padding: 15px; display: flex; justify-content: space-between; align-items: center; }
  .post-title { font-size: 16px; font-weight: 500; color: #c9d1d9; margin: 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-count { font-size: 13px; color: #8b949e; white-space: nowrap; margin-left: 12px; }
</style>

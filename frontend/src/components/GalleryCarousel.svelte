<script>
  let { post } = $props();

  let trackEl = $state(null);
  let currentIndex = $state(0);
  let showTitle = $state(false);
  // Explicit pixel width measured via ResizeObserver — avoids the iOS Safari bug
  // where percentage widths inside overflow-x containers resolve to scroll-content
  // width instead of the visible container width.
  let slideWidthPx = $state(0);

  const totalItems = post.items?.length ?? 0;

  $effect(() => {
    if (!trackEl) return;
    const ro = new ResizeObserver(entries => {
      slideWidthPx = entries[0].contentRect.width;
    });
    ro.observe(trackEl);
    return () => ro.disconnect();
  });

  let scrollTimer = null;
  function handleScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!trackEl || slideWidthPx === 0) return;
      currentIndex = Math.max(0, Math.min(Math.round(trackEl.scrollLeft / slideWidthPx), totalItems - 1));
    }, 50);
  }

  function goTo(index) {
    if (!trackEl || index < 0 || index >= totalItems) return;
    currentIndex = index;
    trackEl.scrollTo({ left: index * slideWidthPx, behavior: 'smooth' });
  }

  function prev(e) { e.stopPropagation(); goTo(currentIndex - 1); }
  function next(e) { e.stopPropagation(); goTo(currentIndex + 1); }
  function jumpTo(e, i) { e.stopPropagation(); goTo(i); }

  // Distinguish a tap from a swipe so the title only toggles on taps.
  // iOS fires a click event after a scroll gesture ends, which would otherwise
  // toggle the title every time the user swipes between slides.
  let scrollLeftAtPointerDown = 0;
  function handlePointerDown() {
    scrollLeftAtPointerDown = trackEl?.scrollLeft ?? 0;
  }
  function handleClick() {
    const delta = Math.abs((trackEl?.scrollLeft ?? 0) - scrollLeftAtPointerDown);
    if (delta < 5) showTitle = !showTitle;
  }

  let imageErrors = $state({});
  function handleImageError(index) {
    imageErrors = { ...imageErrors, [index]: true };
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gallery-item" onpointerdown={handlePointerDown} onclick={handleClick}>
  <div class="carousel-wrapper">
    <div class="carousel-track" bind:this={trackEl} onscroll={handleScroll}>
      {#each post.items ?? [] as item, i}
        <div class="slide" style="width: {slideWidthPx}px; min-width: {slideWidthPx}px">
          {#if imageErrors[i]}
            <div class="slide-error">
              <span>⚠️</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>Open file</a>
            </div>
          {:else if item.post_hint === 'video'}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              src={item.url}
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
              src={item.url}
              alt=""
              class="slide-media"
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
  }
  .carousel-wrapper { position: relative; width: 100%; overflow: hidden; }
  .carousel-track {
    display: flex;
    overflow-x: scroll;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .carousel-track::-webkit-scrollbar { display: none; }
  .slide {
    flex-shrink: 0;
    scroll-snap-align: start;
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
  .counter {
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 13px;
  }
  .gallery-info { padding: 15px; display: flex; justify-content: space-between; align-items: center; }
  .post-title { font-size: 16px; font-weight: 500; color: #c9d1d9; margin: 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-count { font-size: 13px; color: #8b949e; white-space: nowrap; margin-left: 12px; }
</style>

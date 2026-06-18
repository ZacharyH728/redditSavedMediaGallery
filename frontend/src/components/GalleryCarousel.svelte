<script>
  let { post } = $props();

  let trackEl = $state(null);
  let currentIndex = $state(0);
  let showTitle = $state(false);

  const totalItems = post.items.length;

  let scrollTimer = null;
  function handleScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!trackEl) return;
      const slideWidth = trackEl.offsetWidth;
      if (slideWidth === 0) return;
      currentIndex = Math.max(0, Math.min(Math.round(trackEl.scrollLeft / slideWidth), totalItems - 1));
    }, 50);
  }

  function goTo(index) {
    if (!trackEl || index < 0 || index >= totalItems) return;
    currentIndex = index;
    trackEl.scrollTo({ left: index * trackEl.offsetWidth, behavior: 'smooth' });
  }

  function prev(e) { e.stopPropagation(); goTo(currentIndex - 1); }
  function next(e) { e.stopPropagation(); goTo(currentIndex + 1); }
  function jumpTo(e, i) { e.stopPropagation(); goTo(i); }
  function toggleTitle() { showTitle = !showTitle; }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gallery-item" onclick={toggleTitle}>
  <div class="carousel-wrapper">
    <div class="carousel-track" bind:this={trackEl} onscroll={handleScroll}>
      {#each post.items as item}
        <div class="slide">
          {#if item.post_hint === 'video'}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              src={item.url}
              class="slide-media"
              preload="metadata"
              loop
              playsinline
              muted
              controls
            ></video>
          {:else}
            <img
              src={item.url}
              alt={item.title || ''}
              class="slide-media"
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
            {#each post.items as _, i}
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
    contain-intrinsic-size: auto 500px;
  }
  .carousel-wrapper { position: relative; width: 100%; overflow: hidden; }
  .carousel-track {
    display: flex;
    overflow-x: scroll;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    width: 100%;
  }
  .carousel-track::-webkit-scrollbar { display: none; }
  .slide {
    /* min-width instead of flex-basis % avoids an iOS Safari bug where
       flex: 0 0 100% inside an overflow container resolves incorrectly */
    min-width: 100%;
    width: 100%;
    flex-shrink: 0;
    scroll-snap-align: start;
    background-color: #161b22;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }
  .slide-media { max-width: 100%; max-height: 80vh; width: 100%; height: auto; object-fit: contain; display: block; }
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

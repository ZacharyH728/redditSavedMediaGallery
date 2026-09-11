<script>
  import { audioPreferences } from '../stores/preferencesStore.svelte.js';
  import { registerMedia, unregisterMedia, PLAY_THRESHOLDS } from '../stores/videoPlayManager.js';
  import { config } from '../stores/config.js';

  let { post } = $props();
  const fullUrl = post.url;
  const thumbnailUrl = post.thumbnail_url ? `${config.apiUrl}${post.thumbnail_url}` : null;

  function getMediaType(filename, hint) {
    if (hint && ['image', 'video', 'audio'].includes(hint)) return hint;
    const ext = filename.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
    return 'image';
  }

  const mediaType = getMediaType(post.title || '', post.post_hint);
  const isAnimatedImage = mediaType === 'image' && /\.gif$/i.test(post.title || post.url || '');

  let hasError = $state(false);
  let showTitle = $state(false);
  let showControls = $state(false);

  let itemElement = $state(null);
  let mediaElement = $state(null);
  let mediaContentElement = $state(null);
  // Height reserved when src is detached, cleared once media reloads
  let reservedHeight = $state(null);

  // Sync with global mute state
  $effect(() => {
    if (mediaElement && mediaType === 'video') {
      mediaElement.muted = audioPreferences.muted;
    }
  });

  // Handle user toggling mute on this specific video
  function handleVolumeChange(e) {
    if (mediaType === 'video') {
      // Update global state, which will trigger the effect above for ALL videos
      // preventing "race conditions" where one stays muted.
      audioPreferences.muted = e.target.muted;
    }
  }

  // Track viewport visibility so canplay handler knows whether to start playback
  let isVisible = false;
  // Set when the user pauses via the native controls, so the suspension
  // watchdog below doesn't fight them and restart playback a second later.
  let userPaused = false;
  // Guards the load() kick to once per src attach — see attemptPlay().
  let loadKicked = false;
  // Controls whether the video src is attached. Off-screen videos detach src
  // to release decoder/connection slots — browsers cap simultaneous video
  // elements, and without this, scrolling far enough makes new videos fail to load.
  let srcAttached = $state(false);

  // Fully hands the element's media resource back to the OS. On iOS a <video>
  // holds an AVPlayer, and the supply of those is small and global; simply
  // dropping the element from the DOM (which is what the virtual feed does once
  // an item scrolls past its buffer) does NOT reliably release one — it leaks
  // until GC gets around to it. After enough scrolling every slot is held by an
  // unmounted element and new videos silently never load. This is the main
  // reason autoplay died partway down the feed on iOS, and why it got worse the
  // longer the session ran.
  function releaseVideo(el) {
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch { /* element already torn down */ }
  }

  // Near-viewport observer: attach/detach src to free decoder + buffer + connection slots.
  // Also applies to animated GIFs — their decoded frame buffer is large and the animation
  // loop keeps running off-screen, so detaching src reclaims memory and stops the loop.
  // Observes the outer item element so it works correctly with content-visibility: auto.
  //
  // The margin is deliberately larger than one screen: at 800px the next video
  // only began loading once it was almost in view, which on a phone meant
  // arriving at a black frame every time. The prefetcher has usually already
  // pulled the file into the HTTP cache by now, so attaching early is cheap.
  $effect(() => {
    if (!itemElement) return;
    if (mediaType !== 'video' && !isAnimatedImage) return;

    const nearObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        reservedHeight = null;
        loadKicked = false;
        userPaused = false;
        srcAttached = true;
      } else {
        // Snapshot height before detaching so the container doesn't collapse
        reservedHeight = mediaContentElement?.offsetHeight ?? null;
        srcAttached = false;
        if (mediaType === 'video') releaseVideo(mediaElement);
        // For <img>, Svelte's reactive src={...} re-render handles detach.
      }
    }, { rootMargin: '1600px' });

    nearObserver.observe(itemElement);
    return () => nearObserver.disconnect();
  });

  // Release the media resource when this item is unmounted by the virtual feed,
  // not just when it crosses the observer margin. Scrolling fast enough (or an
  // eviction from trimFront) can destroy the component without the observer
  // ever reporting a non-intersecting entry, which is exactly how slots leaked.
  $effect(() => {
    if (mediaType !== 'video') return;
    const el = mediaElement;
    return () => releaseVideo(el);
  });

  // Starts playback, tolerating the two ways iOS refuses.
  async function attemptPlay() {
    const el = mediaElement;
    if (!el || !isVisible || userPaused) return;

    // muted must be set BEFORE play() on iOS, or the gesture check reads the
    // pre-assignment value and rejects.
    el.muted = audioPreferences.muted;

    // iOS suspends metadata-preloaded videos (readyState stays at HAVE_METADATA
    // and networkState goes idle), so a bare play() rejects and never resumes
    // the download — leaving the element black until a tap. One load() forces it
    // to fetch enough data to actually start; handleCanPlay then plays it.
    // Strictly once per attach: repeated load() calls abort each other's fetch
    // and the element never reaches a playable readyState.
    if (!loadKicked && el.readyState < 2 && el.networkState !== 2 /* NETWORK_LOADING */) {
      loadKicked = true;
      el.load();
    }

    try {
      await el.play();
    } catch {
      if (!isVisible || userPaused) return;
      // Unmuted autoplay needs a fresh user gesture per element on iOS. Once
      // the user unmutes one video, audioPreferences.muted is false for the
      // whole session, so every *subsequent* item's play() rejects with
      // NotAllowedError and sits there black — autoplay appears to just stop
      // working from that point on. Fall back to muted playback and put the
      // global preference back, so the next item doesn't repeat the failure.
      if (!el.muted) {
        audioPreferences.muted = true;
        el.muted = true;
        try { await el.play(); } catch { /* genuinely can't play */ }
      }
    }
  }

  // Play manager registration: only the most-visible media element plays at any time.
  // This prevents multiple videos from playing simultaneously when scrolling quickly
  // causes two items to cross the visibility threshold at the same moment.
  $effect(() => {
    if (!itemElement || mediaType !== 'video') return;

    const updateRatio = registerMedia(itemElement, {
      play: () => {
        isVisible = true;
        userPaused = false;
        attemptPlay();
      },
      pause: () => {
        isVisible = false;
        mediaElement?.pause();
      },
      // Called on a slow timer while this is the active item. Recovers from the
      // iOS suspensions that stop playback without firing any event.
      resume: () => {
        const el = mediaElement;
        if (!el || !isVisible || userPaused || !el.paused) return;
        attemptPlay();
      },
    });

    const observer = new IntersectionObserver(
      (entries) => updateRatio(entries[0].intersectionRatio),
      { threshold: PLAY_THRESHOLDS }
    );
    observer.observe(itemElement);
    return () => {
      observer.disconnect();
      unregisterMedia(itemElement);
    };
  });

  // Retry play when buffered data arrives — fixes videos stuck in loading state.
  // The intersection observer's play() call can fail if the video hasn't buffered yet;
  // this fires once the browser has enough data and resumes if still in viewport.
  // Bound to both `loadeddata` and `canplay`: iOS often fires `loadeddata`
  // (HAVE_CURRENT_DATA) but suspends before reaching `canplay` (HAVE_FUTURE_DATA),
  // so `loadeddata` is the earlier, more reliable hook to (re)start muted autoplay.
  function handleCanPlay() {
    attemptPlay();
  }

  // Only a pause that happens while the native controls are on screen can have
  // come from the user; ours always happen with them hidden.
  function handlePause() {
    if (showControls) userPaused = true;
  }

  function handlePlay() {
    userPaused = false;
  }

  function handleError() {
    hasError = true;
  }

  function toggleTitle() {
    showTitle = !showTitle;
  }

  function handleVideoClick(e) {
    if (!showControls) {
      e.preventDefault();
      e.stopPropagation();
      showControls = true;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="media-item" bind:this={itemElement} onclick={toggleTitle}>
  <div class="media-content" bind:this={mediaContentElement} style={reservedHeight ? `min-height: ${reservedHeight}px` : ''}>
    {#if hasError}
      <div class="error-fallback">
        <span class="error-icon">⚠️</span>
        <p>Media could not be loaded</p>
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" class="download-link">
          Open original file
        </a>
      </div>
    {:else if mediaType === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!--
        preload="auto", not "metadata": src is only ever attached when the item
        is within ~1600px of the viewport, so by the time this element has a src
        at all we DO want the whole thing buffered. "metadata" was asking the
        browser to stop after the moov atom and then hoping play() would restart
        the download, which is precisely the request iOS suspends.
      -->
      <video
        bind:this={mediaElement}
        src={srcAttached ? fullUrl : undefined}
        poster={thumbnailUrl ?? undefined}
        controls={showControls}
        class="centered-media"
        preload="auto"
        loop
        playsinline
        muted={audioPreferences.muted}
        onvolumechange={handleVolumeChange}
        onerror={handleError}
        onclick={handleVideoClick}
        oncanplay={handleCanPlay}
        onloadeddata={handleCanPlay}
        onpause={handlePause}
        onplay={handlePlay}
      ></video>
    {:else if mediaType === 'audio'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <audio 
        src={fullUrl} 
        controls 
        class="centered-media audio-player"
        onerror={handleError}
      ></audio>
    {:else if isAnimatedImage}
      <img
        bind:this={mediaElement}
        src={srcAttached ? fullUrl : undefined}
        alt={post.title}
        class="centered-media"
        onerror={handleError}
      />
    {:else}
      <!--
        Renders the ORIGINAL file, not the 640/800px thumbnail. The feed used to
        show the thumbnail, which made the prefetcher pointless (it would be
        warming bytes nothing displays) and meant you were never actually
        looking at the media. The thumbnail is kept as the error fallback, since
        it exists for anything ffmpeg could decode.

        No loading="lazy": the virtual feed only mounts items that are already
        near the viewport, and the prefetcher has typically pulled this file
        already, so lazy loading would just defer a paint that could be instant.
      -->
      <img
        src={fullUrl}
        alt={post.title}
        class="centered-media"
        decoding="async"
        onerror={(e) => {
          if (thumbnailUrl && e.target.src !== thumbnailUrl) {
            e.target.src = thumbnailUrl;
          } else {
            handleError();
          }
        }}
      />
    {/if}
  </div>
  {#if showTitle}
    <div class="media-info">
      <h3 class="post-title">{post.title || 'Untitled'}</h3>
    </div>
  {/if}
</div>

<style>
  .media-item {
    background-color: #0d1117;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #30363d;
    content-visibility: auto;
    contain-intrinsic-size: auto 400px;
  }
  .media-content { background-color: #161b22; display: flex; justify-content: center; align-items: center; min-height: 200px; }
  .centered-media { max-width: 100%; max-height: 80vh; width: 100%; height: auto; object-fit: contain; display: block; }
  .audio-player { width: 90%; height: 50px; margin: 20px 0; }
  .error-fallback { display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8b949e; gap: 10px; text-align: center; padding: 20px; }
  .error-icon { font-size: 24px; }
  .download-link { color: #58a6ff; text-decoration: none; font-size: 14px; border: 1px solid #30363d; padding: 5px 10px; border-radius: 6px; }
  .media-info { padding: 15px; }
  .post-title { font-size: 16px; font-weight: 500; color: #c9d1d9; margin: 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

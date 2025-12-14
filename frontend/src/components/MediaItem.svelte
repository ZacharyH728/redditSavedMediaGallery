<script>
  import { audioPreferences } from '../stores/preferencesStore.svelte.js';

  let { post } = $props();
  const fullUrl = post.url;

  function getMediaType(filename, hint) {
    if (hint && ['image', 'video', 'audio'].includes(hint)) return hint;
    const ext = filename.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
    return 'image';
  }

  const mediaType = getMediaType(post.title || '', post.post_hint);
  
  let hasError = $state(false);
  let showTitle = $state(false);
  
  // Optimization: Reference to the video DOM element
  let mediaElement = $state(null);

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

  // Optimization: Intersection Observer for Auto-Play/Pause
  $effect(() => {
    if (!mediaElement || mediaType !== 'video') return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        // Play when visible
        mediaElement.play().catch(() => {
             // Browser might block autoplay until user interacts with DOM
        });
      } else {
        // Pause immediately when out of view
        mediaElement.pause();
      }
    }, { threshold: 0.25 }); // 25% visible to start playing

    observer.observe(mediaElement);
    return () => observer.disconnect();
  });

  function handleError() {
    hasError = true;
  }

  function toggleTitle() {
    showTitle = !showTitle;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="media-item" onclick={toggleTitle}>
  <div class="media-content">
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
      <video 
        bind:this={mediaElement}
        src={fullUrl} 
        controls 
        class="centered-media" 
        preload="metadata"
        loop
        playsinline
        muted={audioPreferences.muted}
        onvolumechange={handleVolumeChange}
        onerror={handleError}
      ></video>
    {:else if mediaType === 'audio'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <audio 
        src={fullUrl} 
        controls 
        class="centered-media audio-player"
        onerror={handleError}
      ></audio>
    {:else}
      <img 
        src={fullUrl} 
        alt={post.title} 
        class="centered-media" 
        loading="lazy" 
        onerror={handleError}
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
    contain-intrinsic-size: 500px; 
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

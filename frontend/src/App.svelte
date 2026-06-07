<script>
  import Header from './components/Header.svelte';
  import MediaGallery from './components/MediaGallery.svelte';
  import { galleryStore } from './stores/galleryStore.svelte.js';
  import { mediaPolicy } from './stores/preferencesStore.svelte.js';
  import { onMount } from 'svelte';

  // This is the correct way to use $derived.
  // It MUST be a top-level constant declaration.
  const isRandomOrder = $derived(galleryStore.order === 'random');

  onMount(() => {
    if (galleryStore.posts.length === 0) {
      galleryStore.fetchMedia();
    }

    // In iOS standalone (home screen web app) mode, video.play() is blocked
    // unless called from within a user gesture. Capture the first touchstart
    // so that MediaItem components can prime themselves and become playable.
    function unlockMedia() {
      mediaPolicy.unlocked = true;
    }
    document.addEventListener('touchstart', unlockMedia, { once: true, capture: true });
    return () => document.removeEventListener('touchstart', unlockMedia, true);
  });

  function handleReshuffle() {
    galleryStore.reshuffle();
  }

  function toggleOrderMode() {
    const newOrder = galleryStore.order === 'random' ? 'date' : 'random';
    galleryStore.setOrder(newOrder);
  }
</script>

<div class="app">
  <Header 
    {isRandomOrder}
    onToggleOrder={toggleOrderMode}
    onReshuffle={handleReshuffle}
  />
  
  <main class="app-content">
    <MediaGallery />
  </main>
  
  <footer class="app-footer">
    <p>Local Media Gallery &copy; {new Date().getFullYear()}</p>
  </footer>
</div>

<style>
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background-color: #0d1117;
    color: #c9d1d9;
  }
  .app { display: flex; flex-direction: column; min-height: 100vh; }
  .app-content { flex: 1; padding: 20px; max-width: 1200px; margin: 0 auto; width: 100%; }
  .app-footer { background-color: #161b22; padding: 20px; text-align: center; border-top: 1px solid #30363d; }

  @media (max-width: 768px) {
    .app-content {
      padding: 0;
    }
  }
</style>

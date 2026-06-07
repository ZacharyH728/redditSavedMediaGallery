<script>
  import Header from './components/Header.svelte';
  import MediaGallery from './components/MediaGallery.svelte';
  import { galleryStore } from './stores/galleryStore.svelte.js';
  import { onMount } from 'svelte';

  // This is the correct way to use $derived.
  // It MUST be a top-level constant declaration.
  const isRandomOrder = $derived(galleryStore.order === 'random');

  onMount(() => {
    if (galleryStore.posts.length === 0) {
      galleryStore.fetchMedia();
    }

    // iOS standalone (home screen web app) blocks video.play() unless the call
    // originates synchronously from a user gesture. $effect is async (microtask),
    // so reactive state changes can't be used here. Instead, call play() directly
    // on all video elements while still inside the touchstart handler stack.
    // This primes each element; WebKit then allows the IntersectionObserver's
    // play() calls on those same elements for the rest of the session.
    function unlockVideos() {
      document.querySelectorAll('video').forEach(video => {
        video.play().then(() => video.pause()).catch(() => {});
      });
    }
    document.addEventListener('touchstart', unlockVideos, { once: true, capture: true });
    return () => document.removeEventListener('touchstart', unlockVideos, true);
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

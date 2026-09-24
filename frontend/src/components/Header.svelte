<script>
  let { order, onCycleOrder, onReshuffle } = $props();

  // What the button advances to, and how the current order is labelled. Kept
  // together here so the cycle and the label can't drift apart.
  const ORDERS = {
    random:      { icon: '🔀', text: 'Random',      next: 'least_shown', title: 'Switch to Least Shown' },
    least_shown: { icon: '👁️', text: 'Least Shown', next: 'date',        title: 'Switch to Default Order' },
    date:        { icon: '➡️', text: 'Default',     next: 'random',      title: 'Switch to Random Order' },
  };

  const current = $derived(ORDERS[order] ?? ORDERS.random);
  // Both of these are seed-dependent, so Shuffle is meaningful in both. For
  // least_shown it rerolls the tie-break among equally-shown items and
  // re-baselines the counts against everything recorded since.
  const canReshuffle = $derived(order === 'random' || order === 'least_shown');

  let lastScrollY = $state(0);
  let isHidden = $state(false);
  let scrollUpDistance = 0; // Track how far we've scrolled up

  const SCROLL_THRESHOLD = 50; // Pixels to scroll up before showing header

  function handleScroll() {
    const currentScrollY = window.scrollY;
    const direction = currentScrollY > lastScrollY ? 'down' : 'up';
    
    // Always show if we are at the very top
    if (currentScrollY < 10) {
      isHidden = false;
      scrollUpDistance = 0;
      lastScrollY = currentScrollY;
      return;
    }

    if (direction === 'down') {
      // If scrolling down, hide immediately and reset up-counter
      if (currentScrollY > 60) {
        isHidden = true;
      }
      scrollUpDistance = 0;
    } else {
      // If scrolling up, accumulate distance
      scrollUpDistance += (lastScrollY - currentScrollY);
      
      // Only show if we've scrolled up enough
      if (scrollUpDistance > SCROLL_THRESHOLD) {
        isHidden = false;
      }
    }
    
    lastScrollY = currentScrollY;
  }
</script>

<svelte:window onscroll={handleScroll} />

<header class="app-header" class:hidden={isHidden}>
  <div class="header-logo">Reddit Saved Media Gallery</div>
  
  <div class="header-controls">
    <button
      class="header-button order-toggle-button"
      class:random-active={order === 'random'}
      class:least-shown-active={order === 'least_shown'}
      class:default-active={order === 'date'}
      onclick={() => onCycleOrder(current.next)}
      title={current.title}
    >
      <span class="button-icon">{current.icon}</span>
      <span class="button-text">{current.text}</span>
    </button>

    {#if canReshuffle}
      <button
        class="header-button reshuffle-button"
        onclick={onReshuffle}
        title="Shuffle Again"
      >
        <span class="button-icon">🔄</span>
        <span class="button-text">Shuffle</span>
      </button>
    {/if}
  </div>
</header>

<style>
  .app-header { 
    background-color: #161b22; 
    padding: 15px 30px; 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    border-bottom: 1px solid #30363d; 
    position: sticky; 
    top: 0; 
    z-index: 100; 
    transition: transform 0.3s ease-in-out;
  }
  .app-header.hidden {
    transform: translateY(-100%);
  }
  .header-logo { font-size: 24px; font-weight: bold; color: #58a6ff; }
  .header-controls { display: flex; align-items: center; gap: 10px; }
  .header-button { padding: 8px 16px; border: 1px solid #30363d; background-color: #21262d; color: #c9d1d9; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; transition: all 0.2s ease; }
  .header-button:hover { background-color: #30363d; border-color: #58a6ff; }
  .order-toggle-button.random-active { background-color: #1f6feb; border-color: #1f6feb; }
  .order-toggle-button.least-shown-active { background-color: #8957e5; border-color: #8957e5; }
  .order-toggle-button.default-active { background-color: #238636; border-color: #238636; }

  @media (max-width: 768px) {
    .app-header {
      padding: 10px 15px;
    }
    .header-logo {
      font-size: 18px;
    }
    .header-button {
      padding: 6px 12px;
      font-size: 13px;
    }
    .button-icon {
      font-size: 16px;
    }
  }
</style>

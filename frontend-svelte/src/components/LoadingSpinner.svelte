<script>
  // No props needed for this component
</script>

<div class="loading-container">
  <div class="spinner"></div>
  <p>Loading your saved media...</p>
</div>

<style>
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 20px;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #30363d;
    border-top-color: #58a6ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  p {
    color: #8b949e;
    font-size: 16px;
  }
</style>

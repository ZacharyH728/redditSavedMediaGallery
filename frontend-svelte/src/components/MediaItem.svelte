<script>
  // This component has no logic. It just receives a post and displays it.
  let { post } = $props();
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const fullUrl = `${baseUrl}${post.url}`;
</script>

<div class="media-item">
  <div class="media-content">
    <img src={fullUrl} alt={post.title} class="centered-media" loading="lazy" />
  </div>
  <div class="media-info">
    <h3 class="post-title">{post.title || 'Untitled'}</h3>
  </div>
</div>

<style>
  .media-item { background-color: #0d1117; border-radius: 6px; overflow: hidden; border: 1px solid #30363d;}
  .media-content { background-color: #161b22; }
  .centered-media { max-width: 100%; max-height: 80vh; width: 100%; height: auto; object-fit: contain; display: block; }
  .media-info { padding: 15px; }
  .post-title { font-size: 16px; font-weight: 500; color: #c9d1d9; margin: 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

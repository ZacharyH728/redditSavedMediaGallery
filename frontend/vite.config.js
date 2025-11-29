import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true, // Expose to network (0.0.0.0)
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_API_URL ? process.env.VITE_API_URL.replace('/api', '') : 'http://localhost:4000',
        changeOrigin: true,
      }
    }
  }
});

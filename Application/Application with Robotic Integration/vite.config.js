import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
  },
  server: {
    host: '0.0.0.0',
    port: 51999,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:44444',
        changeOrigin: true,
      }
    }
  }
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.EIKON_API ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.DEV_HOST ?? 'localhost',
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/media': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Single-user app served over the tailnet; one ~190 kB (gzip) bundle is fine.
    chunkSizeWarningLimit: 800,
  },
});

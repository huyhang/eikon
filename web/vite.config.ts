import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.EIKON_API ?? 'http://localhost:8787';
const root = path.dirname(fileURLToPath(import.meta.url));

/** Files in the built app that the service worker saves on install (everything but itself). */
async function shellFiles(outDir: string): Promise<string[]> {
  const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map(
      (entry) =>
        '/' + path.relative(outDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    )
    .filter((file) => file !== '/sw.js' && file !== '/index.html' && !file.startsWith('/.'))
    .toSorted();
}

/**
 * Builds src/sw/serviceWorker.ts into dist/sw.js after the app, as one classic script with this
 * build's file list baked in, so every deploy installs a fresh service worker.
 */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'eikon-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const precache = await shellFiles(outDir);
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      await build({
        configFile: false,
        logLevel: 'warn',
        define: {
          EIKON_PRECACHE: JSON.stringify(precache),
          EIKON_SHELL_VERSION: JSON.stringify(version),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          target: 'es2022',
          lib: {
            entry: path.join(root, 'src/sw/serviceWorker.ts'),
            formats: ['iife'],
            name: 'eikonServiceWorker',
            fileName: () => 'sw.js',
          },
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
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
  },
});

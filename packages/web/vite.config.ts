import { criticalPwaAssets } from './src/performance/pwaCachePolicy.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

let criticalAssets = new Set<string>();
const releaseNotes = JSON.parse(readFileSync(new URL('./release-notes.json', import.meta.url), 'utf8')) as { items: string[] };
if (!Array.isArray(releaseNotes.items) || !releaseNotes.items.length || releaseNotes.items.some(item => typeof item !== 'string' || !item.trim())) {
  throw new Error('release-notes.json must contain non-empty release notes');
}
const notesJson = JSON.stringify({ items: releaseNotes.items });
const notesWorker = `release-notes-${createHash('sha256').update(notesJson).digest('hex').slice(0, 16)}.js`;

export default defineConfig({
  define: { 'import.meta.env.VITE_BAR_MAP_ENABLED': JSON.stringify(true), 'import.meta.env.VITE_PAGE_INTRODUCTIONS_ENABLED': JSON.stringify(process.env.HOCKEY_DEPLOY_TARGET === 'development'), 'import.meta.env.VITE_TRAINING_EXERCISES_ENABLED': JSON.stringify(process.env.HOCKEY_DEPLOY_TARGET === 'development'), 'import.meta.env.VITE_CHALLENGES_ENABLED': JSON.stringify(process.env.HOCKEY_DEPLOY_TARGET === 'development') },
  plugins: [
    react(),
    { name: 'hockey-critical-pwa', generateBundle(_options, bundle) { criticalAssets = criticalPwaAssets(bundle); } },
    {
      name: 'hockey-release-notes',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: notesWorker,
          source: `self.addEventListener('message', event => {
  if (event.data?.type === 'HOCKEY_RELEASE_NOTES' && event.ports[0]) {
    event.ports[0].postMessage(${notesJson});
  }
});`,
        });
      },
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icons/icon-512.png',
        'icons/icon-192.png',
        'icons/apple-touch-icon.png',
        'icons/notification-badge.png',
        'push-sw.js',
      ],
      manifest: {
        name: 'Ультимейт Хоккей',
        short_name: 'Ультиматум',
        description: 'Хоккейная игра в стиле OVI Universe',
        theme_color: '#08182b',
        background_color: '#08182b',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        importScripts: ['/push-sw.js', `/${notesWorker}`],
        globPatterns: ['**/*.{js,css,html,ico,woff2,webmanifest}'],
        globIgnores: ['**/icons/app-logo.png'],
        manifestTransforms: [async entries => ({
          manifest: entries.filter(entry => !/\.(js|css)$/.test(entry.url) || criticalAssets.has(entry.url)),
          warnings: [],
        })],
        runtimeCaching: [
          {
            urlPattern: ({url}) => url.origin === self.location.origin && url.pathname.startsWith('/maps/studio-20261110/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hockey-city-studio-v1',
              cacheableResponse: {statuses: [200]},
              expiration: {maxEntries: 96, maxAgeSeconds: 60 * 60 * 24 * 365},
            },
          },
          {
            // Pixi loads textures with fetch, whose destination is not "image".
            urlPattern: ({ url }) => url.origin === self.location.origin && /^\/(?:caretaker|sprites)\/.+\.webp$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hockey-caretaker-textures-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets\/.+\.(js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hockey-modules',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 180, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /^\/bar\/game-thumbnails\/[a-z]+-v[0-9]+\.webp$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hockey-game-thumbnails',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'hockey-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    manifest: true,
    // Production maps would embed source text for the dev-only constructor.
    sourcemap: process.env.VITE_MARKSMANSHIP_CONSTRUCTOR === 'dev-only-enabled',
  },
});

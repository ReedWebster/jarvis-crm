import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export default defineConfig({
  optimizeDeps: {
    include: ['three', 'three-spritetext', 'react-force-graph-3d', 'postprocessing'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three-vendor': ['three', 'postprocessing'],
        },
      },
    },
  },
  plugins: [
    {
      name: 'force-postprocessing-side-effects',
      enforce: 'pre',
      resolveId(source) {
        // postprocessing declares sideEffects:false but has circular deps
        // that break when Rollup reorders declarations. Force side effects
        // to preserve original declaration order and prevent TDZ errors.
        if (source === 'postprocessing') {
          return { id: require.resolve('postprocessing'), moduleSideEffects: true };
        }
        return null;
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'LITEHOUSE — Command Center',
        short_name: 'LITEHOUSE',
        description: 'Personal command center. Projects, time, contacts, goals, finances — all in one place.',
        theme_color: '#0c0c0c',
        background_color: '#0c0c0c',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        // Cache all app shell assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache Google Fonts
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Enable PWA in dev mode so you can test the install prompt locally
        enabled: true,
        type: 'module',
      },
    }),
  ],
})

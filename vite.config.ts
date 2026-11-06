import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Pokédex TCG',
        short_name: 'Pokédex TCG',
        description: 'Suis ton Pokédex en cartes Pokémon TCG.',
        lang: 'fr',
        theme_color: '#111318',
        background_color: '#111318',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        globIgnores: ['**/xlsx-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/assets\.tcgdex\.net\//,
            handler: 'CacheFirst',
            options: { cacheName: 'card-images', expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\//,
            handler: 'CacheFirst',
            options: { cacheName: 'artworks', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/api\.tcgdex\.net\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'tcgdex-api', expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
    }),
  ],
})

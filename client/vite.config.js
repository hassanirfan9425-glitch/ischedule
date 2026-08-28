import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Registered manually in main.jsx via the virtual:pwa-register module instead of an
      // auto-injected script, so a future update banner/prompt can hook into the same call.
      injectRegister: null,
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cram',
        short_name: 'Cram',
        description: 'Your academic life, organized around you.',
        theme_color: '#e8503f',
        background_color: '#fdf3ec',
        display: 'standalone',
        icons: [
          { src: '/pwa-icon.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icon.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML) so the UI itself loads with no network.
        globPatterns: ['**/*.{js,css,html,ico,svg,png}'],
        runtimeCaching: [
          {
            // Matched by pathname, not full URL, so this works the same in local preview and prod.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              // Tuned near App.jsx's WAKING_UP_THRESHOLD_MS (3s) so this fallback doesn't race the
              // app's own "waking up" messaging — Workbox falls back to cache only after this many
              // seconds with no response, same window the app already gives a cold Render instance.
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});

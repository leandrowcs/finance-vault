import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FinanceVault',
        short_name: 'FinanceVault',
        description: 'Planejamento financeiro da sua casa.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#18312f',
        background_color: '#f6f5f0',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        runtimeCaching: [
          { urlPattern: ({ request }) => request.destination === 'document', handler: 'NetworkFirst' },
          { urlPattern: ({ request }) => request.destination === 'style' || request.destination === 'script', handler: 'CacheFirst' },
        ],
      },
    }),
  ],
})

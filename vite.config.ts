import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FinanceVault',
        short_name: 'FinanceVault',
        description: 'Planejamento financeiro da sua casa.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#18312f',
        background_color: '#f6f5f0',
        icons: [
          { src: '/icons/finance-vault-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/finance-vault-logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
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

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
        name: 'Finance Vault',
        short_name: 'Finance Vault',
        description: 'Planejamento financeiro das suas contas.',
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
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/firebase/firestore') || id.includes('node_modules/@firebase/firestore')) return 'firebase-firestore';
          if (id.includes('node_modules/firebase/auth') || id.includes('node_modules/@firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/firebase/app') || id.includes('node_modules/@firebase/app')) return 'firebase-app';
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase-core';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
})

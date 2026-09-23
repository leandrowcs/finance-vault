---
name: pwa
description: Use when configuring PWA features — service workers, manifest, offline support, caching strategies, or install prompts. Covers vite-plugin-pwa and Workbox.
---

## Rules
- Always use `vite-plugin-pwa` with Workbox.
- Caching strategies: `CacheFirst` for static assets, `NetworkFirst` for API calls.
- Manifest must include: `name`, `short_name`, `icons`, `start_url`, `display: standalone`, `theme_color`.
- Offline-first by default. Handle sync conflicts explicitly.
- Test service worker behavior in production build — never in dev mode.
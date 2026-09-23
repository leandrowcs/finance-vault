---
name: vercel
description: Use when configuring Vercel deployments, edge functions, environment variables, rewrites, redirects, or headers. Covers vercel.json and Vercel CLI.
---

## Rules
- `vercel.json` for rewrites, redirects, and headers.
- All env vars via Vercel dashboard — never committed to repo.
- Edge Functions for low-latency middleware (auth guards, redirects).
- Preview deployments for every PR branch.
- Always update `.env.example` when adding new env vars.
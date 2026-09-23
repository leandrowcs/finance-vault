---
name: react-vite
description: Use when creating, modifying, or reviewing React components, hooks, state management, or Vite configuration. Covers functional components, custom hooks, TanStack Query, Zustand, Tailwind CSS, and code splitting.
---

## Rules
- Functional components only. No class components.
- Hooks over HOCs. Custom hooks for reusable logic.
- Use `import.meta.env` for env vars — never `process.env`.
- TanStack Query for server state. Zustand or Context for client state.
- Tailwind CSS for styling unless told otherwise.
- Code splitting with `React.lazy` and `Suspense`.
- TypeScript strict mode always.
- Always handle loading, error, and empty states.
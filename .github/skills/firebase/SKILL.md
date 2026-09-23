---
name: firebase
description: Use when working with Firebase — Firestore, Authentication, Cloud Functions, Storage, or Firebase config. Covers modular SDK v9+, security rules, and real-time data.
---

## Rules
- Firebase v9+ modular SDK only — never the compat layer.
- Firestore: `onSnapshot` for real-time, `getDocs` for one-time reads.
- Security Rules must be explicit — never `allow read, write: if true`.
- Auth: `onAuthStateChanged` inside `useEffect` with cleanup function.
- Cloud Functions: TypeScript, always validate input with `zod`.
- Storage: always use signed URLs — never expose bucket directly.
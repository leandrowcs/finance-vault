---
name: google-cloud
description: Use when working with Google Cloud — Cloud Run, Cloud Storage, Secret Manager, or Pub/Sub. Covers containerization, IAM, signed URLs, and async workflows.
---

## Rules
- Cloud Run for containerized services. Always multi-stage `Dockerfile`.
- Cloud Storage: signed URLs only — never expose bucket publicly.
- Secret Manager for all sensitive env vars — never hardcode credentials.
- Pub/Sub for async event-driven workflows.
- IAM: least privilege principle — never use default service accounts in production.
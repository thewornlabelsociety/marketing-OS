# SaaS Migration Path

## Current: Local-First

- SQLite via `better-sqlite3`
- WAL mode + FK constraints
- `LOCAL_TENANT_ID = 'tenant_local'` as FK anchor
- Local filesystem for assets
- Local ffmpeg for video processing
- No authentication
- Single local worker

## Future: SaaS-Ready

These replacements are possible without touching business logic if the dependency rules are respected.

| Current | Future |
|---|---|
| SQLite | PostgreSQL |
| Local filesystem | S3 / Cloudflare R2 |
| LOCAL_TENANT_ID | Authenticated tenant/workspace resolution |
| workspaceContext middleware (local) | JWT / session auth middleware |
| Local ffmpeg worker | Cloud render worker fleet |
| Single process | Horizontally scalable API |

## Migration Triggers

Do NOT implement SaaS infrastructure until one of these is true:
- A second human user needs access
- Data size or query patterns exceed SQLite limits
- The product moves to production hosting

## Boundary Rules

- Repositories implement TypeScript interfaces — swap the implementation, not the interface
- Asset storage is accessed through a storage port — swap local for S3 without touching service code
- Tenant resolution is middleware — replace local middleware with auth middleware
- `LOCAL_TENANT_ID` is defined in one place (`config/constants.ts`) and imported everywhere it's needed

## Do NOT Implement Now

Billing · Stripe · subscriptions · enterprise RBAC · multi-region · CDN ·
email providers · SMS · complex permission systems · feature flags

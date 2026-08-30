# Marketing OS — Architecture Overview

## Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js + Express + TypeScript |
| Database | SQLite via better-sqlite3 (WAL mode, FK constraints) |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4 |
| Icons | Lucide React |
| Editing engine | TOTAL EDIT (packages/total-edit-core) |
| Editing adapter | total-edit-adapter-local (local ffmpeg + filesystem) |
| Render worker | workers/total-edit-worker |

## Canonical Ports

| Service | Port |
|---|---|
| Backend API | 4100 |
| Frontend dev server | 5173 |

## Domain Hierarchy

```
Tenant
└── Workspace
    ├── Brand Brain
    ├── Objective Library
    ├── Offers (products / services / events / etc.)
    ├── Audiences
    ├── Assets
    ├── Intake Sources
    ├── Campaigns
    │   ├── Objective (required)
    │   ├── Brief
    │   ├── Strategy
    │   ├── Content Items
    │   ├── Creative Assets
    │   ├── Channels
    │   ├── Advertising
    │   ├── Schedule
    │   ├── Review
    │   ├── Revisions + Versions
    │   ├── Approval
    │   └── Performance
    ├── Experiments
    ├── SOPs / Automations
    ├── Integrations
    ├── Campaign Library
    └── Memory
```

TOTAL EDIT is consumed by Marketing OS but remains an independent domain.

## Local-First Baseline

All infrastructure is local SQLite until SaaS migration is warranted.
`LOCAL_TENANT_ID = 'tenant_local'` is the FK anchor for the single local tenant.
This is an infrastructure constant, not a brand name.

See `docs/decisions/001-local-first-baseline.md`.

## SaaS Migration Path

When needed, replace:
- SQLite → PostgreSQL (repositories implement the same interface)
- Local filesystem → S3/R2 (storage adapter swap)
- LOCAL_TENANT_ID → authenticated tenant resolution middleware
- Single worker → cloud worker fleet

See `docs/architecture/SAAS_MIGRATION_PATH.md`.

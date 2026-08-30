# Marketing OS

## Purpose

Local-first multi-brand marketing operating system. Manages brand workspaces, content drops, intake queues, SOPs, performance attribution and memory vaults for any number of user-created brand entities.

## Canonical Project Root

```
C:\Users\kilgo\Projects\marketing-os
```

## Structure

```
marketing-os/
├── backend/          Express + TypeScript API, SQLite database
├── frontend/         React 19 + Vite + Tailwind CSS v4 UI
├── packages/
│   └── total-edit-core/   Isolated video processing package (future)
└── docs/
    ├── architecture/
    ├── decisions/    Architecture Decision Records
    └── product/
```

## Development

### Backend

```bash
cd backend
npm run dev
```

Runs on **http://localhost:4100**. Database is created automatically at `backend/app_data.db` on first boot.

### Frontend

```bash
cd frontend
npm run dev
```

Runs on **http://localhost:5173**. Proxies `/api` → `http://localhost:4100`.

Start the backend before the frontend.

## Architecture Rules

- **Brands are dynamic** — every workspace is user-created. No brand is seeded or required.
- **No predefined brand** — the application starts with zero entities and presents a creation flow.
- **Local-first tenant** — `tenant_local` is an infrastructure FK anchor for local operation, not a brand. Defined once in `backend/src/config/constants.ts`.
- **Brand configuration lives in persisted data** — voice, palette, vocabulary, and audience rules are stored in `entities.brand_kit`; they are never hardcoded in application logic.
- **No active Photoroom API** — Marketing OS accepts externally processed images. `PhotoroomService.ts` is retained as reference only and is not registered as an API route.
- **TOTAL EDIT is isolated** — all video processing logic belongs in `packages/total-edit-core`. It must not be duplicated inside `backend/` or `frontend/`.
- **Frontend is presentation only** — business rules and persistence belong in the backend.
- **TypeScript throughout** — `strict: true` on both backend and frontend.
- **Lucide icons only** — no emoji in the product UI.
- **SaaS-ready without SaaS complexity** — schema is multi-tenant, but no billing, auth, or tenant-management UI is built yet.

## Current Status

Recovered and canonicalised baseline. Working features:

- Dynamic brand workspace creation and switching
- Brand Kit persistence (colours, fonts, voice, archetype)
- Drop drafting (Studio)
- Drop Calendar
- Performance Logger with Memory Vault sync
- Live phone simulator (Instagram Feed + Mobile Email)
- Deep-link intake URL support
- Zero-brand empty state with Create Brand flow

Not yet built:

- Full Brand Setup Wizard
- Repurposer
- Intake queue UI
- SOPs UI
- Archive
- TOTAL EDIT (isolated package, future phase)

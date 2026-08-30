# Marketing OS — Dependency Rules

These rules define what may depend on what.
Violating them creates architectural coupling that will break SaaS migration.

---

## Frontend

### May depend on:
- Frontend services (`src/services/`)
- Shared frontend types (`src/types/`)
- Backend API contracts (response shapes only)

### Must NOT:
- Access the database directly
- Import backend source code
- Depend on provider SDK packages

---

## Backend Routes

Routes call services. They must not contain business logic.

```
Route handler → Service → Repository → Database
```

Complex logic belongs in services, not route handlers.

---

## Backend Services

Services contain business logic and call repositories for persistence.

Services may depend on:
- Other services in the same or lower layer
- Repositories
- Integration contracts (interfaces, not implementations)
- Shared types

Services must NOT:
- Import route handlers
- Import Express request/response objects as business types
- Depend on provider-specific SDK packages

---

## Repositories

Repositories handle persistence only. They call the database.

Repositories must NOT:
- Contain business logic
- Call services
- Import routes

---

## Integrations

Provider adapters implement contract interfaces.

```
Service → Contract interface ← Provider adapter
```

Adapters must NOT be imported directly by core services.
Core services depend on the interface, not the implementation.
Provider-specific logic must never appear in core service code.

---

## TOTAL EDIT Isolation

TOTAL EDIT is an independent editing domain.

**TOTAL EDIT must never import:**
- React
- Express
- SQLite or Postgres
- Marketing OS domain code
- Brand-specific logic
- Provider integrations

**Marketing OS may import TOTAL EDIT through the `EditingProvider` contract only.**

Campaign code may request editing services.
TOTAL EDIT may NOT read campaign or Brand Brain data.
Performance code may read campaign/objective data but must not mutate campaign creative.

---

## Memory Updates

Memory updates must occur through explicit service calls (`BrandMemoryService`, `MemoryRepository`).
Memory must never be written as a side effect of unrelated operations.
All memory is workspace-scoped. A single user's preference must never become a global rule.

---

## Performance Domain

Performance may read: campaign data, objective data, channel data.
Performance must NOT: mutate campaign creative, write to content tables, change approval state.

---

## Local-First / SaaS Boundary

Current infrastructure:
- SQLite via `better-sqlite3`
- Local filesystem
- `LOCAL_TENANT_ID = 'tenant_local'` as FK anchor
- No authentication layer

SaaS migration will replace:
- SQLite → PostgreSQL
- Local filesystem → object storage (S3/R2)
- `LOCAL_TENANT_ID` resolution → authenticated tenant/workspace resolution

**Do NOT implement infrastructure that is not currently needed.**
**Design all interfaces so infrastructure can be replaced without touching business logic.**

Repository interfaces must be defined as TypeScript interfaces so implementations can be swapped.

---

## Import Direction Summary

```
Routes
  ↓ (call)
Services
  ↓ (call)
Repositories
  ↓ (call)
Database

Integrations (via contracts, injected)
  ↑ (implement)
Provider adapters
```

Frontend → Backend API (HTTP only, never direct import)

TOTAL EDIT → EditingProvider contract ← Marketing OS (calls only)

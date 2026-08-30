# ADR 001 — Local-First Baseline Architecture

**Date:** 2026-08-30
**Status:** Accepted

---

## Context

Marketing OS is being built as a local-first desktop tool for a small number of brand operators. SaaS delivery is a future goal, not a current requirement.

---

## Decisions

### 1. Use `tenant_local` for the local-first build

**Decision:** The schema includes a `tenants` table with FK constraints on all domain tables. For local operation, a single `tenant_local` record is seeded as infrastructure. All locally created entities belong to this tenant.

**Reason:** Keeps the schema future-compatible with multi-tenant SaaS architecture without requiring authentication, tenant resolution, or session management now. The constant is defined once in `backend/src/config/constants.ts` and must not be scattered as a raw string.

**Future:** Replace with a resolved tenant ID from an authenticated session when multi-tenancy is introduced.

---

### 2. No predefined brands

**Decision:** Marketing OS boots with zero entities. No brand workspace is created automatically. The application presents a zero-brand empty state and a Create Brand flow on first use.

**Reason:** Hardcoded seed brands (e.g. Worn Label, JoeLifeOS) violate the core architecture rule that every workspace must be user-created, editable, archivable, and deletable. Brand-specific behaviour must come from stored configuration, not application code.

**Rule:** No brand name (Worn Label, Joe, Eloe, FÜDI, or any other) may appear in application logic, seeds, or default values.

---

### 3. External intake bridge remains generic

**Decision:** `POST /api/bridge/intake` accepts intake records from external inventory or admin applications. The route accepts generic fields (brand, title, fabric, price, photos) and must not contain any brand-specific assumptions.

**Reason:** External integrations must remain brand-agnostic. The entity the item belongs to is determined by the `entity_id` field supplied in the request, which must reference a user-created workspace.

**Note:** `GET /api/intake` is the native Marketing OS intake endpoint. `POST /api/bridge/intake` exists for external application/inventory integrations.

---

### 4. Photoroom is an external workflow, not an active API integration

**Decision:** Marketing OS does not call the Photoroom API. `PhotoroomService.ts` is retained in `backend/src/services/` as a reference implementation but is not registered as an active API route. No `PHOTOROOM_API_KEY` is required.

**Reason:** The operator uses their existing Photoroom subscription externally and uploads finished imagery directly. Adding an API dependency for a service the operator already manages separately adds cost and complexity with no net benefit.

**Future:** If the product requires background removal, revisit with a clear user workflow and explicit opt-in.

---

### 5. TOTAL EDIT remains a separate package boundary

**Decision:** All video processing logic (FFmpeg, silence detection, reframing, creative directives, frame extraction) belongs exclusively in `packages/total-edit-core`. It must not be implemented inside `backend/src/` or `frontend/src/`.

**Reason:** TOTAL EDIT is a distinct product capability that must be usable as a standalone package. Keeping it isolated from the main backend and frontend prevents coupling and enables independent distribution later.

**Current state:** `fluent-ffmpeg` is installed as a backend dependency and reserved for this package boundary. No video processing code is implemented yet.

---

### 6. Recovery database is forensic backup only

**Decision:** The database copied during source recovery (`backend/data/recovery-original/app_data.db`) is kept as a read-only reference. It is not used as the canonical live database.

**Reason:** The recovered database contained hardcoded demo entities (Worn Label, JoeLifeOS) created by the seed logic that has now been removed. Starting from a clean database ensures the canonical runtime enforces the zero-brand architecture rule from the first boot.

**Note:** The WAL file in the recovery copy means the recovered database may not be in a clean-checkpoint state. Treat it as forensic reference only.

# ADR 008 — TOTAL EDIT Independence Boundary

**Status:** Accepted

## Decision

TOTAL EDIT is an independent editing domain with its own package boundary.
It must never import Marketing OS domain code, React, Express, or any database client.

## Rationale

TOTAL EDIT is a general-purpose non-destructive editing engine.
Its value comes from being usable outside Marketing OS contexts.
Coupling it to Marketing OS domain code would prevent future reuse and create
circular dependencies.

## Package Structure

```
packages/total-edit-core/           — pure domain logic, zero framework deps
packages/total-edit-adapter-local/  — ffmpeg + filesystem adapter
workers/total-edit-worker/          — local async render job runner
```

## Editing Rules

1. **Original media is immutable.** Raw uploads are never overwritten.
2. **Edits are non-destructive directives.** A directive describes what to do; rendering produces the output.
3. **Rendering is asynchronous.** `POST /renders` creates a job; the caller polls `GET /renders/:id`.
4. **No brand-specific conditionals.** Directives and presets are generic.
5. **Marketing OS calls TOTAL EDIT through `EditingProvider` only.** No internal classes leak out.

## Forbidden Imports in total-edit-core

`react · express · better-sqlite3 · pg · ../campaigns · ../brands · ../workspaces`

The tsconfig for `total-edit-core` should enforce this through path restrictions.

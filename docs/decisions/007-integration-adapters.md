# ADR 007 — Integration Adapter Pattern

**Status:** Accepted

## Decision

All external provider integrations are implemented as adapter classes that implement
a contract interface. Core services depend on the interface, not the adapter.

## Rationale

Marketing OS may integrate with: Meta, email platforms, Google Ads, TikTok,
ecommerce systems, inventory applications, analytics providers, and editing tools.

Embedding provider-specific logic in core services would:
- Make testing impossible without real provider credentials
- Create coupling that breaks when provider APIs change
- Make it impossible to swap providers without touching business logic

## Pattern

```
backend/src/integrations/contracts/  — TypeScript interfaces
backend/src/integrations/providers/  — Adapter implementations
IntegrationRegistry                  — Runtime adapter registry
```

## Advertising Constraint

Anything involving paid advertising spend requires explicit human approval.
This constraint is enforced at the service layer regardless of the automation level setting.

## TOTAL EDIT

TOTAL EDIT is consumed through `EditingProvider.ts`.
This ensures TOTAL EDIT internals never appear in Marketing OS service code.

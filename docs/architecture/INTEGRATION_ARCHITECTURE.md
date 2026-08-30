# Integration Architecture

## Principle

Never embed provider-specific logic in core Marketing OS services.
Core services depend on contract interfaces. Provider adapters implement those interfaces.

```
Core service → Contract interface ← Provider adapter
```

## Contract Interfaces

Located at `backend/src/integrations/contracts/`:

| Contract | Purpose |
|---|---|
| `PublishingProvider` | Organic social publishing |
| `AdvertisingProvider` | Paid advertising (requires explicit approval) |
| `AnalyticsProvider` | Performance metric retrieval (all values nullable) |
| `CommerceProvider` | Product/inventory data from ecommerce platforms |
| `IntakeProvider` | Receiving records from external applications |
| `EditingProvider` | TOTAL EDIT consumption interface |

## Provider Adapters

Located at `backend/src/integrations/providers/`:

```
providers/
  meta/       — Meta organic + Meta Ads (future)
  email/      — Email platform (future)
  local/      — Local dev stubs
```

## Integration Registry

`IntegrationRegistry` holds registered adapters per category.
Services look up an adapter at runtime — they do not import adapter classes.

## Advertising Rule

**Anything involving paid advertising spend must require explicit approval**
until a dedicated spending-policy system is built.

## Intake Bridge

`POST /api/bridge/intake` is the generic intake endpoint.
It is brand-agnostic: `entity_id` routes the record to the correct workspace.
No brand assumptions belong in the bridge route.

# ADR 002 — Brand-Agnostic Core

**Status:** Accepted

## Decision

No brand name, customer name, workspace ID, or business-specific assumption
may appear in application logic, seeds, route handlers, service code, or prompt templates.

## Rationale

Marketing OS serves multiple brand workspaces. Hardcoding any brand creates:
- A maintenance burden whenever that brand changes
- An implicit assumption that that brand always exists
- A risk of leaking one brand's data into another brand's context

## Consequences

- Workspace data is always read from persistence at runtime
- Generic marketing templates are permitted; brand-specific defaults are not
- System objective templates are generic marketing concepts
- Demo or test data must use clearly fictional placeholder names (never a real brand)

## Enforcement

TypeScript types, repository interfaces, and CLAUDE.md rule #3 enforce this at every implementation step.

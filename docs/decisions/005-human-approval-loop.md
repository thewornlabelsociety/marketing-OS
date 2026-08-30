# ADR 005 — Human Approval Loop

**Status:** Accepted

## Decision

The human user is always the final approver. The system prepares work for review
but never auto-approves campaigns or content items.

## Rationale

AI-generated content represents the brand publicly. Errors in tone, facts, pricing,
or legal language can cause reputational or financial harm. A human checkpoint ensures
the business remains accountable for what gets published.

## Approval Terminology

Only these terms may appear in code, UI, and documentation:

| Term | Meaning |
|---|---|
| Review | Presenting work for human inspection |
| Changes Requested | Human has requested changes |
| Revise / Revising | System is applying requested changes |
| Ready for Approval | Changes complete, awaiting final sign-off |
| Approve / Approved | Human has given final sign-off |

The terms "CEO Review" and "CEO Approval" are forbidden.

## Revision Scope Rule

When changes are requested:
- Only apply changes to explicitly specified content
- Do not regenerate the entire campaign unless full regeneration is explicitly requested
- Maintain version history so the user can compare or restore previous versions

## Automation and AUTOPILOT

`AUTOPILOT` automation level exists in the data model for future use.
It must not be activated broadly in the current build.
Any action involving paid advertising spend requires explicit approval regardless of automation level.

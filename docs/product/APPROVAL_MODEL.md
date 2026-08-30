# Approval Model

## Approval Scope

Approval exists at two levels:
1. **Content item** — individual asset or copy block
2. **Campaign** — the complete campaign package

## Approval States

```
PENDING → CHANGES_REQUESTED | READY_FOR_APPROVAL → APPROVED
```

## Terminology

| Allowed | Forbidden |
|---|---|
| Review | CEO Review |
| Changes Requested | CEO Approval |
| Revise / Revising | — |
| Ready for Approval | — |
| Approve / Approved | — |

## Revision Scope Rule

Revision instructions must be targeted.

**Do NOT regenerate the entire campaign because one asset or caption needs changing.**

The revision scope must be:
- `TARGETED` — only the explicitly requested content changes
- `FULL_REGENERATION` — only when the user explicitly requests it

## Version History

Every revision creates a new version. Version history is never destroyed.
Users can restore or compare any previous version.

## Human-In-The-Loop

The human user is always the final approver.
The system never auto-approves. AUTOPILOT automation level does not bypass approval.

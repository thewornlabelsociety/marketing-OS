# Campaign Lifecycle

## Canonical States

One enum. Do not create competing lifecycle definitions.

```
DRAFTING              — Campaign being built; not yet ready for review
READY_FOR_REVIEW      — System has completed work; awaiting human review
CHANGES_REQUESTED     — Reviewer has requested changes
REVISING              — System is applying requested changes
READY_FOR_APPROVAL    — Revisions complete; awaiting final sign-off
APPROVED              — Human has given final approval
SCHEDULED             — Campaign is queued to publish at a scheduled time
PUBLISHED             — Campaign has been published to one or more channels
MEASURING             — Campaign is live and performance is being tracked
COMPLETE              — Campaign measurement period ended
CANCELLED             — Campaign was cancelled (reason must be recorded)
ARCHIVED              — Campaign moved to Campaign Library
```

## Transition Rules

| From | To | Trigger |
|---|---|---|
| DRAFTING | READY_FOR_REVIEW | Quality gate passes |
| READY_FOR_REVIEW | CHANGES_REQUESTED | Reviewer requests changes |
| READY_FOR_REVIEW | READY_FOR_APPROVAL | Reviewer approves content |
| CHANGES_REQUESTED | REVISING | System begins applying changes |
| REVISING | READY_FOR_REVIEW | Revisions complete |
| READY_FOR_APPROVAL | APPROVED | User approves campaign |
| READY_FOR_APPROVAL | CHANGES_REQUESTED | User requests further changes |
| APPROVED | SCHEDULED | User schedules publish |
| APPROVED | PUBLISHED | User publishes immediately |
| SCHEDULED | PUBLISHED | Scheduler fires |
| PUBLISHED | MEASURING | Performance tracking begins |
| MEASURING | COMPLETE | Measurement window ends |
| Any | CANCELLED | User cancels (reason required) |
| COMPLETE | ARCHIVED | User archives or auto-archive |

## Invariants

- Cancellation requires a reason string.
- Cancelled and archived campaigns are never permanently deleted.
- Version history is preserved at every revision.

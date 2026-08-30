# ADR 003 — Campaign-First Domain

**Status:** Accepted

## Decision

The Campaign is the primary unit of work in Marketing OS.
All content, assets, approvals, performance data, and revisions belong to a Campaign.

## Rationale

A campaign encapsulates the complete lifecycle of a marketing effort:
from the brief through to performance measurement and learning.
Treating campaigns as the central domain entity makes the lifecycle explicit,
ensures performance is always attributed to a specific marketing effort,
and gives users a clear unit of work to review and approve.

## Consequences

- Content items must always belong to a campaign
- Performance records reference a campaign and an objective
- Archive and library are campaign-oriented, not content-oriented
- Deletion semantics preserve campaigns in the archive rather than permanently removing them

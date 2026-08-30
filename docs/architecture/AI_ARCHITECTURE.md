# AI Architecture

## Role of AI in Marketing OS

AI handles the heavy work so humans review outcomes rather than operate tools.

The system does as much as possible before requiring human input.
The human remains the final approver.

## Where AI Applies

| Stage | AI Role |
|---|---|
| Campaign planning | Translate brief + objective into content plan |
| Content generation | Produce copy, hooks, captions, CTAs |
| Quality checking | Flag issues before review; auto-repair where possible |
| Revision | Apply targeted changes to specific content |
| Performance insight | Derive learnings from performance data |
| Memory | Identify patterns in what performs and what users prefer |

## Constraints

- AI must not make approval decisions — it prepares content for human review.
- AI must not write to memory implicitly — memory updates are explicit service calls.
- Revision scope is targeted — do not regenerate everything when one thing was requested.
- AI must respect brand rules (voice, banned words, preferred words) from Brand Brain.
- AI-generated content goes through the quality gate before READY_FOR_REVIEW.

## Model Access

AI model clients will be injected into services — they are not embedded in route handlers.
Service classes receive model clients as dependencies so they can be mocked or replaced.

## Prompt Architecture

Prompts are not hardcoded strings. They are built from:
- Campaign brief
- Objective type
- Brand Brain voice + rules
- Target audience
- Offer details
- Channel requirements

No brand names appear in prompt templates.

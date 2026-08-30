# Marketing OS — Claude Code Guardrails

Read this before any feature work. These rules are permanent.

---

## Before Major Work

1. Read `docs/product/PRODUCT_CONSTITUTION.md` before major feature work.
2. Read `docs/architecture/DEPENDENCY_RULES.md` before architectural changes.

---

## Non-Negotiable Rules

3. **Never hardcode a real brand, customer name, workspace ID, or business-specific campaign.**
   Generic marketing templates and system configuration are permitted.

4. **Campaigns require objectives.**
   A campaign created without an `objectiveId` must be rejected. No exceptions.

5. **Performance is evaluated against the campaign's objective, not vanity metrics.**
   Do not judge success by engagement unless engagement is the campaign objective.
   Always ask: "Did this campaign accomplish its objective?"

6. **Preserve revision and version history.**
   Do not overwrite previous versions. Users must be able to restore or compare.

7. **Do not regenerate an entire campaign because one asset needs changing.**
   Only change what was explicitly requested unless the user asks for full regeneration.

8. **Use only canonical approval terminology.**
   Allowed: Review · Changes Requested · Revise · Ready for Approval · Approve · Approved
   Forbidden: CEO Review · CEO Approval

9. **Keep TOTAL EDIT independent.**
   TOTAL EDIT must never import: React, Express, SQLite, Postgres, Marketing OS domain code,
   brand-specific logic, or provider integrations.
   Marketing OS may consume TOTAL EDIT through the `EditingProvider` contract only.

10. **Use provider adapters for integrations.**
    Never embed provider-specific logic in core services.
    Core services depend on contract interfaces, not adapter implementations.

11. **Preserve local-first / SaaS-ready boundaries.**
    Current: SQLite + local filesystem + `LOCAL_TENANT_ID`.
    Do not implement billing, subscriptions, enterprise auth, or distributed infrastructure
    until actually needed. Design interfaces so infrastructure can be replaced later.

12. **Do not silently change canonical routes or domain names.**
    The API route namespaces and domain type names defined in the architecture docs are canonical.
    If a change is needed, document it in a decision record first.

13. **Do not delete or rewrite working functionality without explaining the migration.**
    Existing routes may remain temporarily while new canonical routes are being built.
    Document any legacy alias.

14. **Do not implement a shortcut that violates architecture to complete a feature faster.**
    A feature built on a wrong foundation costs more than the time saved.

---

## UI Rules

15. **Keep the UI simple. The user is reviewing work, not operating a marketing platform.**

16. **Use Lucide icons for all iconography. No emojis in product UI.**

17. **Primary navigation has six items only:**
    Dashboard · Campaigns · Create · Calendar · Performance · Library

18. **Before adding a new visible button, ask:**
    Can this action live in a dropdown, overflow menu, tab, contextual drawer, or Advanced section instead?

19. **A page should have one obvious primary action wherever possible.**
    Do not allow multiple competing action buttons (Generate, Preview, Duplicate, Export, etc.) on the same view.

20. **Use tabs for related views within a page. Use compact dropdowns for choices.**
    Use right-side contextual drawers for details and secondary actions.
    Put non-daily settings behind `Advanced ▾`.

21. **SOPs are context-aware right-side drawers, not a separate page.**
    A checklist icon in the page header opens the SOP drawer for the current context.
    Never require the user to navigate away from their work to see what comes next.

22. **The default interface answers four questions only:**
    1. What am I working on?
    2. What needs my attention?
    3. What do I do next?
    4. How did it perform?
    Everything else is revealed progressively.

23. **The dashboard is a marketing decision dashboard, not a vanity metrics display.**
    It answers: needs review · scheduled · performing · underperforming · conversions · revenue · attention.

---

## Architecture Constraints

24. **Memory is always workspace-scoped.** Never promote one user's preference to a global rule.

25. **Cancelled campaigns retain a cancellation reason.** Rejected revisions are learning data — preserve them.

26. **Automation levels: MANUAL · APPROVAL_REQUIRED · AUTOPILOT.**
    Do not activate AUTOPILOT broadly. Paid ad spend always requires explicit approval.

27. **Performance classifications must consider objective, KPIs, conversion, revenue, and workspace baseline.**
    Do not create a simplistic likes-based score.

28. **Campaign quality checks run before READY_FOR_REVIEW, not after.**
    Auto-repair where possible. Only surface unfixable issues to the user.

---

## Canonical Docs

- Product rules: `docs/product/PRODUCT_CONSTITUTION.md`
- Dependency rules: `docs/architecture/DEPENDENCY_RULES.md`
- ADRs: `docs/decisions/`

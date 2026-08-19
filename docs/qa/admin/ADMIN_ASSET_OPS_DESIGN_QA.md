# Asset Operations design QA

## Scope

Asset Operations is the staff-only, post-receipt workstation. The queue reads the lifecycle projection from `GET /api/v1/admin/assets/operations`; only approved submissions with a confirmed physical receipt are eligible. Physical Intake remains the source of shipment and receipt facts, while Collectibles remains the canonical catalogue.

## Implemented surface

- Full-width collectible-first queue with All active, Needs action, stage and exception views.
- Search across collectible, public ID, card number and certification number, plus category, grader and priority filters.
- Rows show approved front media, collector, receipt vault, stage, blockers, next action and age since stage entry.
- Empty state explains the receipt entry condition and links to Physical Intake.
- Operation detail route uses the existing canonical collectible read model and lifecycle readiness authority.
- Detail tabs cover Overview, Verification, Valuation, Custody, Market readiness and History.
- Lifecycle mutations continue to use protected, idempotent backend commands. Publish is enabled only when the server readiness projection is `READY`.
- No provider request or trading/ownership mutation is introduced by this workstation.

## Verification boundary

Server/frontend typecheck, changed-file lint and production builds passed for the implementation. Fresh authenticated staging mutation, responsive and accessibility walkthroughs remain required before declaring the Admin release gate complete.

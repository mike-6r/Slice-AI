# Architecture drift and duplication audit

## Confirmed drift

| Finding                                       | Evidence                                                                                                                                | Confidence                         | Safe next step                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Phase labels are stale                        | `server/package.json` says no identity/financial workflows; current modules include identity, finance, ownership, trading and providers | High                               | Update descriptive metadata after product owner review                                       |
| Migration counts are stale                    | older `docs/backend-build-guide/CURRENT_STATE.md` and QA reports cite 37/40/65 migrations; current `server/prisma/migrations` has 98    | High                               | Generate a current state report from `prisma migrate status` and retire superseded narrative |
| Deployment model is manual                    | runbooks describe VPS release upload/symlinks/systemd; no `.github` workflow found                                                      | High                               | Decide whether manual release is intentional; otherwise add CI in a separate prompt          |
| Worker documentation is inconsistent          | runbook says in-process outbox/delivery; older docs call Discord delivery/realtime partial or future                                    | Medium                             | Mark each document current/superseded with an as-of commit                                   |
| Environment template is incomplete            | `app-config.ts` supports `MARKET_REFRESH_*` and `PRICECHARTING_API_KEY`; `server/.env.example` does not list those names                | High                               | Reconcile template and config in a controlled config-only wave                               |
| Three lockfiles and three package roots exist | root, `server`, and `apps/discord-bot` each own `package-lock.json`                                                                     | Expected but operationally complex | Document install order and version policy; do not merge blindly                              |

## Active overlapping workspaces

The current frontend has an admin console at `/admin` with review, intake, collectibles, asset operations and membership sections. It also has staff routes `/operations/submissions` and `/operations/assets`, linked from `/staff`. These are active route consumers, not safe dead-code deletions. They overlap in business domains and need an authorization and audience comparison before consolidation.

The extracted admin components coexist with the large `src/routes/admin.tsx` shell. `AdminCollectibleCatalogue.tsx` is an active extracted surface; `AdminCollectibleDetail`, `AdminAssetOperationsDetail`, and `AdminMembershipDetail` are active detail workspaces. Keep them until route telemetry or explicit navigation review proves replacement.

## Frontend authority review

Positive evidence: admin catalogue filters, summary counts, ownership fields, valuation, custody, market state, and pagination come from the API response; API mode does not silently fall back to mocks. Positive evidence also exists for backend-owned fee policy, withdrawal preflight, trading preview, and portfolio valuation status.

Candidates requiring follow-up: presentation-only portfolio valuation helpers and `OwnershipService.percentageForUnits`. They may be legitimate display transforms, but no deletion should occur without import tracing and test review.

## Backend decomposition candidates

`admin.service.ts`, `submission.service.ts`, `trading.service.ts`, and `market.service.ts` combine orchestration, projection and policy concerns. The former synthetic Collector fixture generator was removed on 2026-09-01. This is a maintainability finding, not evidence of duplicate authority. Decompose only behind characterization tests and domain ownership decisions.

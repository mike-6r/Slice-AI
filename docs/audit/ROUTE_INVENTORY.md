# Route inventory and classification

Counts are static decorator/file counts from the audit commit. They are not claims that every route is reachable on staging.

## Backend controllers

All controllers below are active source consumers unless marked otherwise. Method counts include HTTP decorator matches in the controller file.

| Controller                               | Base                  | Methods | Classification                                               |
| ---------------------------------------- | --------------------- | ------: | ------------------------------------------------------------ |
| `admin.controller.ts`                    | `admin`               |      31 | ACTIVE privileged admin reads/mutations                      |
| `submission.controller.ts`               | root                  |      30 | ACTIVE customer/review workflow                              |
| `auth.controller.ts`                     | root                  |      26 | ACTIVE identity                                              |
| `providers.controller.ts`                | root                  |      22 | ACTIVE provider/webhook/finance boundaries                   |
| `collector-workspace.controller.ts`      | `collector-workspace` |      20 | ACTIVE collector workspace                                   |
| `finance.controller.ts`                  | root                  |      19 | ACTIVE finance                                               |
| `community.controller.ts`                | root                  |      18 | ACTIVE community/governance                                  |
| `catalogue.controller.ts`                | root                  |      15 | ACTIVE public catalogue and privileged catalogue maintenance |
| `trading.controller.ts`                  | root                  |      14 | ACTIVE trading reads/mutations                               |
| `discord-link.controller.ts`             | root                  |      14 | ACTIVE bot/account linking                                   |
| `ownership.controller.ts`                | root                  |      13 | ACTIVE ownership                                             |
| `initial-offering.controller.ts`         | root                  |      10 | ACTIVE offering                                              |
| `lifecycle.controller.ts`                | root                  |       9 | ACTIVE asset lifecycle                                       |
| `market.controller.ts`                   | `market`              |       8 | ACTIVE market reads                                          |
| `reads.controller.ts`                    | root                  |       8 | ACTIVE public/read projections                               |
| `notification.controller.ts`             | `me/notifications`    |       6 | ACTIVE self notifications                                    |
| `outbox-operations.controller.ts`        | `admin`               |       6 | ACTIVE internal/admin operations                             |
| `access-control.controller.ts`           | `admin`               |       5 | ACTIVE access administration                                 |
| `email-verification.controller.ts`       | root                  |       5 | ACTIVE identity                                              |
| `phone-verification.controller.ts`       | root                  |       4 | ACTIVE identity                                              |
| `two-factor.controller.ts`               | `me/2fa`              |       7 | ACTIVE identity                                              |
| `health.controller.ts`                   | `health`              |       1 | ACTIVE public liveness                                       |
| `readiness.controller.ts`                | `ready`               |       1 | ACTIVE public readiness                                      |
| `currency.controller.ts`                 | `currency`            |       1 | ACTIVE reference/read                                        |
| `trusted-reference-import.controller.ts` | `collectibles`        |       1 | ACTIVE privileged research import                            |

Total: 24 controllers and 296 route decorator matches. Endpoint authorization is implemented in controller guards/decorators and service policy; a future generated inventory should be preferred over manually maintained endpoint lists.

## Canonical catalogue route chain

| Layer              | Route / symbol                               | Consumer                                    |
| ------------------ | -------------------------------------------- | ------------------------------------------- |
| Frontend route     | `/admin?section=collectibles`                | `src/routes/admin.tsx`                      |
| Frontend component | `AdminCollectibleCatalogue`                  | admin catalogue list and preview            |
| Repository         | `listCatalogueAssets`                        | `src/repositories/http-repositories.ts`     |
| HTTP request       | `GET /admin/collectibles` relative to API v1 | server admin controller                     |
| Backend service    | `AdminService.catalogueAssets`               | `server/src/modules/admin/admin.service.ts` |
| Database authority | `Asset` plus bounded relations               | Prisma                                      |
| Detail route       | `/admin?section=collectibles&asset=<id>`     | `AdminCollectibleDetail`                    |

The frontend does not use the public `/catalogue/assets/:slug` endpoint for the admin list, and it does not perform a client-side global filter over an unbounded catalogue.

## Frontend routes

The route directory contains 43 `.tsx` files including route-local test modules; the navigable pages are grouped as follows:

- Public/content: `/`, `/about`, `/fees`, `/help`, `/how-it-works`, `/marketplace`, `/login`, `/signup`, `/reset-password`, `/verify-email`, `/onboarding`, `/security`, `/notifications`.
- Customer asset/market: `/asset/$id`, `/buy/$id`, `/sell/$id`, `/allocate/$id`, `/list`, `/orders`, `/portfolio`, `/wallet`, `/watchlist`, `/collectors`, `/collector/$id`, `/collector/$id/assets`.
- Customer workspace: `/account`, `/collector-workspace`, `/submissions/$id`.
- Staff/admin: `/staff`, `/operations/assets`, `/operations/submissions`, `/admin`.
- Presentation/test-adjacent route modules: files prefixed `-` are route-local helpers/validation modules, not navigable pages.

## Overlap classification

| Surface                                              | Classification             | Evidence / action                                                                                 |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `/admin` review/intake/collectibles/asset operations | ACTIVE                     | Main admin console navigation and API queries                                                     |
| `/operations/submissions` vs admin review            | ACTIVE OVERLAP             | Staff workspace links to it; deep-links back into `/admin`; compare audience before consolidation |
| `/operations/assets` vs admin asset operations       | ACTIVE OVERLAP             | Staff workspace links to it and it owns lifecycle mutations; not safe to delete                   |
| `/staff`                                             | ACTIVE ENTRYPOINT          | Role-gated navigation hub                                                                         |
| public catalogue vs admin catalogue                  | DISTINCT AUTHORITY VIEWS   | Public route exposes published safe data; admin route exposes canonical operational state         |
| mock repositories                                    | EXPLICIT DEV/TEST MODE     | Dynamic import only under `VITE_DATA_SOURCE=mock`; preserve until mode retirement                 |
| old route helper modules                             | UNKNOWN UNTIL IMPORT TRACE | Some are imported by active routes/tests; no deletion recommendation                              |

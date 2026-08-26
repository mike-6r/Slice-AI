# Slice full codebase forensic audit

Audit date: 2026-08-25
Repository: `main` at `002c1978bd1d0b123f4a30dc99cfa575ba8d8eb5`
Scope: read-only forensic review; no source, schema, financial, custody, ownership, or staging mutation.

## Executive result

The repository is a substantial three-runtime system, not an empty prototype: TanStack Start/React frontend, NestJS/Prisma API, and a standalone Discord bot sharing the Prisma schema. The canonical catalogue entity is `Asset`. The admin list correctly queries `GET /api/v1/admin/collectibles`, which reads `Asset` records with server-side filters and pagination.

The most important lifecycle finding is a boundary gap, not a wrong catalogue endpoint: review approval updates `AssetSubmission` to `APPROVED` and emits an approval event, but does not create or link an `Asset`. Asset creation is separately exposed through catalogue administration, and the approved-submission-to-asset handoff is a separate service-only `linkApprovedAsset` operation. Therefore an approved submission can legitimately remain absent from Collectibles until that handoff occurs. Whether that is intentional workflow policy or a broken missing handoff must be decided before cleanup; this audit does not invent records or change the boundary.

Runtime staging data could not be queried authoritatively in this pass. Public health was previously reachable, but SSH to the named VPS failed with public-key authentication. The exact staging row count, worker flags, and database contents are therefore **UNKNOWN**, not inferred from the UI.

## Baseline

| Check                            | Result                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Git branch / commit              | `main` / `002c1978bd1d0b123f4a30dc99cfa575ba8d8eb5`                                                                |
| Worktree before audit            | Clean                                                                                                              |
| Frontend typecheck               | PASS                                                                                                               |
| Frontend production build        | PASS; existing large-chunk warnings                                                                                |
| Frontend tests                   | PASS: 39 files, 161 tests                                                                                          |
| Backend typecheck                | PASS                                                                                                               |
| Backend production build         | PASS                                                                                                               |
| Backend tests                    | PASS: 77 suites, 345 tests                                                                                         |
| Backend lint                     | PASS                                                                                                               |
| Prisma validation                | PASS                                                                                                               |
| Frontend lint                    | FAIL: 3,945 errors / 10 warnings, overwhelmingly Prettier violations                                               |
| Discord typecheck / build / lint | PASS                                                                                                               |
| Discord tests                    | PARTIAL: 31 files pass, 7 PostgreSQL integration files fail to connect to `127.0.0.1:5432`; 167 passed, 39 skipped |
| Prisma migrations                | 98 migration directories                                                                                           |
| Prisma models / enums            | 175 models / 88 enums                                                                                              |
| Backend controller route methods | 296 decorator matches across 24 controllers                                                                        |
| Frontend file routes             | 43 `.tsx` route files                                                                                              |
| Markdown documentation           | 203 `docs`, 18 `server/docs`, 6 Discord docs                                                                       |

## System map

| Area                   | Location                                                          | Responsibility                                                                               | Runtime status                                              |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Web frontend           | `src/`, `src/routes/`, `src/components/`                          | customer and admin UI; API repositories; explicit mock mode                                  | buildable; API mode is the production path                  |
| API                    | `server/src/`                                                     | Nest controllers, authorization, domain services, provider boundaries, reads                 | buildable and test-covered                                  |
| Database               | `server/prisma/schema.prisma`, `server/prisma/migrations/`        | PostgreSQL authority for identity, assets, lifecycle, ownership, finance, providers, Discord | Prisma-valid; live application state not queried here       |
| Discord gateway/worker | `apps/discord-bot/src/`                                           | Discord-owned community workflows; Slice API for Slice-authoritative data                    | typecheck/build/lint pass; runtime not confirmed on staging |
| Background jobs        | in-process Nest workers                                           | outbox/delivery, market refresh, portfolio snapshots                                         | opt-in by config; staging activation not confirmed          |
| Deployment             | `scripts/deploy-vps-staging.sh`, `docs/STAGING_VPS_DEPLOYMENT.md` | immutable release build, Prisma migrate, symlink activation, systemd restart, health checks  | manual VPS runbook; no CI workflow found                    |
| Docs/plans             | `docs/`, `server/docs/`, `apps/discord-bot/docs/`                 | implementation history, QA, product and deployment notes                                     | materially drifted in places; see architecture drift        |

## Lifecycle and source-of-truth map

`AssetSubmission` is the customer/review record. `Asset` is the canonical collectible identity. `SubmissionIntake`, `IntakeShipment`, `IntakeReceiptConfirmation`, `IntakeVerification`, and `IntakeException` own physical intake. `VaultCustodyRecord` / `CustodyEvent` own custody state. `ValuationDecision` owns staff valuation; market observations and PriceCharting mappings are reference inputs. `AssetPublication`, `TradingMarket`, `InitialOffering`, `OwnershipAssetSupply`, `OwnershipPosition`, and finance ledger models own their separate downstream authorities.

The intended relationship is:

`AssetSubmission` → review decision → optional/explicit `AssetSubmission.assetId` link → `SubmissionIntake` → receipt/verification → `Asset` custody/valuation/publication → separate offering/ownership/trading.

The code does preserve separate ownership issuance: catalogue reads show “not issued” when no authoritative supply/positions exist. It also keeps staff valuation distinct from external market reference data.

## Top critical findings

### P1 — Canonicalization handoff is not automatic

Evidence: `Asset` is the canonical row (`server/prisma/schema.prisma:1357`); `AssetSubmission.assetId` is nullable (`server/prisma/schema.prisma:1474`); approval logic in `server/src/modules/submissions/application/submission.service.ts` records the decision and outbox event but does not create an asset; `linkApprovedAsset` is a separate audited operation (`:362`); direct canonical creation is in `CatalogueService.createAsset` (`server/src/modules/catalogue/application/catalogue.service.ts:535`).

Impact: accepted/reviewed assets may be absent from Collectibles by design or because an operator/job never performs the handoff. This is the first issue to resolve before any “zero records” diagnosis or fixture creation.

### P1 — Verification and lint gates are incomplete

The frontend production build/typecheck/tests pass, but the repository lint command fails on 3,945 formatting errors. Discord integration tests require a local PostgreSQL instance and fail before exercising their database assertions when it is absent. There is no checked-in GitHub Actions workflow in the inventory. A future cleanup cannot safely rely on a single green gate until these checks are separated and made reproducible.

### P1 — Documentation and runtime state have drifted

`server/package.json` still describes a Phase 1 API with no financial or identity workflows while those modules are present. `README.md` still calls the product a frontend prototype. Older backend state documents report 37/40 migrations and earlier phase boundaries while the schema currently has 98 migrations and materially more modules. This creates a real cleanup risk: old docs can cause an operator to delete or preserve the wrong code.

### P2 — Large application seams increase change risk

The largest files are `server/src/modules/admin/admin.service.ts` (6,278 lines), `src/routes/admin.tsx` (6,817), `src/repositories/http-repositories.ts` (6,191), `server/src/modules/submissions/application/submission.service.ts` (3,779), and `src/routes/collector-workspace.tsx` (3,744). These are decomposition candidates, not deletion candidates.

### P2 — Deployment artifacts are accumulating locally

Nine ignored `.tar.gz` / `.zip` release archives totaling approximately 114 MB are present at repository root. `.gitignore` correctly ignores them and deployment docs explicitly say not to create local bundles. They are safe cleanup candidates only after operator confirmation that no rollback/recovery workflow depends on them.

## Security and financial authority

Backend admin, catalogue, custody, finance, trading, and provider mutation routes use access-token and permission guards; sensitive financial mutations additionally use recent-auth / MFA boundaries where required. Helmet, request IDs, fail-closed provider configuration, webhook signature verification, encrypted provider/webhook payload storage, and audit/idempotency services are present.

The main security/config risks are operational: staging intentionally uses HTTP and `COOKIE_SECURE=false`; CSP retains documented `unsafe-inline` for SSR hydration; provider and worker activation are environment-controlled; and no automated CI evidence was found. These are documented staging constraints, not grounds to change production configuration during this audit.

Financial authority is backend-owned. Frontend repositories mostly map server projections. Presentation helpers derive display values from authoritative response fields, but `OwnershipService.percentageForUnits` is a low-confidence unused-looking helper and should be traced before removal. No financial, custody, ownership, or controlled asset data was changed.

## Performance

The admin catalogue uses database filtering, counting, ordering, `skip`/`take`, and bounded relation includes. The frontend uses query-driven pagination rather than global client filtering. Risk areas for a controlled later wave are: derived admin filters that may require broader relation work; large admin service projections; unbounded diagnostic/seed scripts; large frontend bundles; and application-wide formatting failures making performance changes harder to review.

## Final audit status

**READY FOR CONTROLLED CLEANUP**, with the P1 canonicalization decision and staging database access treated as explicit prerequisites. No mass deletion, schema removal, data mutation, or deployment was authorized or performed.

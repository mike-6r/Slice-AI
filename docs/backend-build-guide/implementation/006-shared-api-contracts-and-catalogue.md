# 006 — Shared API contracts and catalogue

## 1. Document metadata

Phase 3; **COMPLETE 2026-08-06**; medium risk; requires 001–005. Supports catalogue reference and metadata APIs only. Affects catalogue/domain/contracts/Prisma. Large; limited parallel safety.

## 2. Project-specific context

Assets/categories/sets/grades currently come from `src/mocks/market.ts` and legacy exports in `src/repositories/market-repository.ts`. `src/domain/asset.ts`, marketplace components and listing validation encode the frontend vocabulary. The backend has no catalogue model/API. This document creates canonical shared DTOs and reference-data authority; 007 owns price/market reads and 010 owns submissions.

## 3. Current implementation audit

Frontend has duplicate modern/legacy domain models and rich mock fields. Preserve UI-required semantics but do not copy presentation-only CSS/status labels into DB. Backend only has identity. Missing catalogue module, identifiers/slugs, category/set/grade models, public projections, admin maintenance and contract fixtures. Resolve API document numbers to this file.

## 4. Files to read

Read `src/domain/{asset,common,models}.ts`, `src/mocks/{market,home}.ts`, `src/repositories/market-repository.ts`, `src/data/repositories.ts`, marketplace/market card/detail/listing components/routes, `src/validation/schemas.ts`, all server contracts/config/database/access files, Prisma schema, 001–005, feature/API/entity/business/workflow guides.

## 5. Strict scope

Define wire conventions and cursor envelope; add Category, CollectibleSet, GradingCompany, GradeScaleEntry and Asset catalogue identity/metadata; read APIs and privileged reference-data maintenance; stable slugs/IDs; seed only noncontroversial grading/category reference values used by UI; contract tests.

## 6. Out of scope

No prices/charts/order book (007), submission workflow (010), valuation/custody/publication (011), ownership/trading, speculative authenticity/provider claim, frontend integration (009) or visual change.

## 7. Dependencies and preconditions

Require DB/control plane. Catalogue editorial/legal naming and supported grading scales must be approved; if not, seed only clearly labelled demo fixtures outside production. IDs are UUID; public URLs use immutable unique slug. Money conventions from shared contracts: integer minor units plus ISO currency; ratios basis points; quantities strings when precision can exceed JS safe integer.

## 8. Database specification

- `Category(id,slug unique,name,iconKey?,description?,status ACTIVE|ARCHIVED,sortOrder,createdAt,updatedAt)`.
- `CollectibleSet(id,categoryId FK restrict,slug unique,name,manufacturer?,releaseYear?,edition?,status,createdAt,updatedAt)` with index category/status.
- `GradingCompany(id,code unique,name,status,createdAt,updatedAt)`.
- `GradeScaleEntry(id,companyId FK restrict,grade decimal(4,2),label,conditionLabel?,sortOrder,active)` unique company+grade.
- `Asset(id,publicId unique,slug unique,categoryId,setId?,title,shortName?,year?,manufacturer?,edition?,cardNumber?,description?,gradeScaleEntryId? FK restrict,certificationNumber? private-by-policy,status DRAFT|IN_REVIEW|VERIFIED|PUBLISHED|ARCHIVED,heroMediaId? deferred FK,createdAt,updatedAt,publishedAt?)` with search/filter indexes and unique grade-scale-entry/certification identity only when the certification is non-null.
  No hard deletes for referenced rows. Migration `catalogue_foundation`; seed versioned category/grading fixtures. Media/valuation/ownership fields do not belong here.

## 9. Domain types and ports

Branded IDs/slugs; `Money {minor:string,currency:"GBP"}`; `BasisPoints`; `CursorPage<T>{items,nextCursor,hasMore}`; catalogue entities/enums. `CatalogueRepository`: `listCategories`, `getCategoryBySlug`, `listSets`, `getSet`, `listGradingCompanies`, `resolveGrade`, `create/update/archive*`, `createAssetIdentity`, `getAssetIdentity`, `findBySlug/publicId/certification`, `updateAssetMetadata`. Mappers isolate Prisma. `CataloguePolicy` validates category-set-grade compatibility.

## 10. Domain rules and invariants

Slugs are lowercase stable and never silently reused. Archived reference data remains readable but cannot be assigned anew. Set must belong to category; a selected grade-scale entry must exist and be active. Grade company and decimal grade are derived from that entry rather than duplicated on the asset. Public list returns only PUBLISHED assets; admin can view lifecycle states. Certification number is not searchable/public unless policy approves. All list ordering is deterministic with ID tie-breaker.

## 11. Application services

Public list/get reference data and asset catalogue projections; admin create/update/archive with permission, validation, idempotency and audit. Asset identity creation is internal/collector-authorized input for 010 and starts DRAFT. Transactions protect slug/cert uniqueness and reference validation.

## 12. API specification

`GET /v1/categories`; `GET /v1/categories/:slug/sets?cursor&limit`; `GET /v1/grading-companies`; `GET /v1/grading-companies/:code/grades`; `GET /v1/catalogue/assets/:slug` public published metadata. Admin `POST/PATCH /v1/admin/categories`, sets and grading resources, and internal/admin asset identity endpoints. Public reads 200/cacheable with ETag; cursor max 100; mutations require permission, idempotency, rate limit and audit. Exact DTO fields mirror models but omit private/internal timestamps/cert policy fields.

## 13. Error catalogue

`CATALOGUE_NOT_FOUND` 404; `SLUG_CONFLICT` 409; `REFERENCE_ARCHIVED` 409; `INVALID_CATEGORY_SET` 422; `INVALID_GRADE` 422; `CERTIFICATION_CONFLICT` 409; `ASSET_NOT_PUBLIC` 404; canonical validation/auth/idempotency/rate errors. Log IDs/constraint names, not certification/metadata values.

## 14. Authorization and security

Public reads expose allowlisted fields only. Catalogue editors/platform admins mutate reference data; collector submission flow cannot publish/archive reference data. Prevent mass assignment and unsafe HTML; descriptions are plain text or sanitized at render. Admin changes audited.

## 15. Audit and idempotency

All creates/updates/archives require keys and audit actions `catalogue.*`; metadata records field names and old/new status, not sensitive certificate value. Same request replays resource/status; conflict follows 005.

## 16. Events, realtime and jobs

Return `catalogue.reference.changed.v1` and `catalogue.asset.metadata.changed.v1` for later outbox. No realtime/jobs now. Frontend may invalidate category/set/asset queries once 017/009 exist.

## 17. Frontend alignment

Map category, set, grading, grade and asset metadata to `src/domain/asset.ts`, listing schema selectors and marketplace labels. `AssetRepository` methods remain mock-backed; this document does not change frontend. Maintain compatibility aliases in the future adapter rather than duplicating backend fields.

## 18. Implementation file plan

Create `server/src/modules/catalogue/{domain,application,persistence,http}` and tests; modify Prisma/app module/shared contracts. Preserve identity and frontend; avoid market/valuation fields.

## 19. Numbered implementation process

1. Inventory frontend field vocabulary and classify domain vs presentation.
2. Define shared money/ratio/cursor/date wire contracts.
3. Add/review migration and versioned reference seeds.
4. Add domain compatibility rules and repository ports/mappers.
5. Implement public reads and admin mutations.
6. Add ETag/cursor/filter stability and safe projections.
7. Add DB/HTTP/contract tests and seed verification.
8. Update guide ownership/state.

## 20. Test plan

Unit: slug/grade/category compatibility, money/cursor serialization. DB: uniqueness, archived refs, FKs, deterministic pages, seed repeatability. E2E: public/admin endpoints, filters, cursor, ETag, permissions, idempotency, private field exclusion. Contract fixtures compile against frontend-domain adapter shapes. No Redis/provider/browser visual tests.

## 21. Manual QA

Apply/seed disposable DB, list references, create an admin-only category/set/asset identity, test invalid set/grade and duplicate slug, archive reference, confirm published-only behavior and audit rows. No frontend/mock change.

## 22. Verification commands

From `server/`: Prisma format/validate/generate/migrate status; seed command added to package; lint, unit, integration, E2E, build. From root: typecheck/build for shared-contract compatibility only.

## 23. Documentation and state updates

Update all state/checklist/index/order files plus API/entity/business/workflow/feature maps and verification baseline. Catalogue entities and endpoints map primarily to 006 only.

## 24. Completion checklist

- [x] Shared wire types define integer money, basis points, ISO dates and cursors; no price/valuation/ownership DTO is published while SD-001 remains unresolved.
- [x] Category/set/company/grade/asset schemas and indexes are migrated (`0005_catalogue_foundation`).
- [x] Category-set-grade compatibility and archive gates are enforced.
- [x] Public projections expose only published allowlisted metadata fields.
- [x] Admin mutations are authorized, idempotent, rate-limited and audited.
- [x] `catalogue-reference-v1` is versioned/repeatable and contains non-economic references only.
- [x] DB/E2E/contract tests pass: 60 unit, 32 real integration, 24 HTTP E2E.
- [x] Market/submission/frontend work was not started.

## 25. Final report format

Report all 17 standard items and next document `007`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

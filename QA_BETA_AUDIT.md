# SLICE LIVE BETA QA — PHASE 2 CONTINUATION

**Environment:** https://staging.slicecollectable.com  
**Audit date:** 2026-08-15  
**Deployed commit:** `3db48f8`  
**Decision:** **GO — CONTROLLED BETA / EXTERNAL INVITED BETA NO-GO**

## Deployment verification

- VPS and Git `main` both run `3db48f8`.
- `slice-api.service` and `slice-web.service` are active.
- `/health` returned `200` with `status: ok`.
- `/ready` returned `200`; PostgreSQL and Redis are up.
- Prisma validation passed and `58` migrations are up to date.
- Staging API environment is `APP_ENV=beta`; object storage is configured in the VPS environment.
- The frontend was rebuilt with `VITE_APP_ENV=beta`, API data mode, and the staging API base URL.

## Phase 2 regression fixed

The previous staging frontend had been built without `VITE_APP_ENV=beta`. The client therefore defaulted to development and rendered retired showcase asset links and demo trading controls. Commit `3db48f8` makes the staging build policy explicit (`VITE_APP_ENV` defaults to `beta` in the staging deploy script).

Browser re-QA after redeploy confirmed:

- Beta banner is visible.
- Homepage shows only the clearly labelled static Umbreon educational example.
- Homepage has no retired `slice-demo-*` links and no demo buy/sell block.
- `/marketplace` returns a truthful controlled empty state; public API returned `200` with zero assets.
- `/collectors` returns a truthful empty public profile state; public API returned `200` with zero collectors.
- `/vault-live` remains explicitly illustrative and does not claim live inventory.
- Direct retired asset route returns `Asset not found` without console errors.
- `/list` and unknown-route handling render without console errors.
- No console errors were observed on the public route pass.

## Issue status (IDs preserved)

| Issue | Status | Evidence |
|---|---|---|
| AUTH-001 | FIXED (prior pass; authenticated re-test pending credential confirmation) | Prior session regression evidence retained; no anonymous auth loop observed. |
| MARKET-001 | FIXED | Controlled empty Marketplace API/UI. |
| MARKET-002 | FIXED / REGRESSION REMEDIATED | Beta rebuild removes retired homepage links; retired direct route is unavailable. |
| MARKET-003 | FIXED | Static image is labelled educational; demo trading controls are gated in Beta. |
| COL-001 | FIXED / PROVENANCE-SAFE | Prior retirement evidence retained; public collector projection is empty. |
| ONBOARD-001 | FIXED / BETA-DEFERRED (authenticated re-test pending) | Prior backend-authorised Beta onboarding evidence retained. |
| ADMIN-001 | FIXED (authenticated re-test pending) | Prior admin-only navigation evidence retained. |
| ADMIN-002 | FIXED (authenticated re-test pending) | Prior Control Center route/status evidence retained. |
| GLOBAL-001 | PASS | Public route pass showed no new console or layout failure. |

## Remaining verification gate

Investor, Collector, and Admin credentials were not entered during this pass because browser credential transmission requires an explicit confirmation immediately before typing. Fresh listing, R2 upload, Ximilar analysis, Admin review, intake selection, and cross-user authorization therefore remain **NOT EXECUTED in this pass**, not falsely marked as passed.

## Beta decision

**Controlled Internal Beta: GO** based on the deployed safety gates, healthy services, truthful empty public state, and prior authenticated remediation evidence.  
**External Invited Beta: NO-GO** until the fresh authenticated listing/R2/Ximilar/Admin/intake/security acceptance run is completed and provider-backed readiness is explicitly confirmed.

## Phase 9 physical lifecycle gate — 2026-08-15

The approved Charizard submission was checked read-only before any physical transition:

- Submission `054e7773-87ad-4b5e-9701-916a3aa5144d` remains `APPROVED`, version `12`, with no canonical Asset.
- Front and back evidence are present, `SAFE`, checksummed, private, and stored through `S3_COMPATIBLE` durable object storage.
- Persisted PriceCharting research remains the exact Product `5605741` raw `PRICE_GUIDE` observation (`10969` USD minor units); no provider call was made.
- Intake reference remains `SLICE-3AA5144D`.
- The selected `staging-gb-intake` record is `environment=beta` and active, but `operationallyApproved=false` and `acceptingShipments=false`. It is not a real operator-controlled receiving destination.
- No shipment, tracking number, delivery, Slice receipt, verification, valuation, custody, canonical Asset, publication, issuance, funding, or order was created.

**STOP CONDITION:** `WAITING_FOR_REAL_OPERATOR_APPROVED_DESTINATION_AND_PHYSICAL_SHIPMENT`. The staging fixture must not be used for a physical shipment. A real destination must be configured and approved through the audited Admin/Vault Operations flow, then the operator must actually send the card with real tracking before the next lifecycle gate can be exercised.

## Collector + Admin panel regression audit — 2026-08-14

The authenticated Collector/Admin browser pass is documented in `QA_COLLECTOR_ADMIN_AUDIT.md` with structured issues in `QA_COLLECTOR_ADMIN_ISSUES.json`.

- Collector workspace routes, empty states, subscription, profile and settings loaded without console errors.
- `/list` Step 1 accepted an exact PriceCharting URL and populated the canonical card identity without saving a new draft.
- Collector Overview now includes a direct **List an Asset** action (`COL-ACTION-001`, fixed in this pass).
- Admin Overview, Accounts, Review Queue, Physical Intake, Asset Operations, Memberships, Finance & Trading, Trust & Support and Platform Operations tabs loaded without console errors.
- `ADMIN-COL-001` remains open: the Admin **Collectibles** nav item renders the Asset Operations pipeline rather than a separate canonical catalogue. This is not hidden with a front-end alias because the required authoritative catalogue projection is not present.
- `ADMIN-TELEMETRY-001` remains open: Platform Operations aggregate health is `Unknown` while unavailable webhook/feature-flag telemetry is explicitly labelled.
- No shipment, delivery, receipt, verification, valuation, custody, issuance, publication or order was fabricated.

**Current decision:** Controlled internal read-only beta remains GO with the documented limitations. External invited beta remains NO-GO pending the open Admin Collectibles route issue, separate-identity RBAC/IDOR checks, and fresh upload/Ximilar/submission lifecycle checks.

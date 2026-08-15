# Slice External Invited Beta — Release Readiness

**Gate date:** 2026-08-15  
**Environment:** https://staging.slicecollectable.com  
**Decision:** **NO-GO**

This is the final software release gate for invited external Beta users. The decision is intentionally stricter than the controlled internal Beta decision. Phase 10 trading and every physical lifecycle transition remain disabled.

## Deployment

- Git `main`: `9ef152b99dc3660965ba231f73226d62452c831c`
- VPS `/opt/slice/app`: same commit
- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: 200, `status: ok`
- `/ready`: 200, PostgreSQL and Redis up
- Prisma: 58 migrations, no pending migrations
- API `APP_ENV`: `beta`
- Frontend: rebuilt on VPS with `VITE_APP_ENV=beta`, `VITE_DATA_SOURCE=api`, and `VITE_API_BASE_URL=https://staging.slicecollectable.com`

The gate found and corrected a stale frontend deployment during verification. The first VPS rebuild used an empty API base value and produced an `Invalid base URL` client error; the frontend was rebuilt with the literal staging origin and the browser error cleared. This was an operational build correction only; no source, database, fixture or domain data was changed.

## Public site

Current public browser smoke after the corrected build:

- Homepage: PASS — Beta badge, truthful static Charizard education, no retired `slice-demo-*` links, live market pulse empty state.
- Marketplace: PASS — `0` assets and truthful “No collectibles available yet” state; no retired showcase data.
- Collectors: PASS — public empty state, no private data observed.
- Vault Live: PASS — Beta-safe empty/illustrative state.
- Login and unknown route: PASS — login renders; unknown route is a normal not-found page.
- Public API market/collector projections: 200 with empty items.
- Browser console after corrected build: no errors or warnings in the public smoke.

## Investor, Collector and Admin

The latest authenticated evidence remains the prior controlled internal-Beta evidence recorded in `QA_BETA_AUDIT.md` and the role-specific QA reports. A fresh independent Investor, Collector, second-Collector, Staff and Admin session was not completed in this gate because credentials were not entered into the browser during this run. Therefore these are not represented as fresh external-release passes.

Open release evidence:

- `ADMIN-PHASE3-001` — fresh Admin route, mutation, RBAC/IDOR, responsive, accessibility and request-health walkthrough required.
- `COLLECTOR-PHASE3-001` — fresh Collector Steps 1–6, media, privacy, Ximilar, responsive, accessibility and request-health walkthrough required.
- `COL-PRIVATE-MEDIA-001` — owner/Staff/Admin allow matrix and second-Collector/Investor/anonymous deny matrix require a fresh signed-download/address-privacy exercise.
- Investor final browser matrix (Dashboard, Portfolio, Wallet, Orders, Activity, Become Collector) is not fresh evidence for this release.

These are core release-gate evidence gaps affecting auth, RBAC/IDOR, private media and intake privacy. Under the stated gate rule they keep the external Beta **NO-GO**, even though controlled internal read-only Beta remains available.

## Providers and operations

- R2/object storage: `S3_COMPATIBLE` configured on VPS; prior anonymous object and bucket-list checks were denied. A valid owner signed-download and expiry matrix was not freshly exercised in this gate.
- PriceCharting: exact Product `5605741` mapping and raw `PRICE_GUIDE` semantics retained; ordinary page rendering made zero provider calls.
- Ximilar: safe optional integration; latest permitted application attempt returned `NOT_CONFIGURED` with zero provider calls and no grade claim. This is an accepted Beta limitation, not a fabricated pass.
- Intake: `beta-test-uk-intake` active, intake-available, operationally approved, accepting shipments and Pokémon-eligible. Controlled Charizard remains selected there.
- Notifications/webhooks/feature flags: core API is healthy; optional webhook and feature-flag telemetry remains explicitly limited/unavailable rather than reported as healthy.
- PostgreSQL and Redis: ready checks PASS. Workers, job retry state, audit visibility and staff-only operations still need the fresh authenticated operational walkthrough.

## Security and safety

The public smoke observed no private payload leakage and no retired asset links. Prior controlled checks recorded owner submission `200`, second Collector `404`, Investor `404`, Collector Admin `403`, Investor Collector Workspace `403`, anonymous R2 object denied and bucket listing denied. Because the signed-download and intake-address privacy matrix was not freshly repeated, security is **NO-GO for invited external users**.

The controlled Charizard was read-only throughout this gate:

- submission `054e7773-87ad-4b5e-9701-916a3aa5144d`: `APPROVED`
- destination: `beta-test-uk-intake`
- reference: `SLICE-3AA5144D`
- shipment, delivery, receipt, verification, valuation, custody, publication, issuance, funding and order: none
- Phase 10: `NOT_STARTED`

## Accepted limitations

Plaid, Bridge, SMS, email verification, 2FA, optional Ximilar visualisation and advanced webhook/feature-flag telemetry remain Beta-disabled or explicitly limited. These are acceptable only while they do not create false success states or block unrelated controlled Beta workflows.

## Final decision

| Surface | Decision |
| --- | --- |
| Public site | GO after corrected Beta build |
| Investor | NO-GO pending fresh authenticated evidence |
| Collector | NO-GO pending fresh authenticated evidence |
| Admin | NO-GO pending fresh authenticated evidence |
| Security | NO-GO pending signed-media/intake privacy matrix |
| Operations | NO-GO for invited external release; internal read-only Beta available |
| Controlled internal Beta | GO with documented limitations |
| External Invited Beta | **NO-GO** |

**Phase 9 software ready:** YES  
**Current physical gate:** `WAITING_FOR_PHYSICAL_SHIPMENT`  
**Ready for Phase 10:** NO

# Slice External Invited Beta — Release Readiness

**Gate date:** 2026-08-15  
**Environment:** https://staging.slicecollectable.com  
**Decision:** **NO-GO**

This is the final software release gate for invited external Beta users. The decision is intentionally stricter than the controlled internal Beta decision. Phase 10 trading and every physical lifecycle transition remain disabled.

## Deployment

- Git `main`: `387d240248aaf0fa3047b9574ffc80237a13358c`
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

## Fresh authenticated browser evidence

Fresh staging browser evidence was collected on 15 Aug 2026. The public smoke remains PASS. The operator account (`povnu@icloud.com`) authenticated and the Admin Console loaded after the authenticated navigation retry; all primary Admin sections, the read-only account detail, platform health view and the controlled Charizard intake view were exercised without console errors. The controlled Charizard remained APPROVED at `beta-test-uk-intake`, reference `SLICE-3AA5144D`, with no shipment or other physical lifecycle state changed.

The verified controlled Collector account (`demo-collector@slicecollectable.com`) authenticated successfully. Collector workspace Overview, My Collectibles, Submissions, Your Actions, Subscription, Public Profile and Settings loaded without console errors. The approved Charizard view and its Media tab showed the existing front/back evidence and the correct read-only next action (ship only when a real shipment occurs). The full `/list` Steps 1–6 flow, fresh uploads, private-media matrix, intake-address matrix and Ximilar action were not executed because they require a disposable side-effecting QA record and separate role credentials.

The previously supplied plural-domain demo credentials were rejected. A fresh Investor session could not be established, so the Investor matrix remains open. No credentials were written to artifacts, logs or source.

Open release evidence:

- `ADMIN-PHASE3-001` — read-only routes are fresh PASS, but safe reversible mutation, RBAC/IDOR, responsive, accessibility and request-health evidence is still required.
- `COLLECTOR-PHASE3-001` — workspace and controlled Charizard views are fresh PASS, but Steps 1–6, fresh media, privacy, Ximilar, responsive, accessibility and request-health evidence is still required.
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

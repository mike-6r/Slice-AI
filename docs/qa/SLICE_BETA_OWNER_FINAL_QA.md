# Slice Beta Final QA

## Executive Result

**FAIL — NOT READY for full owner sign-off.** The focused SLICE-002 Collector authorization retest is now closed and ready to resume the owner Beta plan, but economic/lifecycle QA, private-media coverage and responsive evidence remain outstanding.

The public site, current Investor session, read-only marketplace/detail surfaces, health checks, and automated release gates were exercised. Destructive/economic QA remains stopped before purchase or lifecycle mutation. The dedicated Collector’s supported API/session/IDOR cleanup and final browser wrong-role retest are complete. Responsive viewport evidence remains pending.

## Environment

- Environment: `https://staging.slicecollectable.com`
- QA date: 2026-08-21
- Repository: `C:\Users\Aarons\Documents\Codex\2026-08-05\files-mentioned-by-the-user-you\work\slice-project`
- Branch: `main`
- Source HEAD: `b26e407` (`fix: reconcile beta release runtime contracts`)
- Active VPS release: `/opt/slice/releases/20260821-b26e407`
- `/opt/slice/current` and `/opt/slice/app`: same release
- `PROVIDER_MODE=stripe_sandbox`
- `STRIPE_IDENTITY_ENABLED=true`
- `STRIPE_LIVE_ENABLED=false`
- `/health`: 200
- `/ready`: 200; PostgreSQL and Redis up
- Prisma migrations: 79 found, database up to date
- Provider health: PriceCharting configured, no paid call made

## Build / Release

| Check | Result |
|---|---|
| Prisma validate | PASS |
| Prisma generate | PASS |
| Backend typecheck | PASS |
| Backend production build | PASS |
| Backend unit tests | PASS — 63 suites / 263 tests |
| Frontend typecheck | PASS |
| Frontend tests | PASS — 38 files / 132 tests |
| Frontend production client + SSR build | PASS |
| Frontend lint | FAIL — existing repository-wide Prettier failure, 4,890 errors |
| Backend integration tests | PASS — 34 suites / 124 tests |
| Backend E2E tests | PASS — 32 suites / 102 tests; clean process exit |

## Accounts Used

- Public/logged-out routes.
- Existing authenticated Investor session: `demo-investor@slicecollectable.com` (read-only browser coverage).
- Fresh Collector browser session was used for the SLICE-002 authorization retest after the supported role cleanup; no credentials were written to artifacts.
- No credentials were written to artifacts.

## Current Protected-State Inventory

Read-only database inspection showed:

- Umbreon: `PUBLISHED`; custody `NONE`; supply `ACTIVE`; issued `1000`; market `OPEN`; trading enabled; 1 execution; 4 orders.
- Controlled Initial Offering QA card: `PUBLISHED`; custody `SECURED`; supply `ACTIVE`; issued `1000`; offering `PARTIALLY_FILLED`; 1 execution; 2 orders.
- Charizard was not touched.
- No lifecycle, order, ownership, wallet, Stripe, or role mutation was made during this QA pass.

## Severity Summary

| Result | Count |
|---|---:|
| PASS | 47 |
| FAIL | 1 |
| BLOCKED | 18 |
| N/A | 4 |
| Critical open bugs | 0 |
| High open bugs | 1 |
| Medium open bugs | 1 |

## QA Case Results

Every case below is represented in `SLICE_BETA_OWNER_FINAL_QA.json`.

### 1. Pre-flight, public website and authentication baseline

- `QA-001` PASS — repository clean, branch and last five commits recorded.
- `QA-002` PASS — active release, provider mode, Stripe live flag, and identity flag verified.
- `QA-003` PASS — migrations current; health/readiness and Redis/PostgreSQL checks green.
- `QA-004` PASS — homepage loads with Beta communication and no browser console errors.
- `QA-005` PASS — How It Works, Security, Help Centre, Fees and Collectors routes render.
- `QA-006` PASS — login page, signup entry route and unknown-route 404 render safely.
- `QA-007` PASS — intentionally removed `/vault-live` and `/governance` return the normal 404 page; no stale customer navigation was observed.
- `QA-008` PASS — public images loaded with nonzero natural dimensions; decorative favicon images are explicitly hidden from assistive technology.
- `QA-009` PASS — public market/collector/vault API projections returned only public projection fields in the exercised responses. Published approved media is delivered through short-lived URLs as required for the public published projection.
- `QA-010` PASS — screenshot evidence captured at `docs/qa/screenshots/owner-beta-final/marketplace-loaded.png` and `umbreon-detail-loaded.png`.
- `QA-011` PASS — current authenticated Investor session restored and remained present across route navigation without refresh-console errors.
- `QA-012` PASS — anonymous protected API requests returned 401 for portfolio, wallet, orders, Collector workspace and Admin overview.

### 2. Investor dashboard, marketplace and detail

- `QA-013` PASS — Investor Portfolio route loaded and displayed account-scoped overview/holdings/activity sections.
- `QA-014` PASS — Investor Wallet loaded authoritative GBP balances, pending/reserved states and truthful Stripe Bacs/Identity gating.
- `QA-015` PASS — Orders route loaded account-scoped order history; no mutation performed.
- `QA-016` PASS — Notifications route rendered account-scoped notifications and truthful unread state.
- `QA-017` PASS — Account route rendered profile, verified email, security, sessions and Identity state.
- `QA-018` PASS — Investor direct navigation to Collector workspace and Admin returned safe access-required boundaries.
- `QA-019` PASS — marketplace loaded published cards, filters, view controls, search controls and sorting controls.
- `QA-020` PASS — Umbreon detail identity, set, number, raw condition, media, valuation and ownership sections rendered.
- `QA-021` PASS — Slice Grade rendered as advisory and separate from collector condition; estimated grade 4 / Very Good and component scores were visible.
- `QA-022` PASS — Slice Grade evidence lightbox opened the enlarged front overview image and exposed an accessible close control; no state changed.
- `QA-023` PASS — public Collector directory safely showed the current empty public state.
- `QA-024` PASS — deployed homepage Umbreon card uses the shared authoritative projection: `Raw / Ungraded`, `Condition: Mint`, card number, Slice valuation and reference context; misleading legacy labels are absent.
- `QA-025` PASS — current public detail showed no fake 24-hour movement; it showed no market-history data where history was unavailable.
- `QA-026` PASS — public detail showed explicit reference-only market-data language and PriceCharting asking-price context.

### 3. Purchase, ownership, portfolio and selling

- `QA-027` BLOCKED — no disposable purchase fixture was created because authorization baseline failed first.
- `QA-028` BLOCKED — quantity validation and purchase confirmation were not exercised; no economic mutation permitted after Critical role finding.
- `QA-029` BLOCKED — exact purchase/availability/ownership reconciliation was not started.
- `QA-030` BLOCKED — Investor portfolio arithmetic could not be independently reconciled against a newly created fixture; existing controlled history was read only.
- `QA-031` BLOCKED — selling validation was not exercised; no controlled trades were changed.
- `QA-032` BLOCKED — concurrency/double-purchase tests require isolated disposable DB fixtures and integration services.

### 4. Collector, submission, media, Admin and lifecycle

- `QA-033` PASS — supported cleanup leaves `demo-collector@slicecollectable.com` with active `USER + COLLECTOR`; unwanted assignments remain revoked and audited.
- `QA-034` PASS — fresh Collector login succeeded, Collector Workspace loaded as Slice Demo Collector, and refresh preserved the session. The prior disabled-login symptom was deployment asset-pointer drift, not the login component.
- `QA-035` BLOCKED — new disposable listing and card-identification workflow was not started.
- `QA-036` BLOCKED — upload, replace/remove, invalid-file and pre-publication private-media matrix was not started.
- `QA-037` PASS — existing public Umbreon Slice Grade is displayed as advisory, not as an official grade; fresh provider analysis was not triggered.
- `QA-038` BLOCKED — fresh submission/idempotency/status/intake workflow was not started.
- `QA-039` BLOCKED — Admin review, intake and publication workflow was not started because the required Collector → Admin baseline was not safe to proceed.
- `QA-040` BLOCKED — Collector public-profile privacy matrix needs independent Collector and Investor sessions.
- `QA-041` PASS — Investor account settings were read-only inspected; no mutation was submitted.
- `QA-042` BLOCKED — Collector account settings and membership state were not independently tested.
- `QA-043` BLOCKED — Collector → Admin, Admin → Marketplace and Marketplace → Investor lifecycle cannot be signed off without a safe disposable fixture and fresh role matrix.

### 5. Permissions, isolation and security

- `QA-044` PASS — logged-out protected API baseline returned 401.
- `QA-045` PASS — Investor UI direct routes to Collector workspace/Admin were denied safely.
- `QA-046` PASS — focused Collector API denial remained 401/403/404 as expected; the browser direct-route matrix showed safe access-required/reviewer boundaries and no staff content.
- `QA-047` PASS — the known Collector B submission route rendered `Submission unavailable`; no private details, media or metadata were exposed.
- `QA-048` BLOCKED — logout Account A → login Account B cache-isolation matrix was not run.
- `QA-049` PASS — no credentials, provider secrets or private account payloads were written to QA artifacts; no direct DB mutation was used.
- `QA-050` BLOCKED — draft/private-media anonymous and cross-user signed-download matrix needs a disposable submission and independent sessions.

### 6. Error handling, responsive and cross-browser

- `QA-051` PASS — public browser console contained no errors/warnings across exercised pages; no unexpected public 500s were observed.
- `QA-052` PASS — expected anonymous 401s were limited to protected APIs; no 401 loop was observed in the authenticated Investor route pass.
- `QA-053` BLOCKED — the in-app browser viewport override did not apply: the browser continued reporting 1280×720 for requested 390×844, 768×1024, 1366×768 and 1920×1080. Fresh responsive sign-off requires a viewport-capable browser surface.
- `QA-054` PASS — Chromium-based in-app browser public smoke completed.
- `QA-055` N/A — Edge was not connected for this pass; execute before external Beta sign-off.
- `QA-056` N/A — Safari is unavailable in this environment and is not claimed as tested.

### 7. Integrations and Stripe sandbox

- `QA-057` PASS — PriceCharting provider health returned configured/UP and explicitly said no paid call was made; no new refresh job appeared during page-render QA.
- `QA-058` PASS — no Ximilar page-render call was triggered; persisted Slice Grade was displayed.
- `QA-059` PASS — published approved media loaded through the public projection; unapproved/private media was not made public by this QA.
- `QA-060` PASS — Stripe Identity Wallet state was truthful: pending review, not falsely verified.
- `QA-061` BLOCKED — Bacs hosted setup, webhook completion and settlement idempotency were not rerun; no financial mutation was authorized.
- `QA-062` BLOCKED — Stripe Connect onboarding/readiness was not rerun; no payout or account creation was attempted.
- `QA-063` PASS — Beta-deferred providers (Plaid, Bridge, SMS/email delivery where disabled, advanced optional integrations) were presented as unavailable/deferred rather than fabricated success.
- `QA-064` N/A — Stripe live mode, live bank debit, live payout and real money are prohibited by the owner plan.

### 8. Automated QA and regression

- `QA-065` PASS — backend unit suite: 63 suites / 263 tests.
- `QA-066` PASS — frontend suite: 38 files / 132 tests.
- `QA-067` PASS — Prisma validation/generation, backend typecheck/build, frontend typecheck/build passed.
- `QA-068` FAIL — frontend lint is red with 4,890 repository-wide Prettier errors; see `SLICE-003` as related release evidence.
- `QA-069` PASS — isolated PostgreSQL/Redis runner with `PROVIDER_MODE=local` completed cleanly: integration 34/34 suites and 124/124 tests; E2E 32/32 suites and 102/102 tests, with clean process exit.
- `QA-070` N/A — no QA code fix was made during this pass, so a fix-specific regression retest is not applicable.

## Bugs Found

- `SLICE-001` Medium — homepage market-card terminology mismatch — Closed after deployed staging retest.
- `SLICE-002` Critical — dedicated Collector has active staff-reviewer assignments — Closed after supported cleanup and final browser authorization retest.
- `SLICE-003` High — local integration/E2E environment unavailable — Closed after isolated green-gate retest.

Full bug templates are in `docs/qa/bugs/`.

## Bugs Fixed

Source, test-contract and isolated-runner changes were committed as `b26e407` and deployed. No staging economic or lifecycle mutation was made.

## Outstanding Issues

1. Complete fresh disposable Collector → Admin → Marketplace → Investor lifecycle only after the permission gate is green.
2. Complete the anonymous/foreign signed-download private-media matrix with disposable fixtures.
3. Capture responsive evidence using a viewport-capable browser and execute Edge before external Beta sign-off.

## Final Sign-Off

- [x] No open Critical bugs — **YES** (`SLICE-002` closed; remaining blocked cases are planned QA scope)
- [x] No core High bugs — **YES** (`SLICE-003` closed; responsive/Edge evidence remains a general sign-off item)
- [x] Public website smoke
- [ ] Investor core purchase journey
- [ ] Collector core journey
- [ ] Submission journey
- [ ] Ownership integrity reconciliation
- [ ] Portfolio calculation reconciliation
- [x] Permissions / IDOR matrix — **SLICE-002 Collector browser authorization matrix complete**
- [ ] Private media matrix
- [ ] Collector → Admin
- [ ] Admin → Marketplace
- [ ] Marketplace → Investor
- [ ] Mobile/tablet responsive matrix
- [x] Disabled integrations documented
- [x] Production configuration remaining documented

## QA Result

### Focused SLICE-002 follow-up — 2026-08-21/22

- Login root cause: `/opt/slice/app` drifted from the web release to a Discord-only release without `dist/client`; Apache asset aliases returned 403, leaving the SSR login form non-hydrated and the Sign in control disabled.
- Runtime correction: `/opt/slice/app` was restored to `/opt/slice/releases/20260821-b26e407`; Slice API/web services restarted; assets returned 200 and health/readiness stayed green. No application source change was required.
- Fresh Collector login, workspace, refresh, staff-route denial, cross-Collector denial and logout passed. Console error/warning logs were empty on exercised routes. No lifecycle, ownership, trading, Stripe, Umbreon, Charizard or financial state changed.
- READY TO RESUME OWNER BETA QA: **YES**

**FAIL**

## Tested By

Automated/technical QA by Codex

## Date

2026-08-21

## Notes

No live Stripe mode, real money, physical shipment, custody, offering, ownership, order, execution, wallet, or Charizard mutation was performed. Current controlled state was preserved.

## Focused remediation follow-up — 2026-08-21

This is a focused follow-up to the three owner-authorized blockers; it is not a replacement for the full owner QA above.

- `SLICE-002`: **closed after final Collector browser authorization retest**. Collector A has exactly `USER + COLLECTOR`; three unwanted assignments remain revoked and audited. A fresh Collector browser session logged in, reached Collector Workspace, survived refresh, showed no staff navigation, and received safe access-required/reviewer boundaries for Admin, user-management, review, asset operations, finance, audit and role-management routes. Collector A could not load Collector B’s private submission; the UI showed `Submission unavailable` without private details or media. Logout returned the protected Collector route to the sign-in boundary. See `docs/qa/bugs/SLICE-002.md`.
- `SLICE-003`: **closed**. The isolated test runner applies 79 migrations to a separate `slice_test` database and uses isolated Redis with `PROVIDER_MODE=local`. Integration completed 34/34 suites and 124/124 tests; E2E completed 32/32 suites and 102/102 tests with a clean process exit.
- `SLICE-001`: **closed after deployment**. Homepage live cards now reuse the authoritative marketplace card projection; deployed browser evidence shows correct raw/condition/card-number/valuation terminology and no misleading legacy labels. Public Umbreon detail remained consistent.
- Automated follow-up: frontend 38 files / 132 tests passed; backend unit 63 suites / 263 tests passed; Prisma validation, backend/frontend typechecks, backend build, and frontend client/SSR build passed. The touched backend TypeScript files pass lint; repository-wide frontend Prettier debt remains separate.
- No economic, ownership, trading, Stripe, Umbreon, Charizard, ledger, or financial state was changed. The final Collector browser retest itself performed no state-changing operations beyond login/logout.

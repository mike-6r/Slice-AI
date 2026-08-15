# SLICE FULL COLLECTOR + ADMIN QA

Environment: https://staging.slicecollectable.com  
Audit date: 2026-08-15
Git/VPS commit: `628b00e1f722bffc53bf8cb57979e830a2971e10`
Accounts: controlled authenticated Collector (`@slice-demo-collector`) and Administrator (`@michael`)

## Deployment and provider gate

- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: PASS (200)
- `/ready`: PASS (200; PostgreSQL and Redis up)
- Prisma: prior deployment verification reported all migrations applied
- `APP_ENV=beta`: confirmed in the VPS environment file (values were not printed)
- R2/object storage: configured and operational in Platform Operations
- PriceCharting: operational; persisted research only on ordinary page loads
- Ximilar: operational; no page-render analysis call observed
- Intake: one approved Beta destination is reported by the read model; no shipment or receipt was created

## Collector scorecard

| Area | Result | Evidence |
|---|---|---|
| Auth / refresh / direct workspace | PASS | Authenticated workspace loaded directly and retained session during route navigation |
| Overview | PASS | Empty counts and membership state are consistent; no stale cards or console errors |
| List an Asset CTA | PASS | Added direct Overview link to `/list` |
| My Collectibles | PASS (empty state) | Status filters render; no fixture contamination |
| Collectible Detail | NOT TESTABLE | Account has zero controlled collectibles |
| Submissions | PASS (empty state) | Route and empty state render |
| Submission Detail | NOT TESTABLE | No owned submission available |
| Requests / Your Actions | PASS (empty state) | Filters render and remain empty |
| List Step 1 | PASS | PriceCharting URL import returned an exact product and populated details |
| List Steps 2–4 | NOT TESTABLE | No draft was saved or media was uploaded during the safety-bounded pass |
| AI Review / Ximilar | NOT TESTED | No fresh analysis was triggered |
| Review & Submit | NOT TESTABLE | No new submission was created |
| Subscription | PASS | Truthful no-active-plan state; no fake Stripe Active state |
| Public Profile | PASS | Profile editor and public toggle rendered |
| Settings | PASS | Collector-specific links rendered |
| Mobile / responsive | PASS (spot check) | Workspace content had no horizontal overflow at the tested desktop layout; narrow viewport checks were limited |
| Request health | PASS | No 401/403/409/429/500 loops or console errors observed on exercised routes |

Collector decision: **GO for controlled internal empty-state/listing-entry beta; NO-GO for external invited beta** until fresh upload, Ximilar, submission and cross-user privacy checks are completed.

## Admin scorecard

| Area | Result | Evidence |
|---|---|---|
| Auth / direct `/admin` | PASS | Admin Console loaded as Administrator |
| Overview | PASS | Counts, review workload and operational cards rendered |
| Accounts | PASS (read-only) | Users/role/status tabs and counts rendered |
| User Detail | NOT TESTABLE | No detail mutation exercised |
| Review Queue | PASS (read-only) | Queue counts, tabs and filters rendered |
| Submission Review | NOT TESTABLE | No controlled review mutation exercised |
| Physical Intake | PASS (read-only) | Destination/intake summary rendered with zero false receipts |
| Collectibles | FAIL | Nav currently renders Asset Operations, not a canonical catalogue; see `ADMIN-COL-001` |
| Collectible Detail | NOT TESTABLE | No canonical admin catalogue record selected |
| Asset Operations | PASS (read-only) | Lifecycle pipeline and filters rendered |
| Memberships | PASS (read-only) | Membership counts and status tabs rendered |
| Finance & Trading | PASS (read-only) | Finance/trading summaries rendered; no mutation exercised |
| Trust & Support | PASS (read-only) | Deferred compliance/support states render safely |
| Platform Operations | PARTIAL | Tabs load; aggregate health is Unknown because some telemetry is unavailable |
| Jobs / Webhooks / Integrations / Audit / Flags / Settings | PASS (read-only) | Each tab opened; no console errors; unavailable data is labelled rather than fabricated |
| Mobile | NOT TESTABLE | Desktop route pass completed; targeted narrow checks remain |
| RBAC / IDOR | NOT TESTABLE | Requires separate controlled identities; no cross-account mutation was attempted |
| Request health | PASS | No request storms or console errors on exercised routes |

Admin decision: **NO-GO for external invited beta** while `ADMIN-COL-001` remains open and RBAC/IDOR mutation checks are outstanding. Controlled read-only internal review: **GO with documented limitations**.

## Security and safety boundaries

- No physical shipment, tracking, delivery, Slice receipt, verification, valuation, custody, issuance, publication or order was fabricated.
- No provider call was triggered by ordinary page render during this pass.
- Private media, cross-user access, and anonymous R2 access require separate identities and are recorded as not testable rather than assumed.
- Plaid, Bridge, SMS, email verification and 2FA remain deferred/disabled; no fake success state was created.

## Issues

See `QA_COLLECTOR_ADMIN_ISSUES.json` for structured reproduction details. The contained Collector CTA regression was fixed in this pass. The Admin Collectibles/Asset Operations route collision is the top remaining functional issue.

## Latest authenticated Collector/Admin + intake verification — 2026-08-15

This section supersedes earlier “not testable” statements that describe an empty Collector account or an unconfigured intake destination.

### Deployment

- Git main and VPS: `628b00e1f722bffc53bf8cb57979e830a2971e10`.
- `slice-api.service` and `slice-web.service`: active.
- `/health`: PASS (200).
- `/ready`: PASS (200; PostgreSQL and Redis up).
- Prisma: 58 migrations, no pending migrations.
- Beta API/data mode, R2-compatible storage, PriceCharting and Ximilar configuration were present in the VPS environment; provider calls were not triggered by ordinary page loads.

### Collector

- Authenticated login, refresh/direct workspace navigation, workspace navigation items, Overview, My Collectibles, Submissions, Your Actions, Subscription, Public Profile and Settings: PASS.
- Controlled Charizard submission `054e7773-87ad-4b5e-9701-916a3aa5144d` appears once and remains `APPROVED`; no shipment, receipt, valuation, custody, canonical Asset or publication was created.
- Identity is `2023 Pokémon Charizard ex · Obsidian Flames · 223/197 · Special Illustration Rare · raw/ungraded`; front/back evidence is present, SAFE, checksummed, private and durable.
- The exact PriceCharting research record remains persisted and customer/staff projections read it without a new page-load provider call.
- A fresh exact-URL Base Set Charizard draft was created through the supported `/list` flow for Step 1–3 QA and was not submitted. Steps 4–6 and one live Ximilar analysis were not exercised.
- Requests/Your Actions displayed actionable Add tracking only for the approved record; no physical action was taken.
- Remaining Collector issues: legacy demo/draft noise in `/list` (`COL-FIXTURE-001`) and misleading review-pending journey copy for an approved record (`COL-STATUS-001`).

### Admin

- Authenticated Administrator login, refresh/direct `/admin`, Overview, Accounts, Review Queue, Physical Intake, Collectibles, Asset Operations, Memberships, Finance & Trading, Trust & Support and Platform Operations: PASS read-only.
- Review Queue correctly excludes the already approved controlled Charizard; Physical Intake shows it as shipping-required with no shipment.
- `ADMIN-COL-001` remains open: Collectibles still renders the Asset Operations board instead of a separate authoritative catalogue.
- `ADMIN-TELEMETRY-001` remains open: aggregate Platform Operations health is Unknown where telemetry is unavailable; individual configured checks remain truthful.

### Real UK Beta intake destination

- Destination `beta-test-uk-intake` is present in the real destination records and is active, intake-available, operationally approved, accepting shipments, environment `beta`, and category-eligible for Pokémon TCG.
- The operator approval audit and reason are present. The customer-safe address and testing-only shipping instructions are shown only through eligible authenticated intake flow; no public address was published.
- The controlled Charizard destination was selected through the Collector UI and now points to `beta-test-uk-intake`; old `staging-gb-intake` is not selected. Intake reference remains `SLICE-3AA5144D` and shipment is null.
- The destination upsert and `INTAKE_DESTINATION_SELECTED` audit event are now atomic. The event was verified for the controlled intake on 2026-08-15.

### Phase 9 gate

- Evidence ready: YES.
- Real destination ready: YES.
- Eligible destination selected: YES.
- Software ready for shipment: YES.
- Physical shipment: NO (intentionally not created).
- Current real-world gate: `WAITING_FOR_PHYSICAL_SHIPMENT`.
- Next action: the operator must physically send the real card with a real carrier and tracking number, then enter those details through the existing Collector flow. Do not fabricate any status.
- Phase 10 trading: NOT STARTED.

### Final decisions

- Collector panel: **GO for controlled internal Beta; NO-GO for external invited Beta** until cross-user privacy/RBAC, fresh upload/Ximilar, and fixture-noise cleanup gates are complete.
- Admin panel: **GO for controlled read-only internal Beta; NO-GO for external invited Beta** while the Collectibles route collision and separate-identity RBAC/IDOR checks remain open.
- Controlled internal Beta: **GO with documented limitations**.
- External invited Beta: **NO-GO**.

## Pre-shipment gate closure record — 2026-08-15

Current deployed commit: `af17a4ecf8ee2c118226065c3b73eb8a1c2fe435` (Git `main` and VPS).

- **Collectibles:** PASS. Browser QA showed six canonical catalogue records; Asset Operations is a separate lifecycle board.
- **Platform Operations:** PASS with limitation. Aggregate is `Operational with limitations`; Webhooks is `Unknown` and optional providers are explicitly Beta Disabled.
- **Approved journey:** PASS. Charizard `054e7773-87ad-4b5e-9701-916a3aa5144d` shows Approved and `Ship your collectible`.
- **Fixture cleanup:** PASS for disposable QA drafts. Three drafts were cancelled through the supported endpoint; cancelled history is retained and active projection now contains three records.
- **RBAC/IDOR:** Owner submission `200`; second Collector `404`; Investor `404`; Collector Admin `403`; Investor Collector Workspace `403`.
- **Fresh media:** front/back SAFE with checksums; anonymous private R2 object and bucket-list attempts were denied. A valid signed private-download URL was not testable because no customer-facing download endpoint is exposed.
- **Ximilar:** one allowed application attempt returned `NOT_CONFIGURED` with zero provider calls; cached refresh returned the persisted safe result. No grade was invented.
- **Responsive:** Admin Collectibles and Platform Operations had no horizontal overflow at 390×844, 768×1024 or 1920×1080; Collector workspace browser QA had no overflow on the exercised route.

Decision: Collector and Admin are **GO for controlled internal Beta**. Security and external invited Beta remain **NO-GO** pending the explicit signed-download/intake privacy/staff permission checks and provider configuration if live Ximilar grading is required. Physical state is unchanged: `beta-test-uk-intake`, `SLICE-3AA5144D`, shipment `NONE`, waiting for physical shipment.

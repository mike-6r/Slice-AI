# SLICE LIVE BETA QA AUDIT — REMEDIATION PASS 1

**Environment:** https://staging.slicecollectable.com  
**Audit date:** 2026-08-14  
**Deployed commit:** `68f83e4`
**Decision:** **GO — CONTROLLED BETA**

## Executive result

The staging application is healthy and the prior no-go blockers were rechecked after deployment. Investor authentication now survives reload and direct protected-route navigation. The public Marketplace is intentionally empty and explains that retired showcase data is not inventory. The homepage keeps only a clearly labelled educational Umbreon image and gates the demo trading block in Beta. Collector Beta onboarding grants access through the real backend role-capability endpoint and returns to `/list`. The Admin Console is discoverable only to the admin account and its Control Center now loads.

The Beta intentionally has no public inventory while provider-backed market, custody, payment, and identity integrations remain deferred. No fake Plaid success, fake market quote, or fractional-market claim is presented as live inventory.

## Deployment and safety

| Check | Result | Evidence |
|---|---|---|
| Git / services | PASS | `7c9efbf` on `main`; `slice-api.service` and `slice-web.service` active |
| API health / readiness | PASS | `/health` and `/ready`; PostgreSQL and Redis up |
| Prisma | PASS | Generate, validate, and migrate deploy; no pending migrations |
| Fixture retirement | PASS / NON-DESTRUCTIVE | `beta:retire-fixtures --dry-run` then `--execute`; 19 fixture assets, 24 fixture submissions, `realSubmissionsAffected: 0` |
| Database safety | PASS | No reset, drop, truncate, or destructive reseed |
| Public market projection | PASS / CONTROLLED EMPTY | `/api/v1/market/assets?limit=48` returns 200 with zero items |

## Role matrix re-QA

### Investor

- Login, dashboard, portfolio, and direct `/portfolio` navigation passed.
- Full reload restored the cookie-backed session before protected content rendered.
- Logout returned to the public state; direct `/portfolio` then showed the sign-in-required experience.
- Beta Marketplace showed `No collectibles available yet` with the controlled-beta explanation.
- Become a Collector showed the explicit Beta checklist, deferred-provider status, and `Enable Collector Beta access`; the successful action returned to `/list`.

### Collector

- Demo collector workspace loaded after the server-authorised role check.
- Retired `slice-demo-*` and `STG-*` fixture records are excluded from the private workspace projection; the two current drafts remain visible.
- List Step 1 rendered the trusted-link import field and the six-step progress UI. No external provider call or uncontrolled submission was forced.
- Later media/provider steps remain deferred until their configured integrations are available.

### Admin

- Admin login and reload passed.
- Account menu exposes `Admin Console`; investor menu does not.
- `/admin?section=control` loads the Control Center and operational projections.
- The `/admin/assets/operations` route collision was fixed by registering Lifecycle before Admin; Control Center no longer falls back to unavailable.
- Deferred provider cards use `BETA_DISABLED`/`NOT_CONFIGURED`/`UNKNOWN`; Beta Discord fixture delivery failures do not mark the platform degraded.

## Remediation verification

| Issue | Result | Evidence |
|---|---|---|
| AUTH-001 | FIXED | Investor reload/direct-route/logout browser checks |
| MARKET-001 | FIXED | Truthful controlled Marketplace empty state |
| MARKET-002 | FIXED | No Beta public links to retired `slice-demo-*` asset details; historical order links are gated |
| MARKET-003 | FIXED | Static Umbreon is labelled educational; demo buy/sell block is not rendered in Beta |
| COL-001 | FIXED / PROVENANCE-SAFE | Explicit fixture filter and retirement command; zero real submissions affected |
| ONBOARD-001 | FIXED / BETA-DEFERRED | Collector Beta flow, deferred identity status, real role grant, return to `/list` |
| ADMIN-001 | FIXED | Admin-only Account menu link verified |
| ADMIN-002 | FIXED | Control Center route precedence and provider status handling verified |

## Provider and notification policy

PriceCharting, Ximilar, Plaid IDV, Bridge, custody, and payment integrations were not simulated. Their unavailable/deferred states remain explicit. Authenticated notification stream `503 FEATURE_DISABLED` is treated as a safe disabled capability and the frontend does not reconnect endlessly.

## Evidence screenshots

- [Remediated homepage](./QA_BETA_remediated_home.png)
- [Remediated Marketplace](./QA_BETA_remediated_marketplace.png)
- [Remediated Collector Beta onboarding](./QA_BETA_remediated_onboarding.png)
- [Remediated Admin Control Center](./QA_BETA_remediated_admin.png)

## Final beta decision

**GO — CONTROLLED BETA.** Public inventory remains intentionally empty until a collectible completes the authoritative review, custody, and market-readiness path. The previous audit blockers are fixed on `7c9efbf`; provider-backed workflows remain explicitly deferred rather than represented by fake data.

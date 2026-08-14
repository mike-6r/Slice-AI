# SLICE LIVE BETA QA AUDIT

**Environment:** https://staging.slicecollectable.com  
**Audit date:** 2026-08-14  
**Deployed commit:** `81fe8a4`  
**Decision:** **NO-GO**

## Executive result

The staging application is reachable and the core API is healthy. Investor, collector, and admin credentials exist; authenticated API smoke tests for account, portfolio, collector workspace, and admin operations returned expected success responses. Public pages also had no observed console errors or horizontal overflow at 390, 768, and 1920 CSS pixels.

The beta is not ready for a clean end-to-end sign-off. The highest-impact findings are: authenticated browser sessions are lost after reload/direct protected-route navigation; the public Marketplace API returns an empty collection while 14 catalogue assets are published in the database; homepage and authenticated records still expose `slice-demo-*` fixture links that lead to an Asset not found page; and collector onboarding does not expose an Identity Verification action. These prevent reliable discovery, trading, collector onboarding, and admin workflow testing.

Full structured issue data is in [QA_BETA_ISSUES.json](./QA_BETA_ISSUES.json).

## Environment and deployment checks

| Check | Result | Evidence |
|---|---|---|
| Public site | PASS | Homepage, Marketplace, Collectors, Vault Live and List routes reachable |
| API health | PASS | `/health` and `/ready` pass on VPS; PostgreSQL and Redis reported ready |
| API deployment | PASS | API and web services active; deployed commit `81fe8a4` |
| Database safety | PASS | Audit used read-only queries; no reset, drop, truncate, or destructive seed |
| Public market projection | FAIL | `/api/v1/market/assets` returns 200 with zero items |
| Published catalogue (VPS) | INFO | 14 published assets; 19 `slice-demo-*` assets remain |
| Public collector profiles | INFO | 2 public profiles exist in the database; public collectors endpoint returned an empty collection |

## Role matrix

### Investor

| Area | Result | Notes |
|---|---|---|
| Sign in / dashboard | PASS before reload | Dashboard, balances, holdings, orders and activity rendered |
| Reload / protected navigation | FAIL | AUTH-001; browser returned to signed-out state |
| Portfolio overview | PASS before reload | Holdings, P/L, allocation and summary rendered |
| Holdings tab | PASS before reload | Table, filters and list/grid controls rendered |
| Orders tab | PASS before reload | 12 orders rendered; fixture asset links are stale/broken |
| Activity tab | PASS before reload | 66 activity records and filters rendered |
| Wallet / Account / Notifications | PASS before reload | Routes rendered; notification stream is intentionally disabled with 503 |
| Become a Collector | FAIL | Onboarding opens generic phone setup; no explicit IDV action |
| Marketplace / asset detail | FAIL | Marketplace empty and `slice-demo-*` detail links not found |

### Collector

| Area | Result | Notes |
|---|---|---|
| Sign in / dashboard | PASS before reload | Collector dashboard rendered with List an Asset entry |
| Workspace APIs | PASS | Overview, collectibles, requests, documents, subscription, plans and vaults returned 200 |
| List Step 1 | PASS / partial | Wizard and link-import fields rendered; no new submission was created during audit |
| Steps 2–3, photos, AI review, review/submit | NOT TESTABLE | AUTH-001 prevented reliable full-page continuation; no provider spam or draft creation used |
| Submissions | FAIL | Stale cancelled Rayquaza/Charizard/D records visible; 30 demo-account submissions in VPS read-only count |
| Membership / public profile | PASS API | Subscription and public profile records available through API smoke |

### Admin

| Area | Result | Notes |
|---|---|---|
| Admin credentials / RBAC | PASS | Admin login works; unauthenticated admin endpoint returns 401 |
| Admin API sections | PASS | Overview, operations, risk, platform, intake, memberships, finance, trust/support, integrations, users and compliance cases returned 200 |
| Control Center browser route | NOT SIGNED OFF | Direct protected navigation affected by AUTH-001; no global Admin Console link |
| Platform health | DEGRADED | Seven failed notification deliveries require review |
| Disabled providers | SAFE / CLARITY FOLLOW-UP | Ximilar unavailable and not configured; Plaid/Bridge/market telemetry display Unknown/configured false |

## Market data and provider checks

| Feature | Result | Notes |
|---|---|---|
| PriceCharting | NOT CONFIGURED / not exercised | No provider action was triggered during QA |
| Ximilar | SAFE_DISABLED | Admin reports unavailable and not configured |
| Plaid IDV | NOT EXPOSED IN ONBOARDING | No fake success observed; no verification action available |
| Bridge | SAFE_DISABLED / not configured | Admin reports configured false |
| Currency rates | PASS | API returned GBP base and cached USD/CAD/EUR rates |
| Notifications stream | SAFE_DISABLED, noisy | Authenticated request returns 503 `FEATURE_DISABLED`; UI still has unread notification data |
| Portfolio marks | PASS / fixture-backed | Authenticated portfolio showed marks; public market discovery remains empty |

## Security and isolation checks

- Unauthenticated request to `/api/v1/admin/operations/overview` returned **401**.
- Investor and collector protected API smoke calls returned their own scoped data; no cross-user mutation was attempted.
- No destructive writes, provider verification attempts, uploads, order placement, cancellation, or real-money actions were performed.
- Private-media authorization and cross-user mutation workflows could not be signed off in the browser because AUTH-001 prevents reliable protected-route navigation; they require a follow-up pass after session persistence is fixed.

## Responsive and console checks

Public routes were checked at 390×844, 768×1024, and 1920×1080. Document scroll width stayed within the viewport at each tested width and no console errors were observed on the tested public routes. This does not clear the blocked authenticated workflows or stale-data findings.

Evidence screenshots:

- [Homepage fixture evidence](./QA_BETA_home.png)
- [Marketplace empty state](./QA_BETA_marketplace.png)
- [Collector onboarding without IDV action](./QA_BETA_onboarding.png)

## Severity totals

| Severity | Count |
|---|---:|
| BLOCKER | 1 |
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 2 |
| LOW | 1 |
| COSMETIC | 0 |

## Top issues to resolve before beta sign-off

1. Fix browser session refresh/persistence for all roles.
2. Make the approved public market projection available, or explicitly gate the beta with a truthful no-inventory state.
3. Remove or gate stale `slice-demo-*` public links and fixture trading copy; ensure canonical asset detail routes resolve.
4. Add a real collector Identity Verification state/action or clearly expose the configured provider-disabled state.
5. Hide/archive stale collector demo submissions from customer-facing lists.
6. Add a discoverable admin-only navigation entry after auth persistence is fixed.
7. Resolve or explicitly acknowledge the seven failed notification deliveries and clarify disabled provider states.

## Final beta decision

**NO-GO.** The site is reachable and several APIs are healthy, but authentication persistence and the absence/brokenness of the public market projection block reliable end-to-end beta use. The remaining findings should be re-audited after the targeted fixes and a fresh staging deploy.

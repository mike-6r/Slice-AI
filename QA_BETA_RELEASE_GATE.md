# SLICE BETA RELEASE GATE — FINAL CROSS-PRODUCT READINESS PASS

**Environment:** https://staging.slicecollectable.com  
**QA date:** 2026-08-16  
**Decision:** **NO-GO for a fully evidenced external Beta release; controlled internal Beta remains GO**

This report separates implementation evidence from evidence that was intentionally not re-run because it would require destructive, provider, physical, or cross-user workflows. No credentials are stored here.

## Deployment and pre-flight

| Check | Result | Evidence |
|---|---|---|
| Local branch | PASS | `main` |
| Source commit | PASS | `6ce3210` |
| VPS release | PASS | `/opt/slice/releases/20260816-6ce3210` |
| Runtime service path | PASS | `/opt/slice/app` activated from the verified release |
| API/web services | PASS | `slice-api.service` and `slice-web.service` active |
| `/health` | PASS | API returned `status: ok` |
| `/ready` | PASS | PostgreSQL and Redis both `up` |
| Prisma | PASS | 61 migrations found; no pending migrations |
| Staging frontend config | PASS | Fresh HTML referenced the deployed bundle and contained no localhost API fallback |
| Domain mutations | PASS | 0; only authentication, navigation, builds, deployment, and read-only queries were performed |

## Route matrix

| Surface | Routes/evidence | Result |
|---|---|---|
| Public | `/`, `/marketplace`, `/asset/:id`, `/collectors`, `/vault-live`, `/about`, `/how-it-works`, `/fees`, `/help` | GO; fresh post-deploy browser smoke, no console errors |
| Auth | `/login`, `/signup`, secure session recovery | GO; Admin and singular-domain Collector credentials authenticated; public routes remain usable during refresh cooldown |
| Investor | `/portfolio`, `/orders`, `/wallet`, `/account` | PARTIAL; customer routes render, but an independent Investor credential/session was not freshly established |
| Collector | `/collector-workspace`, `/list`, `/submissions/:id`, public collector routes | PARTIAL; read-only workspace and listing entry were exercised; fresh disposable listing/media/privacy workflow was not run |
| Staff/reviewer | staff and review workspace routes | PARTIAL; prior controlled evidence retained, fresh representative staff/reviewer session not available in this pass |
| Admin | `/admin` sections: control, accounts, review, intake, collectibles, asset operations, memberships, finance, trust/support, platform operations | PARTIAL; fresh Admin Collectibles/Treasury read-only check passed; prior full read-only section evidence retained |
| Deprecated/stale | retired demo asset links and localhost API fallback | PASS; no stale local API fallback in deployed HTML; no new stale public route observed |

## Fresh browser smoke

- Public home, Marketplace, Umbreon public detail, and Admin Treasury were opened from a fresh browser tab against the final bundle.
- Fresh tab result: 0 console errors/warnings on each checked route.
- No hydration mismatch remained after commit `6ce3210`.
- Admin Treasury projection displayed: 999 settled, 9 reserved, 990 available to list, 1 active listing, 9 publicly listed, 1 partially filled.
- Collector read-only routes displayed without console errors: Portfolio, Orders, Wallet, Account, Collector Workspace, and List an Asset entry.
- Admin account boundary displayed for the Collector session; no Admin Console access was granted.

## Role matrix

| Role | Public | Portfolio/account | Collector workspace/listing | Admin | Result |
|---|---:|---:|---:|---:|---|
| Anonymous | YES | AUTH REQUIRED | AUTH/CAPABILITY REQUIRED | DENIED | PASS from public/auth boundary evidence |
| Investor | YES | YES | CAPABILITY-GATED | DENIED | PARTIAL; independent fresh Investor session still required |
| Collector | YES | YES | YES | DENIED | PASS for fresh read-only route checks |
| Staff | YES | STAFF-GATED | STAFF-GATED | STAFF-GATED | PARTIAL; fresh role session not run |
| Reviewer | YES | REVIEWER-GATED | REVIEWER-GATED | REVIEWER-GATED | PARTIAL; fresh role session not run |
| Admin | YES | YES | ADMIN CONSOLE | YES | PASS for fresh read-only Admin Treasury check |

## Major workflow status

| Workflow | Result | Notes |
|---|---|---|
| Login/session restore | GO | Refresh abuse guard and cross-tab coordination are implemented; stale-session recovery no longer blocks public/login routes |
| Investor dashboard/portfolio/wallet/orders | PARTIAL | Route UI renders; independent Investor credential evidence remains open |
| Collector onboarding/listing | PARTIAL | Existing controlled evidence covers the flow; this pass did not create a disposable submission or upload |
| Admin review and approval | GO for controlled internal Beta | Prior controlled evidence retained; no provider call on render |
| Physical intake | GO for software/read-only gate | Real shipment/receipt events were not fabricated |
| Asset operations | GO for controlled internal Beta | Prior evidence retained; physical custody remains required for production lifecycle |
| Market data / PriceCharting | GO | Persisted mappings retained; no page-render provider call observed |
| AI review / Ximilar | GO with limitation | Optional and not configured; no unnecessary provider call was made |
| Issuance | GO for implemented UI/read-only gate | No new supply, issuance, market, or trade mutation performed |
| Treasury liquidity | GO | Fresh Admin projection and public Umbreon state agree |
| Trading/execution/settlement | GO for preserved controlled state | No additional order or trade was created |
| Ownership/portfolio | GO for preserved controlled state | Umbreon ownership and execution evidence retained |
| Memberships | PARTIAL | Prior controlled UI evidence retained; provider-backed billing is deferred |
| Governance | PARTIAL | Route exists; full proposal/voting/eligibility matrix not freshly exercised |
| Support/platform operations | PARTIAL | Prior controlled UI evidence retained; optional notification telemetry is limited |
| Discord | PARTIAL | Read/focused evidence retained; unsupported provider-backed notification categories remain disabled |

## Umbreon read-only regression

Expected and observed state remains unchanged:

- Market: OPEN
- Issued supply: 1,000
- Treasury settled: 999
- Treasury reserved: 9
- Treasury available to list: 990
- Public listed: 9 units
- Collector ownership: 1 unit / 0.1%
- Preserved execution: 1 unit at £1.64
- No new order, trade, issuance, custody, or provider call was created during this gate.

## Charizard safety

Controlled Charizard `054e7773-87ad-4b5e-9701-916a3aa5144d` remains the approved read-only fixture. No shipment, receipt, verification, valuation, custody, issuance, market, finance, or trade state was touched.

## Privacy, finance, and provider safety

- Public smoke showed no email, wallet, private media, staff notes, custody evidence, audit data, provider token, internal Treasury ID, or ledger internals.
- Current Umbreon financial reconciliation remains consistent with the preserved execution and Treasury listing projection.
- No direct balance edits, force fills, execution edits/deletes, or reconciliation mutations were attempted.
- No PriceCharting or Ximilar call was made by the final browser render smoke. Ximilar remains explicitly optional/not configured.
- Recent API service logs after deployment contained no unexpected 401, 403, 429, 500, refresh-loop, provider, or error entries.

## Responsive and accessibility evidence

Existing captured evidence is retained under `qa-screenshots/`:

- Public Umbreon: 390, 768, 1366, 1920, 2560 widths.
- Admin Treasury/market: 1366, 1920, 2560 and prior 768 evidence.
- Marketplace card and public asset captures are also retained.

This pass did not freshly exercise every route at every required width, keyboard-only traversal, focus restoration in every dialog, or the complete screen-reader matrix. Those are release-gate evidence gaps, not claims of a known visual failure.

## Known non-blocking limitations

- Membership provider-backed notifications: **not supported**.
- Support D17 notifications: **not supported**.
- Rejected-order notification: **not supported**.
- Plaid, Bridge, SMS, email verification, and 2FA remain Beta-deferred/disabled and are not presented as successful.
- Ximilar is optional/not configured; no fake AI grade is presented.
- Physical shipment and custody events require real-world evidence and were not fabricated.

## Fixes made during this gate

1. `59eca22` — public routes and `/login` no longer get trapped behind a rate-limited protected-session restore screen; “Sign in again” can reach authentication.
2. `6ce3210` — client-mount gating prevents the route-aware session boundary from creating an SSR hydration mismatch.
3. Deployment activation corrected for the host’s actual systemd working directory (`/opt/slice/app`); the verified release is active there and at `/opt/slice/current`.

## Remaining blockers

These are evidence-gate blockers for a fully evidenced external Beta, not newly discovered financial or privacy leaks:

- **P1 / FRESH-INVESTOR-001:** independent Investor session and Dashboard → Portfolio → Wallet → Orders → Activity → Become Collector matrix remains to be freshly evidenced.
- **P1 / FRESH-PRIVACY-001:** owner/authorized Staff/Admin allow and second-Collector/Investor/anonymous deny matrix for signed private media and intake address remains to be freshly exercised.
- **P1 / FRESH-RBAC-001:** fresh Staff and Reviewer sessions, including Admin/Finance/Review/Treasury boundaries and IDOR checks, remain open.
- **P2 / FRESH-A11Y-001:** full responsive matrix and keyboard/focus/accessibility pass across every cross-product surface remains to be freshly captured.

Because three P1 release-evidence gates remain open, the final classification is **NO-GO for a fully evidenced external Beta**. Controlled internal/read-only Beta remains **GO** with the limitations above.

## Screenshots

The following existing captures are referenced as visual evidence and contain no credentials:

- `qa-screenshots/treasury-qa/umb-390x844.png`
- `qa-screenshots/treasury-qa/umb-768x1024.png`
- `qa-screenshots/treasury-qa/umb-1366x768.png`
- `qa-screenshots/treasury-qa/umb-1920x1080.png`
- `qa-screenshots/treasury-qa/umb-2560x1440.png`
- `qa-screenshots/admin-market-1366-auth-final.png`
- `qa-screenshots/admin-market-1920-auth-final.png`
- `qa-screenshots/admin-market-2560-auth-final.png`

## Final classification

**P0:** 0  
**P1:** 3 unresolved release-evidence blockers  
**P2:** 1  
**P3:** 0  

**Final Beta readiness:** **NO-GO** for fully evidenced external Beta; **GO** for controlled internal/read-only Beta.

**Next action:** obtain the authorized independent Investor/Staff/Reviewer sessions and run the non-destructive privacy/RBAC, responsive, and accessibility matrices. Do not mutate Umbreon or Charizard to close those evidence gaps.

## Fresh evidence attempt — 2026-08-16

This is an additive record of the latest non-destructive browser attempt. It does not replace the prior deployment or controlled-fixture evidence above.

- Staging public routes were reachable at `https://staging.slicecollectable.com`.
- The staging UI observed in this session still corresponds to deployed source `6ce3210` (including the older More/Vault Live navigation). Local commit `ba20ad8` removes those customer surfaces but was not deployed in this session.
- Public DOM checks covered `/`, `/marketplace`, the public Umbreon asset, `/collectors`, and `/vault-live` at 390×844, 768×1024, 1366×768, 1920×1080, and 2560×1440. No document overflow or broken images were observed. The 390px marketplace quick-filter rail is horizontally scrollable; its buttons are not all visible at once.
- Public console errors/warnings observed: `0`.
- Fresh screenshot capture was attempted but blocked by the browser CDP `Page.captureScreenshot` timeout. Existing `qa-screenshots/` evidence was preserved.
- The available authenticated browser profile was `Slice Demo Collector`, not an independent Investor, Staff, or Reviewer session.
- Protected-route traversal reached the session-expired boundary (“Your session has expired” / “Sign in again”). No login retry, credential entry, or state-changing action was attempted.
- Fresh Investor, Staff, Reviewer, private-media, intake-address, and IDOR matrices were not executed. Unexpected HTTP status and provider-call counts were not independently verifiable from the available browser surface; no provider errors or provider logs appeared in the public console.
- Mutation count for this attempt: `0`. Umbreon and Charizard were not modified.

### Fresh evidence disposition

The release classification remains **NO-GO for a fully evidenced external Beta**. The three P1 evidence blockers and P2 accessibility/responsive blocker remain open until authorized fresh role sessions and a functioning authenticated browser session are available.

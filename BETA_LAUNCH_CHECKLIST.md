# Slice Live Beta Phase 2 Checklist

Date: 2026-08-14  
Environment: https://staging.slicecollectable.com  
Scope: controlled demo accounts only; no direct database publish or fixture reseed.

## Deployment

- Git main / VPS: `a2d0989` (`fix frontend review approval endpoint`)
- API `/health` and `/ready`: PASS
- API runtime version: `staging`
- Frontend build/version endpoint: NOT EXPOSED

## Fresh lifecycle record

- Submission: `054e7773-87ad-4b5e-9701-916a3aa5144d`
- Item: 2024 Pokémon Charizard ex Special Illustration Rare (Obsidian Flames, 223/197)
- Created through the real collector `/list` flow: PASS
- Current state: APPROVED (review decision `EVIDENCE_COMPLETE` at 2026-08-14T16:04:31Z)

## Controlled workflow evidence

- Collector authentication and role boundary: PASS
- Details saved through `/list`: PASS
- Market check performed once: PASS
- Market provider result: DEFERRED — no approved external provider configured; result recorded as `UNAVAILABLE` with zero comps
- Front/back uploads through the submission UI: PASS (both media `SAFE`)
- Ximilar pre-grade: DEFERRED — Ximilar configuration is not present; no provider call made
- Submit for review: PASS
- Admin review queue visibility: PASS
- Admin claim review: PASS
- Request changes: PASS
- Collector edit and resubmit: PASS
- Final admin acceptance: PASS

## Intentionally gated until physical authority exists

- Physical receipt/intake and custody: DEFERRED — no physical card was received in this controlled test
- Verification, valuation, market-ready, publish, issuance, D13 funding, D14 execution: NOT TESTABLE without the accepted physical item and approved market data
- Investor portfolio/orders/activity/performance and sell: NOT TESTABLE until a real published/issued market asset exists

## Provider and security notes

- PriceCharting / approved external market provider: DEFERRED (not configured in staging)
- Ximilar: DEFERRED (not configured in staging)
- Plaid/Bridge/SMS/email/2FA: OUT OF SCOPE for this pass; no fake verification was introduced
- Existing demo fixtures were not deleted or republished; the new lifecycle record is retained for review.

## Deployment-blocking fixes made during this pass

- `0a1ec4e` allow market research audit metadata
- `cc501a0` allow review change-request audit metadata
- `2157ec3` allow decision audit item metadata
- `af60a05` map review decisions to backend routes
- `a2d0989` map frontend approval to `/approve`

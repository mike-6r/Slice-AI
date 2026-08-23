# Slice lower market-data row QA

Status: in progress pending staging visual verification

This pass covers only the lower four-panel asset-detail row:

1. Reference Value / Value History
2. Collectible Details
3. Slice Grade
4. External Reference

The hero/media, asset identity, ownership/trading, onboarding, similar collectibles, and footer were not redesigned.

## Implementation

Changed files:

- `src/routes/asset.$id.tsx`
- `src/styles.css`
- `src/domain/market.ts`
- `src/data/repositories.ts`
- `src/repositories/http-repositories.ts`
- `src/repositories/http-repositories.test.ts`

The row uses a deliberate desktop grid rather than equal tracks:

```text
history 2.20fr | details .80fr | Slice Grade 1.08fr | external reference .98fr
```

There is a 1rem inter-panel gap and a shared 35rem desktop minimum height. At narrower widths the history and external-reference panels span the full row, details and Slice Grade remain paired, and at mobile all four panels stack in the requested order.

## Data authority

- Reference history is mapped from the existing backend history response, including `source`, `movementBps`, and selected range metadata.
- The lower history panel renders persisted `PRICECHARTING` history only. It does not reinterpret Slice valuation points as external reference history.
- PriceCharting is never called from the browser.
- Slice valuation remains a separately labelled value in the external-reference panel and is formatted using its authoritative backend currency.
- Slice Grade continues to use the public safe projection and signed evidence URLs. The grade emblem is CSS geometry; evidence remains behind the existing modal/lightbox CTA.
- No wallets, ledgers, ownership, orders, trades, provider refreshes, or financial records were mutated.

## Presentation contract

- Reference Value / Value History keeps the six backend-supported ranges, preserves an empty chart-sized state, and removes the incorrect `No trading history yet` wording.
- History footer values use actual first/latest points, point count, and backend movement; insufficient reference history is `Not available`.
- Collectible Details shows category, set, year, card number, and condition with readable row dividers; missing values are `—`.
- Slice Grade shows the real overall estimate, qualitative label, four component scores, full safety disclaimer, and the evidence CTA only when evidence exists.
- External Reference separates the provider reference, update timestamp, informational disclaimer, and Slice valuation.

## Automated checks

- Frontend typecheck: PASS
- Production client + SSR build: PASS
- Focused HTTP repository tests: PASS — 15 tests
- Full frontend suite: PASS — 39 files / 139 tests
- Targeted ESLint for changed TypeScript files: PASS
- Repository-wide `npm run lint`: baseline FAIL — 4,886 existing Prettier diagnostics across unrelated files; no changed-row lint error was reported by the targeted run.

## Browser QA

Required staging widths:

- 1920×1080 — pending post-deploy capture
- 1440×900 — pending post-deploy capture
- 1280×800 — pending post-deploy capture
- 768×1024 — pending post-deploy capture
- 390×844 — pending post-deploy capture

Screenshots will be stored under `docs/qa/screenshots/` (ignored from source control) after the new release is live. The final report will record the measured panel widths/heights, no-horizontal-scroll result, console/network result, and provider-call audit.

## Release gate

This document is complete only after staging screenshots confirm the mockup hierarchy and the deployed release reports healthy `/health` and `/ready` endpoints.

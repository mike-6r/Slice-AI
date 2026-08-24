# Buy a Slice UX + Homepage Demo QA

Date: 24 Aug 2026  
Scope: Buy/Sell configuration UX and the editorial homepage Charizard showcase  
Data safety: no orders, executions, ownership, ledger, settlement, market-data, PriceCharting, or Ximilar state was created or changed.

## Product decisions applied

- Customer-facing quantity is expressed as **Slices**. Internal accounting and API contracts continue to use their existing ownership-unit terminology.
- Buy and Sell are separate modes, with the active side visible in the same control group.
- Guests can inspect quantity, authoritative price, fee, total/net proceeds, and ownership projection. The execution CTA sends a guest to sign-in and never places an order.
- The summary uses the backend ownership preview and, for an authenticated customer, the protected order preview. No fee, availability, price, or percentage is hardcoded into the trading form.
- The fee line reflects the current provider policy returned by Slice. The existing maker/taker policy remains authoritative.
- The homepage Charizard remains an editorial experience example. Its external PriceCharting reference is shown in USD, while the separate illustrative Slice terms are shown in GBP. They are never combined into one value.
- The homepage no longer renders illustrative percentage progress bars or “Market pulse” copy for static examples. Static terms are labeled as illustrative/reference examples.

## Frontend implementation

- Added a Slices-first quantity selector with whole-number validation and quick selections for 1, 5, 10, and 25 Slices.
- Added a compact purchase summary containing:
  - price per Slice;
  - Slices available;
  - quantity selected;
  - order value/gross proceeds;
  - trading fee;
  - final buy total/net sell proceeds;
  - ownership acquired/sold;
  - resulting/remaining ownership;
  - current ownership when authenticated.
- Moved market context and the detailed backend calculation behind expandable sections so the primary decision block stays readable.
- Replaced customer-facing “ownership units” labels in the Buy/Sell UI with “Slices”.
- Added sign-in gating at the execution boundary while preserving guest economics inspection.
- Updated the homepage hero to separate:
  - External market reference — `$343,098.00 USD`, PriceCharting PSA 10 guide;
  - Illustrative Slice offering — `£10,000.00`, `1,000 Slices`, `£10.00` per Slice.
- Homepage educational buy example: `25 Slices = £250.00 = 2.50%`.
- Homepage educational sell example: `5 Slices = £50.00`, leaving `20 Slices = 2.00%`.

## Backend implementation

- Extended the existing ownership-preview contract with an optional `desiredSlices` quantity.
- Added public `POST /api/v1/market/assets/:slug/ownership/preview` for read-only guest economics projection.
- The endpoint validates exactly one of Slices, percentage, or amount and resolves the public asset slug through the same authoritative asset resolver.
- Guest projection does not look up an ownership account or cash account and does not create an order or reservation.
- The protected preview and order-placement paths remain separate and continue to revalidate authenticated capability, cash, ownership, price, fees, and market state.

## Validation

| Check | Result |
| --- | --- |
| Frontend typecheck | PASS |
| Backend typecheck | PASS |
| Homepage focused tests | PASS — 5/5 |
| Backend test suite | PASS — 72 suites / 317 tests |
| Frontend production build | PASS |
| Backend production build | PASS |
| `git diff --check` | PASS |
| Repository lint | BLOCKED by pre-existing formatting baseline — 4,895 Prettier errors across the repository, including untouched files/config; no lint-only fix was applied to unrelated files |

## Browser QA evidence

Local browser inspection of the homepage passed at the available browser viewport:

- Charizard hero visibly separates the USD external reference from GBP illustrative Slice terms.
- Demo-only buy/sell section shows the Slices terminology and the required `25 / £250 / 2.50%` and `5 / £50 / 20 / 2.00%` examples.
- Static trending examples show external reference values and plain illustrative terms; no fake availability bars or market-movement labels remain.
- Browser console contained only the existing React DevTools notice and TanStack route code-splitting warnings. No runtime exception or failed request was observed during the homepage inspection.
- The in-app browser’s screenshot helper was unavailable for this local session; DOM/visual inspection was completed through the browser QA surface. Staging screenshots and runtime checks are recorded below after deployment.

## Staging deployment

Pending commit/deployment for this change. The release must be activated through `scripts/deploy-vps-staging.sh` so `/opt/slice/current` and `/opt/slice/app` remain aligned, then verified with `/health`, `/ready`, SSR HTTP 200, and the Buy/Sell guest preview route.

## Final state

- Umbreon unchanged.
- Charizard domain state unchanged; only homepage presentation copy/layout changed.
- No financial mutations.
- No provider calls added to homepage render or guest preview.

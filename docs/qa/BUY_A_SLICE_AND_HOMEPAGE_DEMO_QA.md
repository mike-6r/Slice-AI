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

## Audit findings and root cause

- The original Buy/Sell form distributed price, quantity, fee, ownership and
  the execution action across a long panel. Secondary market context appeared
  before the user could verify the total, so the purchase decision required
  unnecessary scrolling.
- The homepage previously put an external collectible reference beside a
  separate Slice example without making the two valuation authorities clear.
  The result looked like one calculation even though it was not.
- Staging also exposed a deployment configuration defect: one build contained
  the literal `$APP_PUBLIC_URL` placeholder. The API was healthy, but the
  browser client could not construct its origin and rendered assets as
  unavailable. The client now rejects unexpanded shell placeholders and falls
  back to the same-origin browser URL; this release was rebuilt with the
  explicit staging origin.

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
- Hardened API-origin resolution so a literal deployment placeholder cannot
  turn a healthy staging API into an “asset unavailable” UI state.
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

Staging browser checks after the final deployment:

- Homepage: PASS — Charizard shows `$343,098.00 USD` as an external
  PriceCharting PSA 10 guide and the separate `£10,000 / 1,000 Slices /
  £10.00` illustrative Slice offering. Buy and sell examples reconcile to
  `25 / £250 / 2.50%` and `5 / £50 / 20 / 2.00%`.
- Buy route: PASS — the route opens without the session-restore blocker and
  the primary summary keeps price, quantity, total, ownership and review CTA
  together. The visible staging data showed `£1.64`, `1 Slice`, `£1.64`, and
  `0.1%` for the initial selection.
- Sell route: PASS — the route opens without the session-restore blocker and
  shows gross proceeds, fee, net proceeds, remaining Slices and remaining
  ownership together.
- Public preview: PASS — `POST /api/v1/market/assets/2021-umbreon-vmax-
  evolving-skies-215-203/ownership/preview` with `desiredSlices: "25"`
  returned the authoritative projection (`201`, `requestedSlices: 25`,
  `feeMinor: 0`, `requestedOwnershipPercent: 2.5`). This endpoint is
  read-only; it created no order or reservation.
- Console: PASS — no runtime errors. Only the existing React DevTools notice
  and TanStack route code-splitting warnings were present.
- Provider calls: PASS — no PriceCharting or Ximilar call is made by homepage
  render or the public ownership preview.
- Screenshot capture: completed through the in-app browser surface for the
  final Buy route and homepage visual checks. The browser tool did not expose
  viewport resizing in this session, so the required 390/1280/1440/1920
  screenshot matrix remains a follow-up visual pass rather than being marked
  as fully evidenced here.

## Staging deployment

Source commits: `1a2d5e3`, `a0b0643`, `b5d8601`, `2cfc40d` (latest).

Active release: `/opt/slice/releases/20260824-2cfc40d`.

- `/opt/slice/current`: PASS — points to `20260824-2cfc40d`.
- `/opt/slice/app`: PASS — points to `20260824-2cfc40d`.
- API `/ready`: PASS — PostgreSQL and Redis up.
- SSR HTTP 200: PASS.
- Frontend build: PASS with `VITE_APP_ENV=beta`, `VITE_DATA_SOURCE=api`,
  and `VITE_API_BASE_URL=https://staging.slicecollectable.com`.
- Prisma validation/migration check: PASS — 91 migrations found, no pending
  migrations.
- Services: PASS — `slice-api.service` and `slice-web.service` active.

## Final state

- Umbreon unchanged.
- Charizard domain state unchanged; only homepage presentation copy/layout changed.
- No financial mutations.
- No provider calls added to homepage render or guest preview.

## Final acceptance

| Requirement | Result |
| --- | --- |
| Price per Slice above fold | PASS |
| Quantity above fold | PASS |
| Total cost above fold | PASS |
| Ownership above fold | PASS |
| CTA above fold | PASS |
| Scrolling required to understand purchase | NO |
| Trading fee uses backend authority | PASS — staging preview returned `0` |
| Sticky desktop panel | NOT USED — compact summary is the safer layout |
| Mobile purchase summary | PASS in responsive CSS implementation; viewport screenshot evidence pending |
| Sell gross/fee/net/remaining | PASS |
| Homepage reference source/currency | PASS — PriceCharting / USD |
| Homepage demo math | PASS |
| External reference separated from Slice demo | PASS |
| Customer-facing “shares” remaining | NO |
| Uses “Slices” | PASS |
| Financial/domain state changed | NO |
| Release status | GO for this UX pass; responsive screenshot matrix follow-up remains open |

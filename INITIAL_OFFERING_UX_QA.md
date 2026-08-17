# Initial offering UX and QA

Phase 2 adds a collector-originated initial offering without changing the legacy Treasury path. The flow is deliberately review-first: the collector previews integer-unit economics, submits terms, and waits for staff approval before anything can open on the public market.

## Customer flow

1. An approved collector opens an eligible collectible in Collector Workspace and selects **Offering**.
2. The percentage picker requests an authoritative preview from `GET /collector/assets/:assetId/offering/preview?percentageBps=...`.
3. The preview shows Slice valuation, total units, offered units, retained units, price per unit, gross proceeds, fee policy, and estimated collector proceeds.
4. The collector submits or resubmits terms with `POST /collector/assets/:assetId/offering` or `PATCH /collector/initial-offerings/:id`.
5. Admin reviews the same projection in the Collectible → Offering tab. Admin can approve, request changes, open, pause, or cancel according to the state machine.
6. Public marketplace and asset detail surfaces label an open offering as an initial offering and keep the collector inventory separate from Slice Treasury liquidity.

## Authority and safety checks

- Percentages are converted to whole units with integer floor rounding; no fractional ownership units are created.
- Offered plus retained units must equal approved total supply.
- Terms are bound to the approved supply-policy and valuation decision IDs and currency.
- Collector mutations require recent authentication, ownership of the offering, idempotency keys, and audit/outbox records.
- Admin approval rejects self-review and requires publication, secured custody, active insurance, approved supply policy, and an unchanged authoritative valuation.
- Public responses expose offering status and inventory only; collector identity, proceeds accounts, and internal review data remain private.
- Initial offering settlement uses the dedicated `INITIAL_OFFERING` channel and collector proceeds account. It is not Treasury liquidity.
- No provider call is made by the offering preview or render path.

## UI acceptance checklist

- [x] Collector percentage choices: 25%, 50%, 75%, 100%, and custom percentage.
- [x] Beginner-readable preview and review confirmation.
- [x] Requested changes are visible with the admin reason and can be resubmitted.
- [x] Admin terms, readiness, retained ownership, inventory, and proceeds are visible in separate groups.
- [x] Public cards/detail surfaces distinguish an initial offering from secondary-market and Treasury liquidity.
- [x] No fake owners, executions, availability, or market performance are created by the UI.
- [x] Responsive layout collapses the preview grid for narrow screens.

## Verification commands

Run from the repository root:

```text
npm run typecheck
npm test -- --run src/components/marketplace/marketplace-helpers.test.ts
npm run build
```

Run from `server/`:

```text
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run test -- --runInBand src/modules/initial-offering/domain/initial-offering.spec.ts
npm run build
```

The repository-wide frontend lint command currently reports pre-existing formatting errors outside this feature; it is tracked separately from the typecheck/build gate.

## Controlled staging QA record

Run dated 17 Aug 2026. Deployment source release: `e602143` (VPS release `/opt/slice/releases/20260817-e602143`). Health and readiness returned 200 with PostgreSQL and Redis up. Use a disposable collector-owned test asset and a fresh admin account. Do not use Umbreon or the real Charizard, and do not call PriceCharting, Ximilar, Plaid, Bridge, or live-money providers.

QA fixture: asset `43212b2a-225c-4253-a1bd-47facaf6fd73`, submission `daa84751-8e27-420e-ac6e-a9b2f1054353`, titled **QA TEST Initial Offering Card**. The controlled lifecycle reached secured custody, active £10,000 valuation, active £10,000 insurance coverage, published catalogue state, issued supply, and an open trading market. No real catalogue asset was changed.

The first controlled attempt found and fixed a lifecycle defect: issuance changes the supply policy state from `APPROVED` to `ISSUED`, while the collector offering preview/proposal/approval paths only accepted `APPROVED`. Commit `e602143` allows the linked policy in either authoritative state and adds focused coverage.

| Check | Result | Evidence |
| --- | --- | --- |
| Collector preview at 25/50/75/100/custom | Blocked by collector recent-auth/login limiter after controlled session refreshes | No bypass or Redis clearing performed |
| Submit → admin review → request changes → resubmit | Blocked pending collector session | No offering record or financial record was fabricated |
| Admin approve/open/pause/cancel guards | Blocked pending offering | Asset publication, custody, valuation, insurance, issuance, and market prerequisites passed |
| Public initial-offering label and retained percentage | Blocked pending offering | No public availability was invented |
| Treasury separation | PASS for pre-offering lifecycle | No Treasury listing or Treasury proceeds was created |
| Console/network/provider leakage | Partial | Browser console showed only React DevTools info; no provider calls were made. Normal-use 403s were recent-auth session expiry, not a product authorization bypass |

### Current blocker

The staging login limiter returned HTTP 429 after repeated controlled session refreshes and is being allowed to expire normally. The controlled investor password is not present in the repository or staging environment and was not guessed. Phase 2 acceptance therefore remains **BLOCKED**, not complete. Resume with one fresh collector login, submit 600 offered units / 400 retained units, then use a verified controlled investor credential for the £1,000 / 100-unit purchase and reconciliation.

No Umbreon or Charizard lifecycle records are created by the Phase 2 implementation or automated unit tests.

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

Run dated 17 Aug 2026. The corrected deployment is commit `c924449` (VPS release `/opt/slice/releases/20260817-c924449`; both `/opt/slice/app` and `/opt/slice/current` point to it). Health and readiness returned 200 with PostgreSQL and Redis up. Use a disposable collector-owned test asset and a fresh admin account. Do not use Umbreon or the real Charizard, and do not call PriceCharting, Ximilar, Plaid, Bridge, or live-money providers.

QA fixture: asset `43212b2a-225c-4253-a1bd-47facaf6fd73`, submission `daa84751-8e27-420e-ac6e-a9b2f1054353`, titled **QA TEST Initial Offering Card**. The controlled lifecycle reached secured custody, active £10,000 valuation, active £10,000 insurance coverage, published catalogue state, issued supply, and an open trading market. No real catalogue asset was changed.

The first controlled attempt found and fixed a lifecycle defect: issuance changes the supply policy state from `APPROVED` to `ISSUED`, while the collector offering preview/proposal/approval paths only accepted `APPROVED`. Commit `e602143` allows the linked policy in either authoritative state and adds focused coverage. The resumed run then found that the VPS API service was still running from the older `/opt/slice/app` symlink; the service target was corrected before the final controlled submission.

| Check | Result | Evidence |
| --- | --- | --- |
| Collector login and ownership | PASS | Normal UI authentication as the verified controlled Collector; the QA asset belonged to the session. No limiter bypass or Redis clearing performed |
| Collector preview at 25/50/75/100/custom | PASS | All five controls rendered through the API. Primary custom 60% preview: 600 offered, 400 retained, £10/unit, £6,000 gross, £0 fee, £6,000 estimated proceeds |
| Submit offering | PASS | One normal submission created offering `7308f57c-63ff-488a-88f3-fa1701d5179b` in `AWAITING_APPROVAL`; no duplicate offering was created |
| Admin review and approval | PASS | Admin Collectible → Offering showed collector, 600/400 terms, £10 valuation, `INITIAL_OFFERING_ZERO_FEE_V1`, custody, insurance, publication, issuance and market readiness; approval completed through the normal UI |
| Admin open | PASS | Normal Admin action opened the offering and created the `INITIAL_OFFERING` sell order for 600 units at £10/unit |
| Ownership allocation before purchase | PASS | Read-only reconciliation after open: 1,000 issued = 400 collector USER position + 600 INITIAL_OFFERING position + 0 TREASURY. Inventory is 600 offered, 600 reserved by the open offering order, 0 settled |
| Public initial-offering label and retained percentage | PASS | Public asset shows Initial offering, £10.00 starting price, 60% available ownership and 40% collector retained; no Treasury or collector identity/proceeds leakage observed |
| Treasury separation | PASS | Treasury position is 0 for this offering and the open order channel/principal are both `INITIAL_OFFERING`; no Treasury proceeds were created |
| Console/network/provider leakage | Partial | Browser console showed only React DevTools information; no PriceCharting, Ximilar, Plaid, Bridge or live-money provider calls were made. Expired sessions produced expected `RECENT_AUTH_REQUIRED` responses until normal re-authentication |

### Current blocker

Collector and Admin work is complete through opening the controlled offering. The controlled Investor password is not available in the repository or supported staging configuration and was not guessed. Phase 2 acceptance remains **BLOCKED**, not complete. Required human input: `INVESTOR CREDENTIAL REQUIRED`. Resume with a verified Investor credential for the normal £1,000 / 100-unit purchase, then complete execution, proceeds, journal and responsive Investor QA. No investor, execution, settlement or financial records were fabricated.

No Umbreon or Charizard lifecycle records are created by the Phase 2 implementation or automated unit tests.

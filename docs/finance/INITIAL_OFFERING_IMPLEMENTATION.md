# Slice Initial Offering Economic Model — Phase 1

## What changed

Phase 1 adds the backend authority needed to represent a collector-originated initial offering without treating the collector's collectible as Slice Treasury inventory.

Before:

`Collector submission → approval → issuance → all units credited to Slice Treasury → Treasury proceeds liability`

After:

`Collector submission → approved offering terms → retained collector position + Initial Offering inventory → investor initial purchase → collector proceeds + Slice fee revenue`

The existing secondary D14 matcher remains the matching engine for both channels. The initial-offering channel only adds explicit inventory, beneficiary, and settlement routing around it.

## Authority model

- `InitialOffering` stores the asset, originating collector, beneficiary, approved valuation, approved supply policy, integer offered/retained units, price, currency, fee-policy version, and lifecycle status.
- `OwnershipAccount.type = INITIAL_OFFERING` identifies the offered units. It is never `TREASURY`.
- `InitialOfferingInventory` provides a durable offering projection for offered, available, reserved, and settled units. The ownership position remains the unit-level authority.
- Retained units are issued to the collector's normal `USER` ownership account.
- Existing assets without an `InitialOffering` continue through the unchanged legacy Treasury issuance path.

## Initial purchase accounting

Initial fills use `TradingChannel.INITIAL_OFFERING` and `TradingPrincipalType.INITIAL_OFFERING`:

- Buyer cash is debited by gross consideration plus any later-approved buyer fee policy.
- Collector proceeds are credited to the beneficiary's `COLLECTOR_PROCEEDS_AVAILABLE` user-owned liability account.
- The initial-offering fee is credited to `INITIAL_OFFERING_FEE_REVENUE`.
- The ownership transfer is Initial Offering inventory → investor.
- The journal is `INITIAL_OFFERING_SETTLEMENT` and is atomic with ownership, order, execution, lot, audit, and outbox updates.

Phase 1 uses an explicit zero-fee policy (`INITIAL_OFFERING_ZERO_FEE_V1`, 0 bps). No secondary maker/taker rate is copied into the initial offering.

## Lifecycle APIs

- `POST /collector/assets/:assetId/offering`
- `GET /collector/assets/:assetId/offering`
- `GET /admin/initial-offerings/:id`
- `POST /admin/initial-offerings/:id/approve`
- `POST /admin/initial-offerings/:id/open`
- `POST /admin/initial-offerings/:id/pause`
- `POST /admin/initial-offerings/:id/cancel`

Collectors can propose terms only for their own approved, published, valued, secured, insured asset. Staff/Admin approval is required and the originating collector cannot approve their own offering. Investors have no offering mutation surface.

## Compatibility and safety

- Umbreon is not backfilled or migrated.
- Charizard is not touched.
- Treasury liquidity remains available for explicit platform-owned liquidity.
- No provider money movement is enabled.
- Withdrawals remain provider-authoritative and are not enabled by this phase.
- The migration is additive and forward-only.

## Next phase

Collector offering UX, Admin approval UX, proceeds reporting/withdrawal readiness, and controlled end-to-end initial-offering QA can now be built on these authorities.

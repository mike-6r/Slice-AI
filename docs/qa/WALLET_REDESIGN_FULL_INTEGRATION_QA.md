# Wallet Redesign Full Integration QA

## Scope

The Wallet route was rebuilt around the supplied dashboard reference while preserving Slice's existing finance, identity, Bacs, and Connect authorities. This change does not alter marketplace, ownership, offering, Umbreon, Charizard, or trading state.

## Reference fidelity

The route now uses the reference structure: Wallet heading, five cash summary cards, connected funding account, Move money, Verification & account status, movement history, settlement timeline, and Wallet insights. The existing Slice navigation, dark surface tokens, emerald accents, and responsive layout are preserved.

Reference-image amounts are not present in the implementation. Zero and unavailable states are rendered only from backend/query state.

## Wallet summary

The existing `GET /api/v1/me/portfolio` projection remains the authority for GBP cash totals. The five cards are:

- Available cash: available GBP cash only.
- Pending deposits: non-terminal inbound movement amount.
- Pending withdrawals: non-terminal outbound movement amount.
- Reserved cash: active cash reservations.
- Total wallet balance: authoritative available plus reserved cash total.

The backend projection now also returns pending movement counts for truthful subtitles.

## Bank account

The connected bank panel consumes `GET /api/v1/wallet/bank-accounts` and only renders safe `ExternalFinancialAccount` fields. Setup continues through Stripe-hosted Checkout in `mode=setup` with `bacs_debit`; disconnect and default-account actions use the existing guarded endpoints.

## Deposits

The Move money panel calls the existing deposit endpoint. Backend validation remains authoritative for identity/compliance, capability, GBP, account ownership, provider environment, idempotency, and saved Bacs PaymentMethod use. Requested deposits remain pending until verified provider/webhook settlement.

## Withdrawals

The Withdraw tab continues to call the existing withdrawal service. Available cash, reservation, compliance screening, Connect readiness, provider lifecycle, and webhook finalization remain server-side authorities.

## Identity

Identity status and the Start/Continue verification action use the existing Compliance projection and Stripe Identity service. The page never marks identity verified client-side.

## Wallet access

Wallet access remains derived from the current compliance and funding projections and is displayed as a status row with the server-known reason.

## Connect readiness

Collector payout readiness is now shown in the account-status panel from the existing Connect projection. Non-collector accounts show that payout readiness is not applicable rather than inventing a provider state.

## Movement history

`GET /api/v1/wallet/movements` remains paginated and self-only. The safe projection now includes a Slice-owned short reference and a masked source/destination label. No Stripe object IDs, raw provider payloads, full bank details, or secrets are returned. Selecting a movement opens a customer-safe detail dialog.

## Settlement timeline

The five visual nodes are derived from active Bacs connection, compliance state, movement state, available GBP cash, and wallet access. No fixed “completed” event or fake settlement time is stored.

## Wallet insights

`GET /api/v1/me/wallet/insights?period=month` is a read-only projection of settled GBP movements for the current UTC month. It returns total deposits, total withdrawals, and net movement. Previous-period comparison is returned only when settled prior-period data exists.

## Backend APIs

Changed:

- `GET /api/v1/me/wallet/insights?period=month` added as a read-only finance projection.
- `GET /api/v1/me/portfolio` wallet cash projection extended with pending counts.
- `GET /api/v1/wallet/movements` safe rows extended with Slice reference and masked source label.

Existing mutation routes were preserved.

## Security

- GBP-only validation remains active.
- Stripe live mode remains fail-closed.
- Financial Connections and `us_bank_account` remain disabled.
- No Stripe secret or webhook secret is sent to the frontend.
- Bank references remain masked/encrypted/hashed according to existing provider boundaries.
- Movement queries remain scoped to the authenticated user.
- Wallet detail displays only safe provider-neutral data.

## Financial invariants

Available cash is ledger-derived. Reserved cash is reservation-derived. Pending deposits are excluded from available cash. Provider success does not directly credit Slice cash; verified webhook processing and exactly-once ledger logic remain authoritative. No financial rows were created by this redesign.

## Frontend tests

Focused Wallet/repository tests pass: 3 files, 12 tests.

## Backend tests

Focused provider/Stripe regression tests pass: 2 suites, 8 tests. Server typecheck, Prisma validation, and production build pass.

## Integration tests

No new financial integration fixture was created. Existing provider integration coverage remains unchanged and should be run as part of the full release gate.

## Responsive QA

The layout supports five cards on large desktop, three/two-column wrapping at medium widths, single-column panels on mobile, and stacked movement cards below 600px. Browser verification remains pending for 1440, 1280, 1024, 768, and mobile widths.

## Staging QA

The staging Stripe sandbox is configured for GBP Bacs and the provider release is healthy. This Wallet redesign has not yet been deployed in this run. No Stripe live mode, deposit settlement, payout, trade, offering, ownership, Umbreon, or Charizard mutation is authorized by this document.

## Remaining issues

- Complete browser visual QA against the supplied reference at desktop/tablet/mobile widths.
- Run the complete repository regression suite before release.
- Deploy only the validated commit to staging and verify the authenticated Wallet route.

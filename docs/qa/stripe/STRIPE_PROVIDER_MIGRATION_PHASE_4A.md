# Stripe Provider Migration — Phase 4A

## Final Status

Phase 4A is implemented as a provider-framework migration only. Slice does not
make Stripe API calls, does not activate real money, and keeps `LOCAL_TEST` as
the deterministic provider for QA and lifecycle regression tests.

## Bridge Footprint Found

Bridge was present in the external money adapter, webhook verification and
transfer mapping, provider-mode configuration, reconciliation fixtures, Prisma
legacy enum history, admin integration health, and provider tests.

Classification:

- Active runtime dependency: adapter import, webhook branch, configuration
  requirements, and controller routing.
- Provider abstraction: normalized money-movement and webhook contracts.
- Test fixture: legacy reconciliation and webhook coverage.
- Database legacy field: `ProviderCode.BRIDGE` and persisted provider columns.
- Documentation/migration history: Bridge migration and prior QA records.

## Plaid Footprint Found

Plaid was present in identity verification, bank-link token/exchange services,
encrypted external-account persistence, webhook verification, frontend Link
integration, onboarding copy, mocks, configuration, Prisma legacy enum history,
and integration tests.

Classification:

- Active runtime dependency: identity adapter, bank-link service, webhook
  branch, frontend SDK, and configuration requirements.
- Provider abstraction: compliance, bank-connection, and safe projection
  interfaces.
- Test fixture: the encrypted Link integration test and frontend SDK mock.
- Database legacy field: `ProviderCode.PLAID` and deployed account references.
- Documentation/migration history: prior provider migrations and QA reports.

## Removed Runtime Dependencies

- Deleted the Bridge and Plaid adapters and their adapter unit tests.
- Removed Bridge/Plaid imports and branches from the provider module, controller,
  compliance service, and webhook service.
- Removed the `react-plaid-link` dependency and the frontend Link runtime.
- Replaced provider-specific wallet and onboarding language with generic
  provider-neutral wording.
- Legacy provider webhook routes are rejected; they are not silently aliased.

## Preserved Legacy Schema

Existing `BRIDGE` and `PLAID` enum values remain readable so deployed historical
rows are not rewritten or deleted. They are no longer selected by active
runtime provider mapping. The migration
`20260819110000_stripe_provider_modes` additively adds `STRIPE_SANDBOX` and
`STRIPE_LIVE`.

No destructive migration was performed. Existing encrypted reference columns,
provider event inbox rows, and generic idempotency records remain intact.

## Provider Architecture

Active provider mode selection is explicit:

| Slice mode | Persisted provider code | Phase 4A behavior |
| --- | --- | --- |
| `local` | `LOCAL_TEST` | Fully functional deterministic QA path |
| `stripe_sandbox` | `STRIPE_SANDBOX` | Represented, fail-closed, no API calls |
| `stripe_live` | `STRIPE_LIVE` | Explicitly gated, fail-closed, no API calls |

`ComplianceService`, `BankConnectionService`, webhook ingestion, and money
movement provider mapping use the same provider-neutral mode vocabulary.
Slice remains authoritative for cash, reservations, journals, ownership,
settlement, and reconciliation.

The existing `WebhookInbox` is retained as the durable provider-event boundary.
It already provides provider, event hash, event type, payload hash, encrypted
payload, signature status, processing status, attempts, and error state. No
duplicate event system was introduced.

## LOCAL_TEST

`LOCAL_TEST` remains the active default and retains deterministic identity,
wallet movement, webhook, settlement, reservation, reversal, deficit-hold,
and reconciliation behavior. Existing provider lifecycle integration suites
were kept on `LOCAL_TEST` rather than retaining a legacy external provider as a
test dependency.

## Stripe Sandbox Prepared

`STRIPE_SANDBOX` is a valid explicit mode and persisted provider code. The
provider-neutral boundaries return a controlled unavailable response and never
construct an SDK client or call the network. Stripe API calls, Stripe.js, ACH,
Financial Connections, Connect, Identity, and Stripe webhook signature
verification remain Phase 4B work.

## Live-Mode Safety

- `STRIPE_LIVE` is rejected unless `STRIPE_LIVE_ENABLED=true`.
- Live mode also requires provider encryption, Stripe secret, Stripe webhook,
  and blockchain-analysis configuration.
- Placeholder secrets are rejected in live mode.
- Sandbox and live are separate mode values and provider codes.
- Credentials alone do not activate live money movement.
- No Phase 4A code makes an external Stripe request.

## Environment Changes

Removed active schema requirements for `BRIDGE_*` and `PLAID_*` variables.
`server/.env.example` now documents:

- `PROVIDER_MODE=local`
- `STRIPE_LIVE_ENABLED=false`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

No real credentials were added.

## Prisma Changes

- Added `STRIPE_SANDBOX` and `STRIPE_LIVE` to `ProviderCode`.
- Added an additive migration only.
- Reused `WebhookInbox`; no duplicate event table was added.
- Kept historical Bridge/Plaid enum values for deployed-data compatibility.

## Frontend Changes

- Removed the provider-specific Link SDK and lazy Link session.
- Bank connection UI now says setup is coming soon and does not fabricate a
  connection or make a provider request.
- Compliance and bank projections accept only `LOCAL_TEST`, `STRIPE_SANDBOX`,
  and `STRIPE_LIVE`.
- Onboarding and wallet copy no longer names an abandoned provider.

## Tests

Added explicit coverage for:

- provider mode mapping;
- Stripe sandbox external identity failure without outbound work;
- bank connection fail-closed behavior and empty safe projection;
- Stripe live enablement and placeholder-secret checks;
- legacy webhook rejection;
- local webhook deduplication and raw-byte signature checks.

Existing wallet, deposit, withdrawal, settlement, reversal, hold, and
reconciliation regression tests remain in the suite.

## Remaining Legacy References

Intentional remaining references are limited to:

- Prisma migration history and retained enum values;
- deployed-data compatibility semantics;
- archived QA/release documents describing prior provider work;
- one webhook regression assertion proving the legacy Bridge route is rejected.

There are zero active Bridge/Plaid imports, configuration fields, provider
branches, frontend SDK dependencies, or runtime provider selections under
`server/src` and `src`.

## Migration Risks

- Deployed historical rows still contain legacy provider codes and must remain
  readable until a separately authorized data-retention migration.
- Bank connections created by the retired flow are intentionally not surfaced
  by the new bank projection until a future Stripe migration defines the
  import/reconciliation policy.
- Phase 4B must implement Stripe webhook verification and livemode checks before
  enabling any external provider mode.

## Next Phase

Phase 4B may implement the Stripe provider ecosystem behind the prepared
boundaries. It must preserve Slice ledger authority, add Stripe object
`livemode` separation, and remain disabled until separately authorized.

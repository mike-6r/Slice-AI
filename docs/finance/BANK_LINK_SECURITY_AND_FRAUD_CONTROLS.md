# Bank Link Security and Fraud Controls

## Scope

This document defines the Slice control boundary for connected UK Bacs funding accounts. It covers user bank-link lifecycle, provider instrument de-duplication, high-risk account changes, and admin review. It does not claim that Stripe supplies Slice fraud, AML, sanctions, or account-ownership decisions.

## Connected status

`CONNECTED`, `DISCONNECTED`, and `EXPIRED` are safe lifecycle projections. The connected badge is status-only. Disconnect is a separate explicit action and never detaches or deletes the Stripe PaymentMethod. Slice logically deactivates the account so pending movements, journals, provider references, webhook reconciliation, and audit history remain queryable.

## Disconnect and default-bank controls

- The UI requires an explicit confirmation checkbox and explains the effect on new deposits, pending deposits, withdrawals, and future relinking.
- The API requires `confirmed: true` and an idempotency key.
- The action requires recent authentication. If an enabled TOTP or SMS MFA method exists, the action also requires that factor; SMS uses a short-lived action-scoped challenge rather than the login challenge table.
- A default bank cannot be disconnected while another connected bank exists until the user chooses a replacement. If it is the only bank, disconnect leaves no default and deposits remain unavailable until a new bank is connected.
- Default-bank changes require recent authentication, rate limiting, idempotency, and a security notification.
- Connected account projections contain only institution/account labels, last four digits, currency, status, default state, and timestamps. Raw account/routing values never leave the provider boundary.

## Provider instrument identity and duplicate handling

Stripe's Bacs PaymentMethod fingerprint is keyed with the application crypto hash and stored in `BankInstrumentIdentity`. The raw fingerprint is never persisted. A PostgreSQL transaction advisory lock on provider, environment, and hashed fingerprint serializes concurrent link attempts.

- Same-user active duplicate: no second connected account is created; the attempt is recorded and rejected as already connected.
- Cross-user match: no new account is created; the instrument is marked `SHARED_INSTRUMENT_REVIEW`, an append-only security event and audit event are recorded, and the customer receives a generic review message.
- Same-user relink after logical disconnect is allowed as a new lifecycle while the old history is retained.
- The environment is part of every identity key, so sandbox and live instruments cannot collide.

## Audit, notifications, and abuse controls

Append-only `BankSecurityEvent` records cover link requested, linked, relinked, duplicate detected, shared-instrument review, disconnect blocked, disconnect completed, and default changes. High-risk lifecycle events also create generic `AuditEvent` records. Security notifications include only a safe last-four projection.

Bank-link, disconnect, and MFA actions use independent rate limits. Failed MFA attempts are bounded by the existing two-factor policy. No raw bank details, provider secrets, or full provider fingerprints are included in metadata or notifications.

## Withdrawal hold

`BANK_CHANGE_WITHDRAWAL_HOLD_HOURS` is an explicit configuration control. The default is `0`, which is inactive. When set above zero, a bank link, relink, disconnect, or default-bank change records `User.bankWithdrawalHoldUntil`; withdrawal capability is denied until that timestamp. Slice does not invent a duration, auto-settle funds, alter balances, or silently change payout destinations.

## Admin review

`GET /api/v1/admin/providers/bank-risk` is protected by `provider.manage`. It returns only non-clear instrument identities for the active provider environment, safe last-four/country projections, risk state, linked user identifiers/emails, lifecycle status, and event counts. It never returns the keyed fingerprint, provider PaymentMethod ID, sort code, account number, or credentials.

## Data invariants

- Disconnect is logical and reversible through a new provider link; it is not destructive.
- Pending movements retain their original `externalAccountId`.
- Cash balances, financial journals, payout destinations, ownership, orders, and executions are not modified by bank unlinking.
- Capability reads count only connected funding accounts and are invalidated by the wallet UI after lifecycle changes.
- Provider customer creation remains unique per provider, environment, and Slice user with an idempotency key.

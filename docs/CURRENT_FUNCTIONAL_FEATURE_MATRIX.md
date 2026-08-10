# Current functional feature matrix

This is a code-inventory for the current Slice repository, not a roadmap. It
records the actual public/UI surface, controller/service authority, and the
boundaries the staging showcase accounts must respect. Status is intentionally
conservative: a provider-backed action is not marked functional merely because
there is a screen for it.

## Role vocabulary used by the code

The database currently defines only `USER`, `SUPPORT`, `COMPLIANCE_ANALYST`,
`ASSET_REVIEWER`, `VAULT_OPERATOR`, `FINANCE_OPERATOR`, and `ADMIN`. There are
**no** `INVESTOR` or `COLLECTOR` roles. A normal investor is `USER`. A public
collector is a `USER` with `PublicCollectorProfile`; the private
`/collector-workspace` is currently reserved for `ASSET_REVIEWER` or `ADMIN`.
The two staging demos therefore remain `USER` only. This is a deliberate least
privilege boundary, not a missing fixture.

| Feature | Frontend route | Backend endpoint / authority | Required role / capability | External dependency | Status |
|---|---|---|---|---|---|
| Public market browse, search and asset detail | `/`, `/marketplace`, `/asset/:id` | `MarketController`, `MarketService`; `ReadsController` | Public | Published assets | FUNCTIONAL WITH STAGING FIXTURE |
| Public collector profiles | `/collectors`, `/collector/:id` | `ReadsController` public collector projection | Public | Public profile record | FUNCTIONAL WITH STAGING FIXTURE |
| Public vault activity | `/vault-live` | `ReadsController` / `MarketController` public projections | Public | Published vault events | FUNCTIONAL WITH STAGING FIXTURE |
| Signup, login, refresh and logout | `/signup`, `/login` | `AuthController`, `AuthService` | Public / `USER` | CAPTCHA only when enabled | FUNCTIONAL |
| Profile, preferences and account activity | `/account`, `/security` | `AuthService`, `AccountPreferencesService`, `CustomerActivityService` | `MANAGE_PROFILE`, `MANAGE_ACCOUNT_SECURITY` | None | FUNCTIONAL |
| Password change, sessions and revocation | `/account`, `/security` | `AuthService`, `SessionManagementService` | `MANAGE_ACCOUNT_SECURITY` | None | FUNCTIONAL |
| Email verification | `/verify-email`, `/account` | `EmailVerificationController`, `EmailVerificationService` | Authenticated user | Resend delivery in staging production mode | EXTERNAL CONFIGURATION GATE |
| Phone verification | `/account`, `/security` | `PhoneVerificationController`, `PhoneVerificationService` | Authenticated user | Twilio Verify/SMS in staging production mode | EXTERNAL CONFIGURATION GATE |
| TOTP and recovery codes | `/security` | `TwoFactorController`, `TwoFactorService` | `MANAGE_ACCOUNT_SECURITY` | Backend encryption key | FUNCTIONAL |
| Data export, deactivation and deletion request | `/account` | `AccountLifecycleService` | Authenticated user / recent auth where required | Disposable user for destructive QA | FUNCTIONAL |
| Notification preferences, list, unread count and read state | `/notifications`, `/account` | `NotificationController`, `NotificationService`, `NotificationPreferenceService` | Authenticated user | A D17 producer event for content | FUNCTIONAL WITH STAGING FIXTURE |
| Notification realtime stream | `/notifications` | `NotificationController`, realtime publisher | Authenticated user | `OPERATIONAL_REALTIME_ENABLED=true` | EXTERNAL CONFIGURATION GATE |
| Watchlist | `/watchlist`, `/asset/:id` | `MarketController` / market persistence | Authenticated user | Published assets | FUNCTIONAL WITH STAGING FIXTURE |
| Portfolio, wallet balances, lots and history | `/portfolio`, `/wallet` | `FinanceController`, `PortfolioQueryService`, `PortfolioLotService` | `VIEW_PORTFOLIO` | Valid D13 journals/lots | FUNCTIONAL WITH STAGING FIXTURE |
| Internal cash reservation | Orders/wallet projections | `FinancialLedgerService` / cash reservation authority | Trading capability | Valid D13 account + journal | FUNCTIONAL WITH STAGING FIXTURE |
| Banking link | `/wallet` | `ProvidersController`, `PlaidBankLinkService` | `LINK_BANK` | Plaid credentials/product access | EXTERNAL CONFIGURATION GATE |
| Provider deposit / withdrawal | `/wallet` | `WalletMovementService`, provider webhooks | `DEPOSIT_FUNDS` / `WITHDRAW_FUNDS` | Bridge, KYC, bank, provider configuration | EXTERNAL CONFIGURATION GATE |
| Compliance status and holds | `/wallet`, `/account` | `ComplianceService`, `ComplianceHoldService` | Authenticated user | Local adapter only outside production; otherwise Plaid/provider | EXTERNAL CONFIGURATION GATE |
| Trading order preview / place / cancel | `/buy/:id`, `/sell/:id`, `/orders` | `TradingController`, `TradingService` | `PLACE_BUY_ORDER`, `PLACE_SELL_ORDER`; ACTIVE/email/KYC/flags | Valid D12/D13/D14 fixtures and trading flag | FUNCTIONAL WITH STAGING FIXTURE |
| GTC and IOC limit orders | `/orders` | `TradingService` | Trading capabilities | Same as above | FUNCTIONAL WITH STAGING FIXTURE |
| Market orders and automatic expiry | No supported customer route | No supported current contract | — | — | NOT YET IMPLEMENTED |
| Public order book and recent executions | `/orders`, asset pages | `TradingController` public read DTOs | Public | Trading markets/executions | FUNCTIONAL WITH STAGING FIXTURE |
| Listing submission, draft/edit, media, submit/cancel/resubmit | `/list`, `/submissions/:id` | `SubmissionController`, `SubmissionService` | `LIST_ASSET`; feature flag | Local submission storage or approved object storage | FUNCTIONAL WITH STAGING FIXTURE |
| Collector public follow, discussion, posts and report | `/collector/:id`, asset pages | `CommunityController`, `CommunityService` | Authenticated user | Published asset/profile | FUNCTIONAL WITH STAGING FIXTURE |
| Governance proposal, snapshots, voting/replacement and close | `/governance` | `CommunityController`, `GovernanceService` | Proposal-specific eligibility | Eligible ownership + governance fixture | FUNCTIONAL WITH STAGING FIXTURE |
| Collector private workspace | `/collector-workspace` | `ReadsController` collector operations reads | `ASSET_REVIEWER` or `ADMIN` | Staff assignment data | FUNCTIONAL |
| Submission review, valuation, custody, coverage and publication operations | `/operations/submissions`, `/operations/assets`, `/staff` | `LifecycleController`, `LifecycleService` | Staff operation role(s) | Staff user and assignments | FUNCTIONAL |
| Finance reversal/reconciliation operations | Staff/Admin API only | `FinanceController`, reconciliation services | `FINANCE_OPERATOR` / `ADMIN` | Staff operator | FUNCTIONAL |
| Outbox delivery worker and dead-letter operations | No customer route | `OutboxOperationsController`, delivery/worker services | Privileged operations | Worker configuration | EXTERNAL CONFIGURATION GATE |
| Discord link | Account linked accounts | `DiscordLinkController`, `DiscordLinkService` | Authenticated user | Discord OAuth configuration | EXTERNAL CONFIGURATION GATE |

## Fixture requirements and non-negotiable boundaries

- D12 ownership, D13 finance, D14 trading, and D17 notifications must be
  created through their respective services. No direct cash, ownership,
  reservation, or trade state edits are permitted.
- The guarded demo setup provisions one `CASH_AVAILABLE` account per permanent
  demo and funds it once through a balanced, immutable `DEMO_FUNDING` journal.
  The journal is intentionally labelled as an internal staging fixture: it is
  not a bank connection, provider deposit, or real-world customer balance.
- Published catalogue assets require the normal lifecycle authority. A record
  that only looks published in a database row is not a valid demo fixture.
- The two permanent demos are never assigned staff, admin, operational, or
  finance roles. The collector demo only demonstrates the current public
  collector experience. Private collector operations remain a separate staff
  concern until the product introduces a non-staff collector role.
- Provider-backed flows remain unavailable unless the staging environment has
  the named provider configured. A local provider adapter is not permitted in
  a production-mode staging process.

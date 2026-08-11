# Slice staging demo functional test checklist

Run this after `npm run staging:demo:setup` in an explicitly guarded staging
environment. Do not use the permanent demos for deactivation, deletion, or
other destructive workflows; use `npm run staging:demo:create-disposable-user`.

## Investor demo — `demo-investor@slicecollectable.com`

- [ ] Authentication — `/login`; login, logout, login again; expected: normal `USER` session with no staff menus.
- [ ] Account — `/account`, `/security`; expected: profile/preferences/session controls and truthful verification states.
- [ ] Public discovery — `/`, `/marketplace`, `/asset/:id`, `/collectors`, `/vault-live`; expected: only published/public data.
- [ ] Watchlist — `/watchlist`; expected: owner-only list and add/remove flows.
- [ ] Portfolio — `/portfolio`; expected: D13-authoritative balances, holdings, lots and history when a finance fixture is installed.
- [ ] Wallet — `/wallet`; expected: balances/history only; bank link and funding are gated if provider configuration is absent.
- [ ] Trading — `/buy/:id`, `/sell/:id`, `/orders`; expected: current D14 GTC/IOC limit-order contract only, subject to account capability and trading flag.
- [ ] Listing — `/list`, `/submissions/:id`; expected: draft/edit/submit/cancel only when listing/storage feature controls are enabled.
- [ ] Notifications — `/notifications`; expected: owner-only list, unread count, mark-read and preferences.
- [ ] Community / governance — asset discussion and `/governance`; expected: current public/community eligibility behaviour.

## Collector demo — `demo-collector@slicecollectable.com`

- [ ] Repeat every Investor demo item above. Expected: same `USER` capabilities; no privilege reduction.
- [ ] Public collector profile — `/collectors`, `/collector/slice-demo-collector`; expected: profile is public and contains no private assignments.
- [ ] Follow/profile isolation — follow/unfollow and direct profile read; expected: public data only.
- [ ] Private collector workspace — `/collector-workspace` and its APIs; expected: denied. This is a staff-only `ASSET_REVIEWER`/`ADMIN` workspace, not a collector-user feature.
- [ ] Staff and admin routes — `/staff`, `/operations/*` and direct APIs; expected: denied.

## Cross-account security checks

- [ ] Investor direct request to collector workspace is denied.
- [ ] Collector direct request to investor portfolio, wallet, orders, submissions and notifications is denied.
- [ ] Neither demo has `ADMIN`, `SUPPORT`, `ASSET_REVIEWER`, `FINANCE_OPERATOR`, `VAULT_OPERATOR`, or `COMPLIANCE_ANALYST` active roles.
- [ ] Restart API, log in both demos again, and confirm durable accounts and public profile remain.

## External configuration gates

| Feature | Required configuration before testing |
|---|---|
| Email proof | Resend sender/API key plus deliverable inboxes for the fixed demo addresses |
| Phone proof | Twilio Verify/SMS credentials and recipient policy |
| Bank link / identity | Plaid credentials, product approval, and browser redirect configuration |
| Deposits/withdrawals | Bridge/provider approval, bank connection, approved compliance, and flags |
| Realtime notification delivery | `OPERATIONAL_REALTIME_ENABLED=true` plus worker/SSE deployment |
| Discord link | Discord OAuth client, secret and staging redirect URI |

## Safe fixture commands

```bash
# Explicit staging guard; passwords stay only in the process environment.
npm run staging:demo:preflight
npm run staging:demo:setup
npm run staging:demo:refresh
npm run staging:demo:create-disposable-user
npm run staging:demo:verify-auth
```

`preflight` is read-only. It reports only configuration presence and capability
decisions (never secret values), so the operator can distinguish working
internal features from external provider gates before any fixture is written.

`refresh` currently revalidates the durable identity/profile fixture without
deleting customer-facing history. It is intentionally not a database reset.

### Required non-secret staging environment

```dotenv
SLICE_ENV=staging
ALLOW_DEMO_DATA_SETUP=true
DEMO_SETUP_ADMIN_EMAIL=existing-admin@example.invalid
# DEMO_SETUP_ADMIN_PASSWORD, DEMO_INVESTOR_PASSWORD,
# DEMO_COLLECTOR_PASSWORD and DEMO_COLLECTOR_B_PASSWORD are runtime secrets.
# Do not place them in Git.
```

The setup command authenticates the existing administrator and uses
`AccessControlService` to activate only newly-created demo accounts. It then
provisions the minimal D13 account container and posts one balanced,
idempotent `DEMO_FUNDING` journal per demo account; it never writes a balance
projection directly and never represents the fixture as a bank deposit. On
every run it authenticates both demo credentials first; it never overwrites an
existing demo password. A failed supplied credential is a hard stop, so a
misconfigured secret cannot silently replace a working account.

If preflight reports that no setup administrator credentials are present, stop
there. The repository's existing one-time `bootstrap:admin` authority may be
used only when the database has no active global administrator and only for an
already-existing operator account; it must never be pointed at either demo
account.

For the required restart proof, run `npm run staging:demo:verify-auth`, restart
only the Slice API service using the normal staging service manager, then run
`STAGING_DEMO_AUTH_RESTART_PROOF=true npm run staging:demo:verify-auth`.
The second command writes a narrow audit proof only after it has again proven
login → logout → login and that logout did not alter either password hash.
The setup command will not create the D13 demo-funding journals without this
fresh (12-hour) proof for both permanent accounts.

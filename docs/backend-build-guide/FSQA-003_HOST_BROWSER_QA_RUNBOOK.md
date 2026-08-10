# FSQA-003 host-browser visual and interactive QA runbook

**Status:** required before FSQA-003 can close. This is a local-only test procedure; it neither
deploys Slice nor certifies an external provider.

## 1. Local setup

Open three PowerShell windows. All commands below use the authoritative workspace only.

### API and dependencies

In `C:\Users\Aarons\Documents\Codex\2026-08-05\files-mentioned-by-the-user-you\work\slice-project\server`:

```powershell
$env:NODE_ENV = 'test'
npm run qa:browser:seed
node --env-file=.env dist/main
```

The browser fixture is deliberately limited to the local/test database. It creates two disposable
accounts, three published assets, safe market snapshots, a governance eligibility snapshot, public
collector and vault data, and three notifications. It does not create provider, finance, trading, or
production data.

In a second window, from `C:\Users\Aarons\Documents\Codex\2026-08-05\files-mentioned-by-the-user-you\work\slice-project`:

```powershell
$env:VITE_DATA_SOURCE = 'api'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:3001'
npm run dev -- --host 127.0.0.1
```

Confirm these URLs before opening a browser:

```powershell
Invoke-WebRequest http://127.0.0.1:3001/health
Invoke-WebRequest http://127.0.0.1:3001/ready
```

Expected: `/health` reports `status: ok`; `/ready` reports PostgreSQL and Redis `up`.

### Scoped accounts

| Purpose | Email | Password | Expected access |
| --- | --- | --- | --- |
| Customer | `qa-browser@slice.test` | `BrowserQA!2026-valid-password` | Customer, ownership and governance-voter flow |
| Staff | `qa-browser-staff@slice.test` | `BrowserQA!2026-valid-password` | Disposable `ADMIN` + `ASSET_REVIEWER` checks only |

Do not reuse either account outside this local run. Log out before switching accounts.

## 2. Browser and viewport matrix

Run every applicable step in **Chrome/Chromium** and **Edge**. Also run it in **Firefox** where
available. Record the actual browser/version rather than checking a browser that was not used.

At each browser, test 375 px, 768 px, 1024 px and 1440 px wide viewports. At 375 px, test the
mobile menu and ensure `document.documentElement.scrollWidth` does not exceed the viewport. Capture
one screenshot for each major page at 375 px and 1440 px; capture defects at the viewport where
they reproduce.

## 3. Customer walkthrough

Open `http://127.0.0.1:5173` and use the customer account unless a step says staff.

1. **Sign up and session:** Visit `/signup`, submit a fresh disposable email, confirm the dashboard
   redirect, refresh after two seconds, and verify the authenticated dashboard returns. Visit
   `/account`, then log out; revisit `/portfolio` and capture the sign-in state. Log back in as the
   customer fixture. Capture the account and post-logout screens.
2. **Dashboard:** At `/`, verify cash, holdings, open-order, recent-activity and marketplace cards
   have an honest data or empty state—never fabricated totals. Capture desktop and mobile.
3. **Marketplace and search:** At `/marketplace`, search `Charizard`, clear the search, exercise
   pagination if it appears, and open `/asset/qa-browser-charizard`. Confirm the title, image/empty
   image treatment, metadata, valuation status, order-book/recent-trade state, and buy/sell entry
   point are legible. Capture the grid, empty/loading state if reachable, and detail page.
4. **Portfolio:** Visit `/portfolio`. Verify holdings, owned/reserved/available units, lots,
   transactions and cash are either server values or explicit empty/unavailable states. Exercise
   history cursor/load-more where available. Capture the mobile table layout without clipped GBP or
   unit values.
5. **Watchlist:** From the marketplace card, add the Charizard asset, visit `/watchlist`, refresh,
   remove it, refresh again, and capture both persisted and empty states.
6. **Notifications:** Visit `/notifications`, confirm the unread count/list, mark one read, mark all
   read, refresh and confirm the read state persists. Record any SSE connection failure or console
   error; do not treat sandbox-provider absence as an SSE failure.
7. **Wallet and account:** Visit `/wallet` then `/account`. Check cash, linked-bank, compliance,
   deposit, withdrawal and movement-history states render clear authorised or unavailable status
   without internal IDs. Do not enter external provider credentials. Capture both pages.
8. **Governance:** Visit `/governance`, open the fixture proposal, cast a vote, refresh, replace the
   vote if the UI allows it, and confirm the current status and units are clear. Capture list and
   detail. The customer must not see administrative open/close controls.
9. **Collectors and vault:** Visit `/collectors`, the public QA collector detail/assets page, and
   `/vault-live`. Confirm only public collector data is visible, event cards are usable, and empty
   states are intentional. Capture each page.
10. **Customer submission:** Visit `/list`; create a draft with only disposable information, edit it,
    inspect media upload usability (do not upload private files), submit/resubmit/cancel where the
    route permits it, and capture status/error messages.
11. **Trading:** On an eligible asset, inspect buy and sell form labels, disabled/loading states,
    preview, validation and a backend rejection using an intentionally insufficient amount. Do not
    attempt a real-provider movement. If a disposable eligible order fixture is separately available,
    place/cancel only scoped orders and record reservation/release state.
12. **Errors and accessibility:** Exercise one each of sign-in-required (401), forbidden customer
    action (403), not-found (404), validation error (422) and unavailable provider state (503 if
    offered). Confirm no raw JSON/Prisma/provider material is shown. Keyboard through nav, forms,
    dialogs and menus; capture visible focus, labels, named buttons, modal focus and non-colour-only
    statuses.

## 4. Staff-only walkthrough

Log out, sign in with the disposable staff account, and capture the account menu/role-gated route
entry. The customer account must be retested after this section to confirm those controls are hidden.

1. **D10 submissions:** Visit `/operations/submissions`; check queue, detail, claim, request-changes,
   approve and reject controls. Exercise only the scoped submission created in section 3.10 and
   capture each resulting status.
2. **D11 operations:** Visit `/operations/assets`; discover a fixture asset and inspect valuation,
   custody, coverage, readiness and publication presentation. Capture a blocked readiness state and
   a permitted action only when its local prerequisite data exists.
3. **D15 governance:** Visit `/governance`; confirm staff-only proposal open/close controls are
   visible only to the staff account. Do not modify non-QA proposals.
4. **Navigation:** Check every visible desktop and mobile navigation item: Dashboard, Marketplace,
   Portfolio, Wallet, Notifications, Account, Watchlist, Collectors, Vault Live, Governance,
   Submissions and authorised Operations routes. Record target URL, status and any dead link.

## 5. Control, visual and network checklist

For every visited page, exercise each visible button, select, tab, filter, pagination control, modal,
dialog, search input and confirmation control. Record controls that do nothing, route incorrectly,
do not persist, or emit a console/network error. Check desktop/mobile spacing, image distortion,
table wrapping, status-pill legibility, card alignment, chart sizing and modal overflow.

Keep DevTools open and capture JavaScript exceptions, failed HTTP/SSE requests, CORS errors, 404
assets, repeated requests and React warnings. A route-level loading skeleton is acceptable only when
it resolves to an API response or a user-safe error state.

## 6. Required evidence to return

Return the following to the QA record:

- Browser name/version and operating system for every tested browser.
- A 375 px and 1440 px screenshot for Dashboard, Marketplace, Asset Detail, Portfolio, Wallet,
  Notifications, Governance, Collectors, Vault Live, Submission and Operations pages.
- Screenshots of validation, sign-in-required, forbidden and provider-unavailable states.
- A short table of every interactive control tested, its result and any defect.
- Console/network export or screenshots for any warning/error, including endpoint and response code.
- A list of any page with horizontal overflow, clipped content, missing focus indicator, unlabeled
  field or unsafe/private data.

## 7. Cleanup

Log out in each browser. Stop the Vite/API processes. Then, from the server directory:

```powershell
$env:NODE_ENV = 'test'
npm run qa:browser:cleanup
```

Expected: `Local browser QA fixture removed.` The cleanup removes only the `qa-browser-*` users,
roles, sessions, notifications, watchlist rows, governance/ownership fixture, assets, collectors and
market/vault fixture rows. Record the command output; do not delete shared platform or treasury data.

## 8. Closure rule

Close FSQA-003 only after the returned evidence covers the real named host browsers and required
viewports. Codex in-app-browser smoke evidence is useful for local setup only; it is not a substitute
for Chrome/Edge/Firefox host-browser certification.

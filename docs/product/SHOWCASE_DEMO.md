# Slice showcase demo

## Local services

Start local PostgreSQL and Redis using the project’s normal local environment, then start the API from `server` with the canonical local development variables and `npm run start:dev`.

Start the web app at the project root:

```powershell
$env:VITE_DATA_SOURCE = 'api'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:3001'
npm run dev
```

`VITE_DATA_SOURCE=mock` is an explicit visual-development mode. It does not call the API and is not the showcase path.

When the frontend runs on Vite’s local host, include that explicit origin in `CORS_ORIGINS` before starting the API:

```powershell
$env:CORS_ORIGINS = 'http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173'
```

## Safe local seed

The repeatable browser fixture is deliberately non-economic: it creates published catalogue records, valuation points, an active test user and durable test notifications. It does not create cash, ownership, orders, executions or provider movements.

```powershell
cd server
npm run qa:browser:seed
# remove the fixture when finished
npm run qa:browser:cleanup
```

For an end-to-end trading demonstration, use a disposable local fixture created through the existing finance/ownership/trading test or QA harnesses. Do not place demo orders against shared or production data.

## Showcase path

1. Select **Create Account**, provide a display name, email, password and password confirmation.
   Slice creates the account through the backend and signs the user in with a cookie-backed session.
   Refreshing the page restores that session; **Log out** revokes it and **Log in** creates a new one.
2. Email verification, phone verification, and Plaid Identity Verification are deferred. The account
   screen reports those states honestly; none are represented as complete merely because registration
   succeeded.
3. The dashboard shows ledger-backed cash, holdings, recent activity and real published-market links.
4. Open **Markets**, search the public catalogue, then open an asset.
5. Review the authoritative valuation history, aggregate order book and recent executions.
6. Use **Buy** or **Sell** to enter smallest-unit quantity and a GBP limit price. The review step displays the backend preview; submitting displays the returned order status.
7. Open **Portfolio** to review cash, holdings, lots, finance history, orders and executions. Open orders can be cancelled through the backend authority.
8. Open **Wallet** to review ledger-backed GBP cash, safe compliance state, connected-bank status and provider-neutral movement history. Provider confirmation remains the authority for movement completion.
9. Open **Notifications** to view/read durable account notifications. The authenticated SSE connection invalidates durable notification reads when a `notification.created` event arrives; reconnects refetch durable state.
10. Open **List an Asset** to save a private, backend-authoritative submission draft. The page does
    not claim an AI valuation, successful review, custody, publication, ownership or a sale;
    evidence and reviewer steps remain separate backend workflows.
11. A sale-proposal URL displays only the authenticated D15 proposal/tally and allows an eligible
    backend-authoritative vote. The page does not invent an owner, counterparty, appreciation,
    performance fee, local tally or sale outcome.

## Customer-facing walkthrough

1. Begin on **Create Account** or **Log in**. The forms provide inline validation and do not claim
   that deferred email, phone, or identity verification has occurred.
2. From the signed-in dashboard, use **Account** to confirm the safe account and linked-bank
   projection, then use **Markets** to search the published catalogue and open an asset.
3. Use **Buy** or **Sell** to review an authoritative order preview before submitting. Review
   returned order status in **Portfolio**, where cash, holdings, lots, transactions, orders, and
   executions remain separate authoritative views.
4. Use **Wallet** to distinguish cash, connected bank, provider availability, and pending movement
   state. A bank connection does not imply identity verification or completed movement.
5. Open **Notifications** to demonstrate durable read state and best-effort realtime refresh.

The customer routes are checked at mobile, tablet, desktop, and wide-desktop widths. Narrow data
tables retain their labels and scroll within their card rather than overflowing the page.

## Honest limitations

- Prices and histories retain their API-provided `DEMO`, `DELAYED` or `LIVE` status; the UI does not synthesize price history, P&L, allocation, returns or performance.
- Portfolio allocation/basket investing is intentionally unavailable. It has no approved backend
  authority, so Slice does not calculate capacity, allocation, fees, cash movement or fills in the
  browser.
- Document 016 external provider certification remains pending. External funding/withdrawal provider states are not presented as live.

## Frontend/backend integration sweep

The authoritative route-by-route integration classification is maintained in
[`docs/backend-build-guide/FRONTEND_BACKEND_INTEGRATION_MATRIX.md`](docs/backend-build-guide/FRONTEND_BACKEND_INTEGRATION_MATRIX.md).
API mode is the production default. `VITE_DATA_SOURCE=mock` is an explicit local visual-development
choice only and never a fallback when an API request fails.

## Plaid Link Sandbox (Document 018 Phase 2)

Bank linking is a backend-mediated Plaid Sandbox flow. Configure the API process only with
`PROVIDER_MODE=sandbox`, `PROVIDERS_PRODUCTION_ENABLED=false`, `PLAID_ENV=sandbox`,
`PLAID_CLIENT_ID`, `PLAID_SECRET`, and a non-production `PROVIDER_ENCRYPTION_KEY` (32+ characters).
Never put `PLAID_SECRET`, a Plaid access token, or any provider credential in a `VITE_*` variable,
frontend source, browser storage, committed env file, or logs.

With the API and frontend running, sign in, open **Wallet**, then select **Connect bank**. The
frontend requests a short-lived Link token from Slice, opens Plaid Link, and sends only the returned
public token back to Slice. Slice exchanges it server-side and stores encrypted Item/access-token
material. Refreshing or signing in again reloads the safe account projection: account name, mask,
type and connection state. Use the current UK Sandbox institution and credentials shown in the Plaid
Dashboard; do not copy credentials into this guide.

Bank connected and identity verified are deliberately separate. Identity Verification needs
`PLAID_IDV_TEMPLATE_ID` plus the product enabled for the Plaid account. Monitor remains a backend
compliance capability and does not expose screening data to users. UK Payment Initiation is not
implemented by this pass: no US Transfer substitute or synthetic wallet credit is presented.
Production Plaid certification, provider webhook registration, Identity/Monitor product approval,
and Payment Initiation approval remain launch-gate work.

- SSE is best-effort single-instance fanout. PostgreSQL notification reads are the source of truth after reconnect.
- Final launch, load, staging and production-security certification are Document 018 Phase 2+ work.

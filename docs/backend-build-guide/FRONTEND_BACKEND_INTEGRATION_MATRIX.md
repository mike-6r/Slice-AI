# Frontend / backend integration matrix

**Local integration sweep — 2026-08-08.** This matrix covers every customer route in `src/routes`.
`AppServicesProvider` selects HTTP repositories in API mode (the production default); mock data is
available only with the explicit `VITE_DATA_SOURCE=mock` development setting. No API-mode route
silently falls back to a mock adapter.

| Route | Classification | Authoritative source and behavior |
| --- | --- | --- |
| `/` | Real backend-integrated | D13 portfolio summary/history, D14 own orders, and published catalogue reads through React Query repositories. Anonymous users receive honest sign-in/empty states. |
| `/marketplace` | Real backend-integrated | Published D06/D07 catalogue and market reads with server pagination; frontend filters only the returned public records. |
| `/asset/$id` | Real backend-integrated | Published asset, valuation history, D14 aggregate order book and safe recent executions. Missing marks remain unavailable. |
| `/buy/$id`, `/sell/$id` | Real backend-integrated | D14 preview/place APIs with D13/D12 reservation authority and D16 compliance eligibility. No local order or balance mutation. |
| `/portfolio` | Real backend-integrated | D13 self-only portfolio, holdings, lots, safe financial history and D14 own order/execution reads. Valuation is FULL/PARTIAL/UNAVAILABLE exactly as returned. |
| `/wallet` | Real backend-integrated / provider-dependent | D13 balances and D16 safe movement/compliance/bank-link projections. Provider effects remain pending until their real adapter completes them; sandbox/local states are labelled by the backend. |
| `/account` | Real backend-integrated | Authenticated `/me`, compliance and connected-bank repositories; no route-level HTTP client or local account model. |
| `/notifications` | Real backend-integrated | D17 private notification history/read state plus authenticated SSE. |
| `/watchlist` | Real backend-integrated | D08 self-only watchlist CRUD. |
| `/collectors`, `/collector/$id`, `/collector/$id/assets` | Real backend-integrated | Public collector directory/profile and published asset reads. Holdings, private portfolios and performance are deliberately not shown. |
| `/vault-live` | Real backend-integrated | D11/D17 public-safe vault events and summary only. |
| `/list` | Real backend-integrated | D10 category read and private submission-draft creation/listing. It does not fabricate AI valuation, media verification, publication, ownership, fees or a successful listing. Evidence upload/review remains a separate authoritative workflow. |
| `/sell-proposal/$id` | Real backend-integrated | D15 authenticated proposal read and idempotent weighted-vote API. The route displays only returned proposal/tally data; it does not invent appreciation, counterparties, fees, outcome or a local vote tally. |
| `/allocate/$id` | Intentionally deferred | No approved basket/managed-allocation authority exists. The old capacity, fee and allocation-fill simulator was removed and replaced by an explicit unavailable state. |
| `/login`, `/signup` | Real backend-integrated | D04 cookie/session issuance through the central HTTP client and session store. |

## Explicit mock-only and removed behavior

- `src/mocks/**`, `src/repositories/market-repository.ts`, `src/components/home/**`,
  `src/components/listing/**`, `src/lib/listing-*`, `src/components/SearchBar.tsx` and
  `src/state/DemoStateProvider.tsx` are legacy mock/development or currently unreferenced UI
  material. They are not imported by an API-mode customer route after this sweep.
- Legacy `TradingRepository` demo compatibility methods remain implemented only by the explicit
  mock adapter. API mode rejects those methods and all current trading routes use D14
  `previewOrder`, `placeOrder`, `cancelOrder`, order-history and execution-history contracts.
- Generated `dist/**` is build output and is not a source of truth.
- The global navigation search now forwards its entered query to the server-backed marketplace
  search; it no longer displays legacy local search results, price changes or collector-return data.

## Boundary rules verified by the adapters

- GBP money is passed as backend minor-unit strings; ownership units remain decimal/integer wire
  strings. Missing valuations remain `null`/unavailable instead of zero.
- Public book/trade and vault adapters expose aggregate safe DTOs only. Private finance, ownership,
  provider, compliance, audit and internal-account identifiers are not rendered.
- External provider certification (Bridge, Plaid and BlockchainAnalysis.io) is independent of the
  frontend contract: production provider operations remain fail-closed until the documented
  external certification gates are complete.

## Local API-mode verification (2026-08-09)

- The local API and frontend were exercised with `VITE_DATA_SOURCE=api`; the API-mode customer
  routes did not use the mock repository fallback.
- A disposable account completed sign-up and session restoration. Its dashboard, portfolio, wallet,
  transaction history, notifications, watchlist and account pages displayed backend-provided empty
  or pending states rather than fabricated balances, holdings, notifications, provider completion or
  compliance approval.
- Marketplace search returned the real empty catalogue state. D10 rendered real backend categories
  and persisted a private `DRAFT` submission. No eligible D15 proposal existed in this local data
  set, so the real proposal route showed its safe unavailable state rather than a synthetic tally.
- The allocation route remained explicitly unavailable. The scoped account and its draft were removed
  after verification. The local API is healthy/ready and returns
  HTTP 200 for market reads after the preserved development and test schemas were reconciled to the
  repository's 40-migration chain.

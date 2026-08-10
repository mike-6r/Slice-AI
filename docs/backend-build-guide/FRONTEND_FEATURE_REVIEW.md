# Frontend feature review

All routes are prototype/mock-backed unless stated. `src/routes/__root.tsx` supplies `AppShell` and TanStack Query, but most polished routes still import route-local or legacy mock data.

| Route                                                    | Current source/action                                        | Backend authority and integration                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `/`                                                      | home components and market/home mocks                        | catalogue/market 006–007; read adapter 009; private portfolio 013                       |
| `/marketplace`                                           | `ASSETS`, client filters/sort/save/load-more                 | 006–008; adapter 009                                                                    |
| `/asset/$id`                                             | `getAsset`, mock chart/orders/trades/collectors, local watch | market 007, watch 008, ownership 012, authoritative book/trades 014, adapter 009/018    |
| `/buy/$id`, `/sell/$id`                                  | local percentage/amount/fee and simulated completion         | ownership/finance 012–013, order preview/place 014, compliance 016, final adapter 018   |
| `/portfolio`                                             | static holdings/charts/alerts                                | provisional read 008; authoritative ledger/lots/P&L 013; realtime 017; adapter 018      |
| `/collectors`, `/collector/$id`, `/collector/$id/assets` | `COLLECTORS`/mock holdings/local follow                      | public directory/holdings 008; follow 015; adapter 009/018                              |
| `/allocate/$id`                                          | local capacity/pro-rata calculation                          | future basket orchestration only after 012–014; not separately authorized in this guide |
| `/list`                                                  | localStorage draft, browser files, simulated AI/publish      | catalogue 006, submissions/media/review 010, publish gates 011, adapter 018             |
| `/vault-live`                                            | literal simulated events                                     | public read 008, custody authority 011, realtime 017, adapter 009/018                   |
| `/watchlist`                                             | local seeded array/remove                                    | self CRUD 008, adapter 009                                                              |
| `/notifications`                                         | literal data/mark read                                       | records/read state 008, delivery/realtime 017, adapters 009/018                         |
| `/login`, `/signup`                                      | local forms/navigation; no session/account                   | auth/profile 004, controls 005, adapter 018                                             |
| `/sell-proposal/$id`                                     | local vote/progress                                          | snapshot/voting/sale/distribution 015, realtime 017, adapter 018                        |
| `/wallet`                                                | intentionally disabled/no provider                           | finance reads 013; provider/compliance 016; enable only through 018 gate                |

Shared `MainNavigation`, `MarketTicker`, cards, charts and footer retain their approved visuals. Search maps to 007. Newsletter remains out of scope until consent/retention is approved. API adapters must add loading, empty, error, retry and session states without presenting demo data as live.

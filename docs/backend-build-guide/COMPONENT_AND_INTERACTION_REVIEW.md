# Component and interaction review

| Component or interaction               | Current behavior                            | Required owner                                                     |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `AssetCard`, `MarketAssetCard`, grids  | mock asset, local bookmark                  | 006–008 data; 009 adapter; 012 ownership aggregate                 |
| marketplace filters/toolbar/pagination | client-only filtering and visual pagination | 007 allowlisted cursor query; 009 integration                      |
| `Chart.tsx`, asset widgets             | mock history/order book/trades              | 007 history/source; 014 book/trades; 017 invalidation              |
| buy/sell/allocate routes               | local arithmetic and success                | 012 units, 013 cash/fees, 014 preview/order/settlement, 016 gate   |
| home widgets/ticker                    | mock summary/movers/portfolio               | 007 public snapshots, 013 private portfolio, 017 live invalidation |
| collectors routes                      | literal directory/holdings/local follow     | 008 public/privacy reads, 015 follow                               |
| listing components/ImageSlots          | local draft/object URLs/simulated analysis  | 010 secure draft/media/review, 011 publication                     |
| Vault Live                             | literal feed/filter                         | 008 public feed, 011 custody authority, 017 delivery               |
| watchlist/notifications                | route-local arrays                          | 008 self records, 009 adapter, 017 delivery                        |
| login/signup/navigation                | no tokens/cookies/session                   | 004 auth/profile, 005 restrictions, 018 final adapter              |
| wallet                                 | explicitly disabled                         | 013 internal ledger, 016 approved provider only, 018 launch flag   |
| sale proposal                          | local vote/progress                         | 015 immutable eligibility/vote/distribution, 017 updates           |

Components consume data through `AppServicesProvider`, repository interfaces and query hooks. Private profile, wallet, compliance, order and settlement data must never use public channels. Integration preserves accessibility and the approved premium visual design.

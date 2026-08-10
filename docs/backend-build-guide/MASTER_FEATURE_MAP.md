# Master feature map

`MOCKED` means frontend UI/types/local data only. Documentation expansion does not change implementation state.

| Feature                                 | Frontend consumers                    | Current state       | Primary document(s)                                             |
| --------------------------------------- | ------------------------------------- | ------------------- | --------------------------------------------------------------- |
| Foundation/runtime                      | all                                   | PARTIAL/SCAFFOLDED  | 001–002                                                         |
| Identity/auth/profile/access            | login, signup, navigation/profile     | PARTIAL/NOT STARTED | 003 persistence, 004 API, 005 controls                          |
| Catalogue/reference data                | home, marketplace, listing            | MOCKED              | 006                                                             |
| Discovery/market/asset detail           | home, marketplace, asset              | MOCKED              | 007; frontend reads 009                                         |
| Collectors/public holdings/follow       | collector routes                      | MOCKED              | 008 reads; 015 follow                                           |
| Vault/public activity                   | Vault Live, asset                     | MOCKED              | 008 read projection, 011 authority, 017 delivery                |
| Portfolio/watchlist/notifications       | portfolio, watchlist, notifications   | MOCKED              | 008 provisional/self reads, 013 finance authority, 017 delivery |
| Frontend read integration               | public/read routes                    | NOT STARTED         | 009                                                             |
| Submission/media/verification           | list                                  | MOCKED              | 010                                                             |
| Valuation/custody/insurance/publication | list, asset, Vault Live               | MOCKED              | 011                                                             |
| Ownership                               | asset, buy/sell/allocate, portfolio   | NOT STARTED         | 012                                                             |
| Financial ledger/lots/P&L               | wallet, portfolio, trading            | NOT STARTED         | 013                                                             |
| Orders/matching/settlement              | buy/sell, asset book/trades           | MOCKED              | 014                                                             |
| Community/governance/distribution       | collectors, discussion, sale proposal | MOCKED/NOT STARTED  | 015                                                             |
| KYC/KYT/wallet providers/webhooks       | signup, wallet, trading gates         | DEFERRED            | 016                                                             |
| Outbox/jobs/realtime/admin ops          | notifications and all live widgets    | NOT STARTED         | 017                                                             |
| Security/readiness/final integration    | all                                   | baseline PARTIAL    | 018                                                             |

Every feature maps to at least one document; shared features identify one authoritative owner and explicit projection/integration consumers.

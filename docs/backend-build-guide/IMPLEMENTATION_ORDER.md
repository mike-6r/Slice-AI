# Implementation order

## Latest status (2026-08-08)

Document **018 Phase 3 is complete for local implementation and verification**. It is the terminal
implementation document; no new document or Phase 4 implementation was started. External provider
certification and human launch authorization remain gates, with production new-risk controls
fail-closed by default.

| #   | Dependencies                   | Risk     | Parallel safety                                | Current state                  |
| --- | ------------------------------ | -------- | ---------------------------------------------- | ------------------------------ |
| 001 | none                           | high     | frontend-only work if no shared contract edits | COMPLETE                       |
| 002 | 001                            | high     | no runtime/schema work in parallel             | COMPLETE (verified 2026-08-06) |
| 003 | 001–002                        | high     | no identity persistence parallelism            | COMPLETE (verified 2026-08-06) |
| 004 | 001–003                        | critical | no auth contract parallelism                   | COMPLETE (verified 2026-08-06) |
| 005 | 003–004                        | critical | no access/control parallelism                  | COMPLETE (verified 2026-08-06) |
| 006 | 001–005                        | medium   | limited to unrelated UI                        | COMPLETE (verified 2026-08-06) |
| 007 | 006                            | high     | limited                                        | COMPLETE (verified 2026-08-06) |
| 008 | 004,006–007                    | high     | limited                                        | COMPLETE (verified 2026-08-06) |
| 009 | 004,006–008                    | medium   | no competing frontend data refactor            | COMPLETE                       |
| 009A | 009                            | high     | frontend session/cache integration only        | COMPLETE                       |
| 010 | 004–006                        | high     | limited                                        | COMPLETE (verified 2026-08-07) |
| 011 | 007,010                        | critical | no asset lifecycle parallelism                 | COMPLETE (verified 2026-08-07) |
| 012 | 005,011                        | critical | none for ownership schema/transactions         | COMPLETE (verified 2026-08-07) |
| 013 | 012                            | critical | none for finance schema/transactions           | COMPLETE (verified 2026-08-07) |
| 014 | 005,012–013                    | critical | none for matching/settlement                   | COMPLETE (verified 2026-08-08) |
| 015 | 005,012–014                    | high     | limited community-only work                    | COMPLETE                       |
| 016 | 005,013–014 plus approvals     | critical | local provider-neutral authority complete; external provider certification remains a launch gate | IMPLEMENTATION COMPLETE / PROVIDER CERTIFICATION PENDING |
| 017 | 006–016 event contracts stable | high     | transactional outbox, fenced leased worker reliability, notification routing/API/SSE and audited dead-letter operations | COMPLETE |
| 018 | 001–017                        | critical | coordinated launch work only                   | NEXT / NOT STARTED             |

The dependency graph is acyclic. Ownership precedes finance and trading; finance precedes settlement; provider reconciliation precedes any production payment enablement; final frontend mutation/realtime rollout occurs only after backend authority exists.

## Current document state (2026-08-07)

Documents **001–012** are COMPLETE. Document **013** is PARTIAL: the finance persistence/money foundation is applied; posting and portfolio authority remain.

## Document 013 closure update (2026-08-07)

Documents **001** through **013** are COMPLETE. Document **014** is NEXT and **NOT STARTED**. No Document 014 implementation has begun.

## Document 014 closure update (2026-08-08)

Documents **001** through **014** are COMPLETE. Document **015** is NEXT and **NOT STARTED**. Document 014 implemented only internal order matching/execution authority; no Document 015 distributions, external settlement, provider, wallet, bank or crypto integration was started.

## 009 compatibility exception

## Historical closure update (2026-08-06)

**009** and **009A** are COMPLETE following local browser-harness verification. **010** is NEXT APPROVED — NOT STARTED.

Document 009 is **PARTIAL / IMPLEMENTATION COMPLETE**. `009A` (`implementation/009a-frontend-auth-session-and-private-cache-integration.md`) is PARTIAL and must close before Document 010: it owns real frontend authentication, private-cache lifecycle and authenticated browser QA. Document 010 remains NOT STARTED.

## Historical planning update (2026-08-06)

The historical table above predates the 009 compatibility work. Current state is:

- **009:** PARTIAL / implementation complete.
- **009A:** PARTIAL; session implementation is present and automated-tested, but authenticated and responsive browser QA are blocked by the unavailable browser-control runtime.
- **010:** NOT STARTED and may not begin until 009A/browser-QA completion conditions are resolved.

## Historical completion update (2026-08-07)

Documents **001–010** are COMPLETE. **011** is NEXT APPROVED / NOT STARTED. Document 010 added the submissions/media/review bounded module and migration `20260807041334_submissions_media_verification`; no Document 011 code was started.

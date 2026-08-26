# Test and verification audit

## Current evidence

| Area                          | Result                                           | Limitation                                                                          |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Frontend unit/component tests | 39 files / 161 passed                            | No full browser/mobile staging run in this audit                                    |
| Backend Jest suite            | 77 suites / 345 passed                           | No live staging DB query in this audit                                              |
| Backend typecheck/build/lint  | PASS                                             | None found in local run                                                             |
| Prisma validate               | PASS                                             | Migration application against a disposable DB not run here                          |
| Discord typecheck/build/lint  | PASS                                             | None found in local run                                                             |
| Discord test suite            | 31 files / 167 passed; 39 skipped                | 7 integration files fail on missing local PostgreSQL at `127.0.0.1:5432`            |
| Frontend lint                 | FAIL: 3,945 errors / 10 warnings                 | Mostly formatting; it is not part of the successful baseline commands               |
| Browser QA                    | Not run                                          | Requires a running/authenticated app and controlled fixture policy                  |
| Staging QA                    | Not run beyond previously observed public health | VPS SSH authentication failed; authenticated catalogue/DB authority remains unknown |

## Coverage gaps that matter for cleanup

- No single repository-level gate verifies all three runtimes.
- Canonicalization needs an end-to-end invariant covering approved submission, explicit asset handoff, duplicate graded cert, repeated transition, intake, and lineage.
- The admin catalogue needs API contract tests for no-data vs no-match, partial valuation/ownership failure, fixture filtering, pagination, and permission projections.
- Overlapping staff/admin routes need authorization and navigation coverage before consolidation.
- Integration tests should skip cleanly or fail with a clear prerequisite message when PostgreSQL is absent; current Discord integration setup attempts database lifecycle calls and reports connection failures.
- Build warnings for large frontend chunks should be tracked as a performance budget, not treated as a functional build failure.

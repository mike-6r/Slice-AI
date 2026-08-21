# Bug Report

Bug ID:  
SLICE-003

Area:  
Automated QA / Environment

Title:  
Local integration and E2E test environment is not runnable from the authoritative workspace

Environment:  
Local QA workspace

Account:  
N/A

Severity:  
High

Steps to Reproduce:

1. Run `server/npm run test:integration`.
2. Run `server/npm run test:e2e`.
3. Observe the test database and Redis connection errors.
4. Observe the E2E configuration failure for `PROVIDER_MODE=sandbox`.

Expected Result:

Database-backed integration and E2E suites start against an isolated test PostgreSQL/Redis environment using a supported provider-mode value.

Actual Result:

The original harness could not connect to local PostgreSQL/Redis and rejected obsolete `PROVIDER_MODE=sandbox`. The harness is now able to apply migrations and execute both suites, but the current codebase has additional application/test-contract failures that are not infrastructure failures.

Screenshot / Video / Evidence:

- 2026-08-21 command output from `npm run test:integration` and `npm run test:e2e`.

Additional Notes:

- Root cause: there was no deterministic test service bootstrap and the repo scripts inherited an obsolete provider-mode value.
- Fix: added `server/compose.test.yaml` with a separate `slice_test` PostgreSQL database and isolated Redis port; `server/scripts/run-test-suite.mjs` forces test-only database/Redis defaults, `PROVIDER_MODE=local`, safe test secrets, and runs `prisma migrate deploy` before Jest. `npm run test:integration` and `npm run test:e2e` now use this runner.
- Integration evidence: migrations applied successfully (79 migrations); 34 suites ran, 24 passed and 10 failed (124 tests: 96 passed, 28 failed). Remaining failures are stale/current application-contract issues including outbox lease timing, response-field expectations, audit metadata validation, and Redis reconnect behavior.
- E2E evidence: 79 migrations were already applied; 32 suites ran, 18 passed and 14 failed (102 tests: 54 passed, 48 failed). Remaining failures include stale signup/auth/lifecycle/reviewer expectations and current market/financial response fields. Jest reported open handles after its summary.
- Prisma validate, backend typecheck, backend unit tests (63 suites / 263 tests), backend build, and focused touched-file lint pass. Repository-wide frontend lint remains pre-existing formatting debt; the shared card file has that pre-existing debt and was not reformatted wholesale.
- Staging `/health` and `/ready` remained healthy. No staging database or production database was used for automated tests.

Status:  
Closed — isolated integration/E2E release gate green on 2026-08-21

Closure evidence:

- Integration: 34 suites / 124 tests passed.
- E2E: 32 suites / 102 tests passed with clean process exit and no open-handle warning.
- The isolated runner uses PostgreSQL/Redis test services, 79 migrations and `PROVIDER_MODE=local`.
- Repository-wide Prettier debt remains separate from the integration/E2E environment issue.

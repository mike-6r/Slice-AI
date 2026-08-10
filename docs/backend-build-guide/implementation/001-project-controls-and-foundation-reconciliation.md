# 001 — Project controls and foundation reconciliation

## 1. Document metadata

| Field                        | Value                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Phase                        | 1 — safe API foundation                                                       |
| Status                       | COMPLETE (implemented and verified 2026-08-05)                                |
| Risk                         | High: every later HTTP contract inherits this behavior                        |
| Prerequisites                | None                                                                          |
| Required completed documents | None                                                                          |
| Blocked by                   | Nothing; Docker is not required for this document                             |
| Frontend routes              | All routes indirectly; no route is migrated here                              |
| Frontend components          | `src/components/layout/AppShell.tsx`, `MainNavigation.tsx`; no visual changes |
| Backend modules              | bootstrap, config, common HTTP, health, contracts                             |
| Scope                        | Medium                                                                        |
| Parallel with frontend work  | Yes only if frontend files are untouched                                      |

## 2. Project-specific context

The React application currently runs independently of the Nest API and reads mock data from `src/mocks/` through `src/repositories/market-repository.ts` and `src/providers/AppServicesProvider.tsx`. Before identity, catalogue, or trading endpoints can be trusted, Slice needs one canonical request ID, error envelope, configuration policy, logging/redaction policy, CORS policy, payload limit, and liveness behavior. Later documents 002–018 depend on these contracts. This document does not replace frontend mocks or claim the backend is feature complete.

## 3. Current implementation audit

- `server/src/main.ts` already creates Nest, enables Helmet, CORS, the request-ID middleware and the global exception filter. Preserve the bootstrap shape but remove duplicated or contradictory behavior.
- `server/src/config/app-config.ts` validates host, port and origins; database/Redis values are optional. Preserve existing validated values and make rules explicit.
- `server/src/common/http/request-id.middleware.ts` currently accepts any inbound value. Replace that trust with validation and generation.
- `server/src/common/http/global-http-exception.filter.ts` returns a nested `error` object plus request metadata. `server/src/contracts/api-contracts.ts` describes a legacy top-level shape. Choose the nested envelope below and update contract tests; do not maintain two shapes.
- `server/src/health/` exposes health and includes environment. Liveness must not disclose environment, secrets, dependency URLs, or stack details.
- `server/test/health.e2e-spec.ts` covers only the current health path. Missing cases include 404, validation, request-ID propagation, CORS and payload limits.
- Structured application logging and secret redaction are not complete. Do not log raw bodies, tokens, cookies or passwords.

## 4. Files to read

Read `package.json`, `server/package.json`, `server/src/main.ts`, `server/src/app.module.ts`, `server/src/config/app-config.ts`, `server/src/config/app-config.spec.ts`, `server/src/config/config.module.ts`, `server/src/common/http/request-id.middleware.ts`, `server/src/common/http/global-http-exception.filter.ts`, `server/src/contracts/api-contracts.ts`, `server/src/contracts/api-contracts.spec.ts`, `server/src/health/health.controller.ts`, `server/src/health/health.service.ts`, `server/test/health.e2e-spec.ts`, `src/routes/__root.tsx`, `src/components/layout/AppShell.tsx`, and every guide control file in `docs/backend-build-guide/`.

## 5. Strict scope

- Establish the canonical response/error/request-ID conventions and encode them in types and tests.
- Validate environment configuration at startup with actionable errors and no secret values.
- Allow only configured exact CORS origins; reject wildcard-with-credentials and trim/deduplicate input.
- Add structured request completion/error logs with duration and request ID.
- Enforce JSON/urlencoded body size from `HTTP_BODY_LIMIT`, default `1mb`, range `16kb`–`2mb`.
- Keep `GET /health` a dependency-free liveness endpoint returning `{status:"ok", service:"slice-api", version, timestamp}`.
- Return the same safe error envelope for unmatched routes and application errors.
- Add unit and HTTP E2E coverage for all rules.

## 6. Out of scope

No PostgreSQL/Redis connection, migrations, auth, catalogue, financial behavior, frontend adapter, UI redesign, provider integration, production-readiness claim, or new business endpoint. Do not expose mock financial operations.

## 7. Dependencies and preconditions

Use Node and the existing Nest/Express stack. Required variables: `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGINS`; optional `SERVICE_VERSION`, `HTTP_BODY_LIMIT`, `TRUST_PROXY`. If a variable is invalid, startup must fail before listening. Do not add a logger vendor or infrastructure substitute. Record command/tooling blockers rather than weakening verification.

## 8. Database specification

Database work: none. Do not modify `server/prisma/schema.prisma` or create a migration.

## 9. Domain types and ports

- `RequestId`: lower-case UUID v4 string; generate with `crypto.randomUUID()`.
- `ApiErrorEnvelope`: `{ error: { code: string; message: string; fieldErrors?: Record<string,string[]> }, requestId: string, path: string, timestamp: string }`.
- `ApiSuccessMeta`: optional `{requestId}` only where an endpoint contract asks for it; do not wrap every success response in this document.
- Add a minimal `AppLogger` abstraction only if necessary for testable structured logs: `info(event, fields)`, `warn`, `error`; never accept unstructured request objects.

## 10. Domain rules and invariants

- Accept `x-request-id` only if it is exactly one UUID v4 value; otherwise generate a new one. Always echo the accepted/generated value.
- Error codes are stable `UPPER_SNAKE_CASE`; messages are safe and non-enumerating; stack/cause is never returned.
- Validation errors use `VALIDATION_FAILED` and field paths without values.
- Unknown routes use `NOT_FOUND`; malformed JSON uses `INVALID_JSON`; oversized bodies use `PAYLOAD_TOO_LARGE`; unexpected failures use `INTERNAL_ERROR`.
- CORS credentials may be enabled only for explicit origins. `Origin: null` and unlisted origins receive no allow-origin header.
- Logs include `event`, `level`, `timestamp`, `service`, `environment`, `requestId`, `method`, normalized `route`/`path`, `statusCode`, `durationMs`; error logs may add error class/code and stack outside production.
- Redact recursively, case-insensitively: `authorization`, `cookie`, `set-cookie`, `password`, `passwordHash`, `token`, `tokenHash`, `refreshToken`, `accessToken`, `secret`, `apiKey`, `clientSecret`, payment/card/bank fields.

## 11. Application services

No business use case is introduced. Bootstrap configuration loads once, request middleware validates/generates the ID, the completion interceptor/middleware records one structured completion log, and the exception filter maps known Nest/domain/validation errors to the canonical envelope. Logging failure must never fail the request.

## 12. API specification

`GET /health` is public, unauthenticated, not audited, not idempotency-keyed, and rate limited only by later global policy. Response `200`: `{status:"ok",service:"slice-api",version:string,timestamp:ISO8601}`. `HEAD /health` returns headers and no body. Unknown route returns `404` canonical error. All responses echo `x-request-id`. No pagination, event or realtime effect.

## 13. Error catalogue

| Code                 | HTTP | Public message                  | Retry            | Audit/log                |
| -------------------- | ---: | ------------------------------- | ---------------- | ------------------------ |
| `VALIDATION_FAILED`  |  400 | Request validation failed.      | After correction | warn; field paths only   |
| `INVALID_JSON`       |  400 | Request body is not valid JSON. | After correction | warn                     |
| `NOT_FOUND`          |  404 | Resource not found.             | No               | info                     |
| `PAYLOAD_TOO_LARGE`  |  413 | Request payload is too large.   | After reducing   | warn                     |
| `METHOD_NOT_ALLOWED` |  405 | Method not allowed.             | No               | info                     |
| `INTERNAL_ERROR`     |  500 | An unexpected error occurred.   | Yes              | error with private cause |

## 14. Authorization and security

No role gate is added. Helmet remains enabled. Never return configuration, environment, stack, filesystem path, SQL, authorization headers or PII. Do not enable permissive CORS. Proxy trust must be an explicit validated setting, not unconditional. Payload limits apply before controller execution.

## 15. Audit and idempotency

No durable audit or idempotency record is required because this document adds no mutation. Request completion/error logs are operational logs, not `AuditEvent` rows. Never store request bodies in them.

## 16. Events, realtime and jobs

None. Do not introduce an outbox, queue, WebSocket or background job here.

## 17. Frontend alignment

All future HTTP adapters in `src/data/repositories.ts` and `src/queries/hooks.ts` must be able to parse the canonical error envelope and correlate `x-request-id`. This document modifies no frontend file and must preserve all current mock behavior, loading states and routes.

## 18. Implementation file plan

Modify `server/src/main.ts`, config files, common HTTP files, contracts and their tests, and health E2E tests. Create narrowly named logger/interceptor files under `server/src/common/` only if needed. Preserve identity domain files and `server/prisma/schema.prisma`. Avoid `src/**`.

## 19. Numbered implementation process

1. Re-run the source and guide audit and record the pre-change baseline.
2. Make `api-contracts.ts` the single error-envelope definition and update its tests.
3. Define UUID-v4 request-ID validation and propagation tests.
4. Reconcile exception mappings, validation field extraction, 404 and malformed-body behavior.
5. Extend configuration validation for origins, body limit, service version and proxy trust.
6. Apply limits/CORS/Helmet in bootstrap in deterministic order.
7. Add structured completion/error logging with redaction and deterministic test injection.
8. Remove environment disclosure from health and add HEAD behavior if Nest does not provide it safely.
9. Add E2E cases and run the verification commands.
10. Update guide state only for requirements actually verified; do not mark 001 complete with failures.

## 20. Test plan

- Unit: valid/malformed/multiple request IDs; origin parsing; body-limit parsing; redaction at nested keys; every error mapping; production stack suppression.
- HTTP E2E: health GET/HEAD, request-ID generation/echo/propagation, invalid ID replacement, 404 envelope, malformed JSON, oversized JSON, allowed origin preflight, denied origin, supported methods and one 500 test controller available only in test setup.
- Contract: compile and snapshot representative error envelopes without brittle timestamps.
- No DB/Redis/provider/browser tests are required. A frontend build is a regression check only.

## 21. Manual QA

Start the API with a valid local env, call `/health` with and without a UUID request ID, call an unknown route, submit malformed and oversized JSON to a test-capable endpoint, and issue allowed/denied preflights. Confirm status/body/header, one redacted structured log, no DB effect, no audit row and no frontend change. Stop the server cleanly.

## 22. Verification commands

From `server/`: `npm ci`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`. From repository root: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`. Use PowerShell `Invoke-WebRequest http://127.0.0.1:3000/health -Headers @{'x-request-id'='valid-uuid-here'}` only after starting the API.

## 23. Documentation and state updates

Update `CURRENT_STATE.md`, `project-state.json`, `MASTER_CHECKLIST.md`, `PROMPT_INDEX.md`, `IMPLEMENTATION_ORDER.md`, `API_BLUEPRINT.md`, `VERIFICATION_BASELINE.md`, and this document with actual results. Do not alter later status or claim runtime dependencies are verified.

## 24. Completion checklist

- [x] One error envelope is used by contracts, filter and E2E tests.
- [x] UUID-v4 request IDs are validated, generated and echoed.
- [x] CORS accepts only configured exact origins.
- [x] Body limits produce `PAYLOAD_TOO_LARGE`.
- [x] 404/malformed/validation/500 responses expose no internals.
- [x] Structured logs contain required fields and redact all listed keys.
- [x] Health discloses no environment or dependency secret.
- [x] Unit, E2E, lint and build results are recorded exactly.
- [x] No Prisma, identity, frontend or financial feature was implemented.

## 24A. Implementation evidence (2026-08-05)

- Added the canonical request-ID, error-mapping, validation-field extraction, explicit CORS/body-limit/proxy configuration, Helmet/bootstrap and safe `/health` behavior in backend source only.
- Added redacted structured completion/error logging and deterministic unit coverage for logging, redaction, configuration, request IDs, error mappings and contract shape.
- Server verification passed: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (41 tests), `npm run test:e2e` (6 tests), and `npm run build`.
- Root verification passed for `npm ci`, `npm run typecheck` and `npm run build`; root `npm run lint` remains blocked only by the pre-existing identity-test formatting error and existing frontend warnings. Manual local QA passed for health, unknown-route, malformed/oversized-body, CORS and safe logging behavior.

## 25. Final report format

Report: (1) assigned document, (2) checklist outcome, (3) files created, (4) files modified, (5) migrations, (6) models, (7) endpoints, (8) services, (9) repository adapters, (10) events/jobs, (11) tests/results, (12) manual QA, (13) documentation updates, (14) frontend changes, (15) limitations, (16) blockers, (17) next document (`002`).

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

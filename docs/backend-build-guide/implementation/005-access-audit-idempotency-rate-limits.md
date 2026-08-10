# 005 — Access, audit, idempotency and rate limits

## 1. Document metadata

Phase 2; **COMPLETE**; critical risk; requires 001–004. Supports protected mutations/admin operations across all routes. Affects policy/guards, account administration, audit, idempotency and Redis throttling. Verified against real local PostgreSQL and Redis on 2026-08-06.

## 2. Project-specific context

The verified implementation preserves the existing persisted role vocabulary (`USER`, `SUPPORT`, `COMPLIANCE_ANALYST`, `ASSET_REVIEWER`, `VAULT_OPERATOR`, `FINANCE_OPERATOR`, `ADMIN`) rather than introducing duplicate roles. `ADMIN` is the current platform-administration role; active assignments are explicitly scoped as `GLOBAL/*`. Permission guards, transactional status/role administration, redacted audit reads, reusable durable idempotency, and Redis-backed privileged-route limits now exist. All later submission, ownership, trading, community and wallet mutations rely on this control plane.

## 3. Current implementation audit

Preserve `identity/domain/policy.ts`, account transition logic, repository adapters and 001 envelope. Reconcile role/status vocabulary with Prisma; do not add a second authorization system. `express-rate-limit` is installed but memory-only limits are unsafe across replicas. Redis store exists from 002. Missing role matrix, scoped grants, admin routes, audit catalogue/query, idempotency orchestration, Redis keys and tests.

## 4. Files to read

Read all identity domain/ports/persistence/auth files, config/common HTTP, Redis store, Prisma schema, test doubles, `src/domain/user.ts`, every frontend validation/repository mutation, documents 001–004, business/API/entity/workflow/state guides.

## 5. Strict scope

Implement role/status/scoped-permission guards; account-status and role admin services/routes; immutable audit writer/query; idempotency middleware/service for named mutations; Redis distributed rate limiter with route policies; tests for permission, transition, replay, conflict, races and outage behavior.

## 6. Out of scope

No business admin UI, KYC provider, catalogue/ledger/order implementation, WebSocket, generic workflow engine, super-admin bypass, UI redesign or silent fail-open on financial/security mutations.

## 7. Dependencies and preconditions

Require 002 Redis/Postgres and 003–004 actor/session. Bootstrap the first `ADMIN` role through an explicit one-time CLI with operator identity and audit; never seed a default password. Required config: idempotency TTL/max body hash size, rate-limit policies and trusted proxy setting. If Redis is down, public reads may use documented local emergency limits; auth/admin/financial mutations fail closed with 503.

## 8. Database specification

Use `RoleAssignment`, `AccountStatusHistory`, `AuditEvent`, `IdempotencyRecord`. Ensure active scoped grant uniqueness, append-only audit/history, idempotency unique `(actorScope,operation,key)`, fingerprint/status/response-safe-json/resource IDs/expiry timestamps. Add forward migration `access_control_constraints` only for missing indexes/partial uniqueness. No hard delete; retention: audit minimum seven years for financial/security actions pending legal approval, nonfinancial configurable; idempotency purge after expiry.

## 9. Domain types and ports

Roles: `USER`, `SUPPORT`, `COMPLIANCE_ANALYST`, `ASSET_REVIEWER`, `VAULT_OPERATOR`, `FINANCE_OPERATOR`, `ADMIN`. `ADMIN` is the platform administrator for this schema; current scope is explicitly `GLOBAL/*` and resource scopes are not prematurely enabled. Permissions are named actions, not role checks in controllers. `AuthorizationService.authorize(actor,permission,resource?)`; account/role administration services; redacted audit query service; the existing `IdempotencyCoordinator`; and `ControlRateLimitService` reuse repositories from 003, Redis clock and unit of work.

## 10. Domain rules and invariants

Role matrix: `USER` self-service; `SUPPORT` privileged audit read; `ADMIN` privileged administration and audit read; `COMPLIANCE_ANALYST`, `ASSET_REVIEWER`, `VAULT_OPERATOR`, and `FINANCE_OPERATOR` are persisted future-duty roles with no unimplemented-route privilege. ACTIVE permits normal actions; PENDING_VERIFICATION limited self/auth; SUSPENDED read/self-support only; CLOSED no login/mutations. Every transition must be allowed by the existing transition table, reasoned and atomically historied/audited. No self-grant, last-admin removal, or own-review. Idempotency same key+fingerprint replays; different fingerprint 409; in-progress 409/425; response secrets excluded. Rate keys are atomic and TTL-bound.

## 11. Application services

Admin transition/grant/revoke validates actor, target, separation of duties, state and last-admin invariant, then changes record+history+audit in one transaction. Audit query requires explicit permission and cursor. Idempotency hashes canonical method/path/actor/body, acquires record, executes mutation in transaction-aware boundary, completes safe response or marks retryable failure. Rate service uses atomic Redis script and returns remaining/reset/retry-after.

## 12. API specification

- `POST /v1/admin/users/:id/status` `ADMIN`; `{toStatus,reasonCode}`; 201; idempotency required; strict rate; audit.
- `POST /v1/admin/users/:id/roles` `ADMIN`; `{role,scopeType?,scopeId?}` restricted to `GLOBAL/*`; 201; idempotency/audit.
- `DELETE /v1/admin/users/:id/roles/:assignmentId` `ADMIN`; 204; idempotency/audit.
- `GET /v1/admin/audit-events?cursor&limit&action&actorId&subjectType&subjectId&from&to` `ADMIN`/`SUPPORT` audit-read permission; cursor page, max 100; no raw metadata secrets.
- `GET /v1/admin/users/:id/status-history?cursor&limit` privileged; cursor page.
  All errors use 001; no frontend consumer yet. Rate response headers: standard `RateLimit-*` and `Retry-After` on 429.

Post-completion security remediation (2026-08-06): high-impact status/role operations require a server-resolved recent authentication time; `RESTRICTED` revokes active sessions and blocks mutations/refresh while only explicitly guarded self-read/session/logout routes accept a restricted-revoked bearer. Effective authorization reads only `GLOBAL/*` roles. PostgreSQL transaction advisory locking serializes active-global-admin removal and one-time bootstrap. Audit metadata is action-allowlisted and recursively screened before persistence; denied privileged attempts are durable-audited. Audit cursors encode timestamp plus ID. Normal refresh rotation is `ROTATED`; confirmed reuse is `REFRESH_REPLAY`.

## 13. Error catalogue

`FORBIDDEN` 403; `ACCOUNT_RESTRICTED` 403; `INVALID_STATUS_TRANSITION` 409; `ROLE_ALREADY_ASSIGNED` 409; `ROLE_NOT_ASSIGNED` 404; `SELF_ADMIN_ACTION_FORBIDDEN` 403; `LAST_ADMIN_REQUIRED` 409; `IDEMPOTENCY_KEY_REQUIRED` 400; `IDEMPOTENCY_KEY_CONFLICT` 409; `REQUEST_IN_PROGRESS` 409; `RATE_LIMITED` 429; `CONTROL_STORE_UNAVAILABLE` 503. Safe messages reveal no target existence to unauthorized actors. All denied admin actions get security audit/log as appropriate.

## 14. Authorization and security

Deny by default; controllers declare permissions and guards evaluate actor status+roles+scope. No client-supplied role/status/actor. Audit query metadata is allowlisted. Hash IP/device identifiers. Rate by layered IP, normalized anonymous identifier, user and session; protect IPv6/proxy parsing. Admin routes require recent auth and are designed for later MFA. No bypass header outside test process.

## 15. Audit and idempotency

Audit catalogue includes auth outcomes, user/status/role changes, idempotency conflicts, denied privileged actions and all later financial/custody/compliance mutations. Required actor/subject/action/result/requestId/reason/resource/version; prohibited secrets/PII/raw bodies. Idempotency keys max 128 printable chars, actor+operation scoped, SHA-256 canonical fingerprint, 24h default, safe response only; mutation and completion share transaction when PostgreSQL-based.

## 16. Events, realtime and jobs

Return `identity.status.changed.v1` and `identity.role.changed.v1` for later outbox. No dispatch now. Define cleanup methods for expired idempotency/rate keys; scheduling belongs to 017.

## 17. Frontend alignment

All future mutations from repository interfaces must send `Idempotency-Key`; auth state handles 401 vs 403 vs 429. No frontend file is modified. Existing route-local local-state actions remain demos until owning integration documents.

## 18. Implementation file plan

Create access-control guards/decorators/services/controllers, audit/idempotency application services, Redis rate limiter/scripts and tests under server identity/common modules. Modify app/config/schema only as required. Preserve frontend and later business modules.

## 19. Numbered implementation process

1. Reconcile role/status/permission matrix.
2. Add typed authorization decisions and guard tests.
3. Implement admin transitions/role services transactionally.
4. Implement audit writer/query projections.
5. Implement idempotency canonicalization/acquisition/replay.
6. Implement atomic Redis limiter and outage policy.
7. Add controllers and headers/errors.
8. Add PostgreSQL/Redis race and HTTP E2E tests.
9. Verify bootstrap CLI/last-admin behavior.
10. Update state.

## 20. Test plan

Unit: full role×status×permission matrix; transitions; redaction; fingerprints; limit calculations. PostgreSQL: grant/status/idempotency races, rollback, append-only audit, last-admin. Redis: atomic concurrent consumption, TTL, distinct scopes, outage fail-closed. E2E: authorized/denied/admin enumeration, all endpoints, replay/conflict/in-progress, 429 headers. No provider/browser work.

## 21. Manual QA

Bootstrap admin in disposable DB, create normal user, exercise valid/invalid status and grants, query audit/history, replay one idempotent request, reuse key with changed body, exceed limits, stop Redis and verify privileged fail-closed. Inspect DB/audit and redacted logs; remove test fixtures only.

Completed 2026-08-06: a synthetic existing user was bootstrapped exactly once as global `ADMIN` through `npm run bootstrap:admin -- <email> <operator-id>`, which created one `ADMIN_BOOTSTRAPPED` audit event. The disposable user/audit fixture was removed afterwards. Real-service HTTP verification covered an unauthorized normal-user denial, status suspension with one history/audit result, exact replay and fingerprint conflict, self-grant denial, redacted audit/history reads, control-limit 429 headers, and supported Redis disconnect/recovery returning 503 then recovering without application restart. Post-review verification added restricted-account immediate session revocation, safe-route policy, fresh/stale admin authentication behavior, non-global role denial, concurrent revoke/status/bootstrap races, durable denied-action audit, write-time metadata screening and equal-timestamp cursor paging.

## 22. Verification commands

From `server/`: Prisma validate/generate/status; `npm run lint`; `npm test`; real integration command; `npm run test:e2e`; `npm run build`. Use documented admin-bootstrap CLI only after it is added to `server/package.json`.

## 23. Documentation and state updates

Update current/project state, checklist/index/order, API/entity/business/workflow blueprints, verification baseline and this prompt. Record role matrix and every idempotent/rate-limited endpoint owner.

## 24. Completion checklist

- [x] Permission evaluation is deny-by-default and scope-aware for the implemented global scope.
- [x] All account transitions are validated, historied and audited atomically.
- [x] Self-grant and removal of last active admin are impossible.
- [x] Audit is immutable, queryable and redacted.
- [x] Same idempotency fingerprint replays; changed fingerprint conflicts.
- [x] Concurrent first requests execute once through the existing composite coordinator and database uniqueness.
- [x] Redis limits are atomic with correct headers/TTL/outage policy.
- [x] Unauthorized queries do not enumerate users/events.
- [x] Real DB/Redis/E2E/race tests pass: 58 unit, 30 integration and 23 HTTP E2E tests.
- [x] No later feature or frontend code was implemented.

## 25. Final report format

Report the standard 17 items and next document `006`.

## 26. Stop condition

Completed 2026-08-06. Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

Next approved document: `006-shared-api-contracts-and-catalogue.md` (not started in this run).

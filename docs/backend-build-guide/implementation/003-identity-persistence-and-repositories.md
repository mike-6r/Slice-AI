# 003 — Identity persistence and repositories

## 1. Document metadata

| Field                  | Value                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Phase                  | 2 — durable identity foundation                                                                                   |
| Status                 | COMPLETE: durable Prisma adapters, transaction unit of work and real PostgreSQL verification completed 2026-08-06 |
| Risk                   | High                                                                                                              |
| Prerequisites          | 001–002 complete and verified                                                                                     |
| Blocked by             | None                                                                                                              |
| Frontend routes        | `/login`, `/signup`; API work remains in 004                                                                      |
| Frontend components    | auth forms; no changes here                                                                                       |
| Backend modules        | identity domain/persistence, Prisma mapping, database transactions                                                |
| Scope                  | Large                                                                                                             |
| Parallel with frontend | Yes if contracts are not changed concurrently                                                                     |

## 2. Project-specific context

`src/routes/login.tsx` and `signup.tsx` simulate identity locally. The server has account-status, role, policy, session, audit and idempotency domain files plus identity DTO schemas, Argon2, typed repository ports, durable Prisma adapters and a transaction unit of work. Document 004 must consume these ports rather than query Prisma directly; 005 reuses role/status/audit/idempotency persistence.

## 3. Current implementation audit

- Preserve `server/src/modules/identity/domain/*`, `dto/identity.schemas.ts`, password security and tests unless a proven type mismatch requires a narrow change.
- `ports/repositories.ts` provides typed contracts, repository injection tokens and a shared transaction context; no Prisma row type is part of the public repository surface.
- `server/test/doubles/identity.doubles.ts` is appropriate for domain/application unit tests, not persistence proof.
- Prisma models, explicit mapper boundaries, repository adapters, a persistence module and real PostgreSQL integration tests are in place.
- Normalized-email uniqueness, refresh-token hash uniqueness, transaction rollback, active-role uniqueness, session rotation/revocation and idempotency completion are proven against PostgreSQL.
- Do not build controllers, JWT issuance, cookies or login flows here.

## 4. Files to read

Read all `server/src/modules/identity/**`, `server/test/doubles/identity.doubles.ts`, `server/prisma/schema.prisma`, `server/src/database/**`, `server/src/app.module.ts`, all server tests, `src/domain/user.ts`, `src/validation/schemas.ts`, `src/routes/login.tsx`, `src/routes/signup.tsx`, `src/data/repositories.ts`, documents 001–002, `ENTITY_DATABASE_BLUEPRINT.md`, `BUSINESS_RULES_AND_INVARIANTS.md`, `API_BLUEPRINT.md`, and state/control files.

## 5. Strict scope

- Finalize typed identity IDs/entities/value objects and repository contracts.
- Implement Prisma mappers/adapters for users, profiles, sessions, status history, roles, audit and idempotency.
- Support transaction-scoped repositories through one `IdentityUnitOfWork`.
- Translate Prisma not-found/unique/FK/serialization errors into domain repository errors.
- Add real PostgreSQL integration tests including concurrency and rollback.
- Wire an `IdentityPersistenceModule` exporting ports/tokens; no HTTP endpoints.

## 6. Out of scope

No signup/login/refresh/logout controller, JWT/cookie transport, admin route, rate limit, catalogue, financial records, provider, UI change or mock removal. Do not hash passwords/tokens inside repositories; application/security services own that.

## 7. Dependencies and preconditions

Require 001 canonical errors, 002 Prisma lifecycle/migration/test DB, existing Argon2/domain types, and a disposable PostgreSQL integration database. If the migration does not match the schema, stop for a reviewed migration correction; never use `db push` to hide drift. Transactions must use Prisma transaction clients, not nested independent clients.

## 8. Database specification

Use existing models and make their contract explicit:

| Model                  | Required fields and rules                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                 | UUID `id`; `email` display value; private unique indexed `normalizedEmail`; private `passwordHash`; `status` default `PENDING_VERIFICATION`; nullable `emailVerifiedAt`; `createdAt`,`updatedAt`; no hard delete from product flows. Email/password hash mutable only through dedicated operations. |
| `UserProfile`          | UUID `id`; unique FK `userId` with cascade only if an approved administrative erasure deletes user; nullable `displayName`,`avatarUrl`,`bio`,`countryCode`; timestamps. Public fields returned only by later DTO policy.                                                                            |
| `Session`              | UUID `id`; FK `userId` cascade; unique private SHA-256 `refreshTokenHash`; indexed `familyId`,`userId`,`expiresAt`; nullable `revokedAt`,`replacedBySessionId`,`lastUsedAt`; `createdAt`; immutable family/user/hash after insert.                                                                  |
| `AccountStatusHistory` | UUID; FK user restrict/cascade per approved erasure; `fromStatus`,`toStatus`,`reasonCode`, nullable private `note`, nullable actor user, `createdAt`; append-only and indexed `(userId,createdAt)`.                                                                                                 |
| `RoleAssignment`       | UUID; FK user; enum role; nullable scope type/id; actor; `createdAt`,`revokedAt`; uniqueness prevents two active equivalent assignments (use partial unique SQL if Prisma cannot express it).                                                                                                       |
| `AuditEvent`           | UUID; action, actor type/id, subject type/id, result, requestId, IP/user-agent hashes where approved, JSON metadata, createdAt; append-only; indexes on action, subject and time. No secrets/credentials.                                                                                           |
| `IdempotencyRecord`    | UUID; actor/scope/key unique; request fingerprint; state `IN_PROGRESS                                                                                                                                                                                                                               | COMPLETED | FAILED_RETRYABLE`; response status/body-safe-json; resource refs; expiry/created/updated; private. |

Enums must use the values already defined in identity domain and schema; reconcile names in one mapper, do not add semantic duplicates. FKs must reject orphan records. Audit/status history are append-only. Review SQL for the active-role constraint. This document changes the initial migration only if 002 has not been completed; otherwise add a forward migration named `identity_repository_constraints`. No seed identities are required; integration fixtures create isolated rows.

## 9. Domain types and ports

Use branded `UserId`, `SessionId`, `SessionFamilyId`, `AuditEventId`, `IdempotencyRecordId`; normalized email is a validated value object. Required ports:

- `UserRepository`: `create(input, tx?)`; `findById`; `findByNormalizedEmail`; `existsByNormalizedEmail`; `updatePasswordHash`; `markEmailVerified`; `updateStatus`; `updateProfile`; `getProfile`; all reads return domain values or `null`, never Prisma rows.
- `SessionRepository`: `create`; `findById`; `findActiveByTokenHash`; `listActiveByUser`; `touchLastUsed`; `rotate(oldId,newSession)`; `revoke`; `revokeFamily`; `revokeAllForUser`; `deleteExpiredBefore` for later jobs. `find...ForUpdate` or transaction+lock helper is required for refresh races.
- `RoleAssignmentRepository`: `listActiveForUser`; `grant`; `revoke`; `hasActiveAssignment`.
- `AccountStatusHistoryRepository`: `append`; `listForUser` with cursor.
- `AuditEventRepository`: `append`; internal/admin paginated query reserved for 005.
- `IdempotencyRepository`: `begin(scope,key,fingerprint,expiresAt)` atomically; `get`; `complete`; `markRetryableFailure`; `deleteExpiredBefore`.
- `IdentityUnitOfWork.run<T>(fn: (repos, txContext)=>Promise<T>): Promise<T>`.

Mappers implement `toDomain`/`toPersistence` and reject unknown enum/corrupt required data. Repository results use `RepositoryConflict`, `RepositoryNotFound`, `RepositorySerializationFailure` rather than leaking Prisma errors.

## 10. Domain rules and invariants

- Email comparison uses trimmed Unicode-normalized lowercase form; original display email may be retained. Two concurrent creates of one normalized email yield one success and one typed conflict.
- Password and refresh hashes never leave persistence/application-private types and never appear in logs/DTOs.
- Active session means not revoked and `expiresAt > clock.now`; repositories must not reinterpret account policy.
- Rotation of an active token is atomic: lock/read old, create replacement in same family, mark old revoked/replaced; rollback leaves neither half applied.
- Revoking a family/user is monotonic and idempotent; timestamps are never cleared.
- Status history append and user status update happen in the same transaction.
- Role grant/revoke is idempotent and cannot create duplicate active assignment.
- Audit/status records are never updated/deleted through repository APIs.
- Idempotency begin is first-writer-wins for `(actor,scope,key)`; same fingerprint replays, different fingerprint conflicts; completion cannot be overwritten.

## 11. Application services

This document adds persistence orchestration, not auth use cases. `IdentityUnitOfWork` supplies all adapters bound to one Prisma transaction. Optional narrow helpers may implement `persistStatusTransition(user, transition, actor)` and `rotateSessionPersistence(old,new)` solely to guarantee transaction boundaries. Inputs are already validated/domain typed; no authorization. Results are domain objects; retry serialization/deadlock at most twice with jitter only for explicitly safe closures, otherwise surface retryable conflict.

## 12. API specification

No endpoint is added. 004 owns `/auth/*`, `/session`, `/me` and profile APIs; 005 owns admin role/status/audit/idempotency/rate-limit APIs. Repository methods must support those documented contracts without exposing persistence fields.

## 13. Error catalogue

`IDENTITY_EMAIL_CONFLICT` (mapped later to 409), `IDENTITY_NOT_FOUND` (404 later), `SESSION_TOKEN_CONFLICT` (409/private), `SESSION_NOT_FOUND`, `ROLE_ASSIGNMENT_CONFLICT`, `IDEMPOTENCY_KEY_CONFLICT`, `PERSISTENCE_CONFLICT` (409 retryable when serialization), `PERSISTENCE_UNAVAILABLE` (503 retryable), `CORRUPT_PERSISTED_IDENTITY` (500, operator alert). Public messages are defined in 004/005; logs may include model/constraint name but no values/hash/PII. Audit only occurs when a higher-level use case requests it.

## 14. Authorization and security

Adapters do not authorize; they require actor-aware application services later. Prevent mass assignment by explicit mapper fields. Normalize email consistently. Never select hashes when a public projection is sufficient. Redact Prisma query/error parameters. No raw SQL interpolation; locking SQL must use parameterized Prisma tagged templates. Erasure/retention remains a later approved operation.

## 15. Audit and idempotency

Audit append accepts explicit allowlisted metadata and shares the caller transaction. Idempotency records store only safe response subsets, never access/refresh tokens, password hashes, cookies or raw request bodies. Default expiry is supplied by caller; repository requires future expiry and supports atomic acquisition/replay/conflict. Tests prove rollback removes audit/idempotency updates made in the failed transaction.

## 16. Events, realtime and jobs

No outbox/realtime/job implementation. Session/idempotency cleanup methods are provided for 017 but not scheduled. Do not publish events directly from repositories.

## 17. Frontend alignment

`src/routes/login.tsx`, `signup.tsx`, `src/domain/user.ts`, validation schemas and `UserRepository` shape inform future DTOs. This document modifies no frontend file, repository, hook or mock and causes no loading/error/UI change.

## 18. Implementation file plan

Create `server/src/modules/identity/persistence/{mappers,repositories}/`, injection tokens, persistence module and PostgreSQL integration specs. Modify repository ports/domain types/schema only when the audit proves a required gap. Preserve Argon2/password files, test doubles and frontend. Avoid controllers/services owned by 004/005.

## 19. Numbered implementation process

1. Compare domain enums/types, repository ports and Prisma schema field by field.
2. Resolve naming/nullability contradictions in domain/mapper boundaries without duplicate types.
3. Define injection tokens, transaction context and typed repository errors.
4. Implement pure mappers and exhaustive enum conversion tests.
5. Implement user/profile repositories with explicit selects and conflict translation.
6. Implement session repository, locking/rotation/revocation operations.
7. Implement role/status history adapters and active-assignment constraint.
8. Implement append-only audit and atomic idempotency adapters.
9. Implement unit of work and prove cross-repository rollback.
10. Wire persistence module without controllers.
11. Add PostgreSQL integration/concurrency tests and run all verification.
12. Update guide state only after all real persistence checks pass.

## 20. Test plan

- Unit mapper tests: every enum, nullable field, timestamps, branded IDs, corrupt row rejection, no private-to-public leakage.
- PostgreSQL integration: user/profile CRUD; normalized-email race; session hash uniqueness; active/expired/revoked queries; atomic rotation rollback; concurrent refresh lock; family/all revocation; role grant race/revoke; status+history atomicity; append-only audit; idempotency same/different fingerprint and completion race.
- Transaction: forced error rolls back user+profile, status+history, rotation and audit; serialization maps safely.
- Contract/HTTP/browser/provider tests: none here.
- Tests must use the real test DB and clean only namespaced fixtures.

## 21. Manual QA

Apply migrations to disposable test DB, run a repository harness to create user/profile/session/role, read them through domain adapters, rotate and revoke session, transition status with history and append audit. Inspect tables for normalized/hashed private fields, relationships and timestamps; provoke duplicate email and confirm typed conflict. Confirm no API route/front-end behavior changed, then delete only test fixtures.

## 22. Verification commands

From `server/`: `npx prisma validate`, `npx prisma generate`, `npx prisma migrate status`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`. Run the integration spec command explicitly added by this document (for example `npm run test:integration`) only after adding it to `server/package.json`; otherwise use `npx jest --runInBand --testPathPatterns=identity.*integration` against `TEST_DATABASE_URL`.

## 23. Documentation and state updates

Update `CURRENT_STATE.md`, `project-state.json`, `MASTER_CHECKLIST.md`, `PROMPT_INDEX.md`, `IMPLEMENTATION_ORDER.md`, `ENTITY_DATABASE_BLUEPRINT.md`, `BUSINESS_RULES_AND_INVARIANTS.md`, `VERIFICATION_BASELINE.md`, and this document. `API_BLUEPRINT.md` changes only if a persistence constraint forces a documented contract decision; no endpoint is marked implemented.

## 24. Completion checklist

- [x] All repository ports are typed and implemented by Prisma adapters.
- [x] Prisma records never escape mapper boundaries.
- [x] Duplicate normalized email has deterministic typed conflict behavior under race.
- [x] Session rotation/revocation is atomic and replay-safe at persistence level.
- [x] Active role assignment uniqueness is enforced by PostgreSQL.
- [x] Status update/history and caller audit can share one transaction.
- [x] Idempotency acquisition/completion conflicts are atomic.
- [x] Append-only records have no mutation/delete API.
- [x] Rollback/concurrency tests use real PostgreSQL and pass.
- [x] No token/hash/PII is logged or returned.
- [x] No auth endpoint or frontend change was introduced.

## 24A. Implementation evidence (2026-08-06)

- Finalized typed identity ports, mapper validation and repository errors. Added Prisma user/profile, session, role, status-history, audit and idempotency adapters plus one transaction-scoped `IdentityUnitOfWork` and exported injection tokens. No controllers, guards, token issuance or frontend code was added.
- Added forward-only `0002_identity_repository_constraints`: unique session token hashes, a session replacement reference, revocable role assignments with a PostgreSQL active-role partial unique index, and scoped idempotency storage constraints. It applied cleanly to local `slice` and disposable `slice_test`.
- Real integration coverage passes against PostgreSQL: normalized-email conflict race, user/profile mapping, cross-repository rollback, atomic session rotation/token hash uniqueness/family revocation, active-role race/revoke/regrant and idempotency completion conflict. Overall verification passes: 53 unit tests, 7 HTTP E2E tests, 7 integration tests, typecheck, lint, Prisma validation/generation/status and production build.
- Manual QA started the API with real dependencies after module wiring; `/health` and `/ready` returned 200. PostgreSQL index inspection confirmed `Session_tokenHash_key`, `RoleAssignment_active_user_role_key` and `IdempotencyRecord_actorScope_scope_key_key`. No identity HTTP route was introduced.

## 25. Final report format

Report: assigned document; checklist; files created/modified; migrations; models/constraints; endpoints (none); services/unit-of-work; repository adapters; events/jobs (none); tests/results; manual QA; documentation updates; frontend changes (none); limitations; blockers; next document `004`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

# 004 — Authentication, sessions and profile API

## 1. Document metadata

Phase 2; status **COMPLETE**; critical risk; prerequisites 001–003 verified. Core auth/session/profile implementation, transaction-scoped durable idempotency for signup/logout-all/profile update, Redis-backed auth abuse controls, and dedicated real-service HTTP E2E coverage are verified. Supports `/login`, `/signup`, navigation session state and future `/me` profile UI. Affects identity controllers/application/security/guards.

## 2. Project-specific context

`src/routes/login.tsx` and `src/routes/signup.tsx` are local demos; `src/domain/user.ts`, `src/validation/schemas.ts`, `src/data/repositories.ts`, `src/services/app-services.ts` and `src/providers/AppServicesProvider.tsx` define expected user/session-facing boundaries. The server has Zod identity schemas, password policy/Argon2, policy/session types and repositories but no HTTP authentication. This document makes identity authoritative; 005 then adds admin/access controls and 009 migrates frontend reads.

## 3. Current implementation audit

Preserve existing domain/password work and 003 adapters. Auth HTTP E2E now exercises all eight routes using real PostgreSQL and Redis. Existing UI remains mock-backed until 009.

## 4. Files to read

Read all `server/src/modules/identity/**`, database/config/contracts/common HTTP files, Prisma schema, test doubles/E2E config, `src/routes/login.tsx`, `signup.tsx`, `__root.tsx`, `src/domain/user.ts`, `src/validation/schemas.ts`, `src/data/repositories.ts`, `src/services/app-services.ts`, `src/queries/hooks.ts`, `src/providers/AppServicesProvider.tsx`, 001–003, and API/entity/business/state guides.

## 5. Strict scope

Implement signup, login, refresh rotation, logout current session, logout all, authenticated session summary, `GET /me`, and `PATCH /me/profile`; access-token guard/current actor; secure refresh transport; token/password hashing; session-family replay defense; transactional audit; exact DTO/error/E2E contracts.

## 6. Out of scope

No email delivery/reset/MFA/social login, admin status/role endpoints (005), KYC/wallet, catalogue, frontend adapter switch, UI redesign, or production identity-provider claim.

## 7. Dependencies and preconditions

Require verified 001 envelope/IDs, 002 runtime, 003 repositories. Variables: `JWT_ACCESS_SECRET` (>=32 random bytes), `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL_SECONDS` (default 900), `REFRESH_TOKEN_TTL_SECONDS` (default 2592000), `REFRESH_COOKIE_NAME`, `COOKIE_SECURE`, `COOKIE_DOMAIN` optional, and `TRUST_PROXY_HOPS` (0–10, default 0). Production rejects `COOKIE_SECURE=false`; the retired broad `TRUST_PROXY` setting is rejected. Decide same-site deployment: default HttpOnly Secure SameSite=Lax cookie; if cross-site is required, SameSite=None plus explicit CSRF token/origin validation. Stop if deployment topology cannot determine safe cookie/CSRF rules.

## 8. Database specification

Use 003 `User`, `UserProfile`, `Session`, status history and audit. No new model expected. If refresh token needs `usedAt`/`compromisedAt`, add reviewed forward migration `auth_session_replay_state`; do not overload `lastUsedAt`. Token hashes are private SHA-256 of 256-bit random opaque tokens; access JWTs are not stored. Retain expired/revoked sessions for security review per approved retention (default 90 days) and purge only through later job.

## 9. Domain types and ports

Define `AuthenticatedActor {userId,sessionId,roles,status}`, `AccessTokenClaims {sub,sid,iss,aud,iat,exp,jti}`, `AuthTokens` with access token returned and refresh token transport-private, and use cases `Signup`, `Login`, `RefreshSession`, `Logout`, `LogoutAll`, `GetSession`, `GetMe`, `UpdateProfile`. Ports: existing repositories/unit-of-work, `PasswordHasher`, `OpaqueTokenGenerator`, `RefreshTokenHasher`, `AccessTokenSigner/Verifier`, `Clock`, `AuditWriter`. Never expose token hash.

## 10. Domain rules and invariants

- Signup normalizes email, validates password, creates user/profile/session/audit atomically; duplicate always maps to `EMAIL_ALREADY_REGISTERED` without exposing registration through other endpoints.
- Login response timing/message does not distinguish missing email/wrong password; only ACTIVE/PENDING_VERIFICATION may log in per policy, while SUSPENDED/CLOSED are denied.
- Access tokens live <=15 minutes and bind user+session; guard rechecks session active and account status for sensitive/mutating calls.
- Refresh tokens rotate once. Reuse of a revoked/replaced token revokes the entire family, emits security audit, clears cookie and returns unauthorized.
- Logout is idempotent; logout-all revokes all active sessions including current.
- Profile patch uses allowlisted fields; omitted differs from explicit null; email/password/status/roles cannot be mass assigned.

## 11. Application services

For each use case validate DTO, load actor/user, enforce status, perform repository work and audit inside one unit of work. Signup/login create session and sign access token after commit; if signing fails, revoke the new session or roll back before response. Refresh locks token session, detects expiry/replay, atomically rotates, then signs. Logout/revoke operations are retry-safe. Profile update requires self actor and records changed field names, not values. Use explicit results and typed errors.

## 12. API specification

Wire JSON camelCase and ISO timestamps:

| Method/path                | Access/input                           | Success                                                     | Idempotency/rate/audit                                           | Frontend           |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| `POST /v1/auth/signup`     | public `{email,password,displayName?}` | 201 `{user,session,accessToken,expiresIn}` + refresh cookie | key required; 5/IP+h; `AUTH_SIGNUP_SUCCEEDED`                    | `/signup`          |
| `POST /v1/auth/login`      | public `{email,password}`              | 200 same auth response                                      | no replay key; 10/IP+email/15m; success/failure audit            | `/login`           |
| `POST /v1/auth/refresh`    | refresh cookie + CSRF if applicable    | 200 new access/session + rotated cookie                     | token itself is replay control; 30/session/h; rotate/reuse audit | root auth provider |
| `POST /v1/auth/logout`     | access token, current session          | 204 + clear cookie                                          | retry-safe; audit                                                | nav                |
| `POST /v1/auth/logout-all` | access token                           | 204 + clear cookie                                          | `Idempotency-Key`; audit                                         | account security   |
| `GET /v1/session`          | access token                           | 200 `{authenticated:true,user,session}`                     | none                                                             | root loader        |
| `GET /v1/me`               | access token                           | 200 public/self user DTO                                    | none                                                             | profile/nav        |
| `PATCH /v1/me/profile`     | access token; profile patch            | 200 updated profile                                         | key required; audit changed keys                                 | profile            |

No list pagination/events. All mutations use JSON content type; cookie is `HttpOnly`, path `/v1/auth`, max-age TTL and cleared with identical attributes.

## 13. Error catalogue

`VALIDATION_FAILED` 400; `EMAIL_ALREADY_REGISTERED` 409; `INVALID_CREDENTIALS` 401 safe generic; `AUTHENTICATION_REQUIRED` 401; `ACCESS_TOKEN_EXPIRED` 401 retry via refresh; `REFRESH_TOKEN_INVALID` 401; `REFRESH_TOKEN_REUSED` 401 non-retry/security audit; `SESSION_REVOKED` 401; `ACCOUNT_RESTRICTED` 403 generic; `PROFILE_NOT_FOUND` 404; `IDEMPOTENCY_KEY_CONFLICT` 409; `RATE_LIMITED` 429; `PERSISTENCE_UNAVAILABLE` 503. The atomic limiter returns bounded remaining TTL and canonical 429 responses emit `Retry-After`. Never reveal hashes, user existence, exact restriction reason or stack.

## 14. Authorization and security

Only self may access `/me`/profile/logout. Password is never logged/returned; require existing password policy. JWT verifies algorithm/issuer/audience/expiry and rejects `none`/unexpected algorithms. Cookies follow topology decision; CSRF protects cookie-authenticated refresh. Rotate session on login/refresh; prevent fixation. A revoked access session may reach logout-all only after the guard verifies the same actor scope, operation, key, completed record and exact request fingerprint; it cannot start, conflict with, or observe an in-progress mutation. Password verification uses one configured dummy hash for unknown accounts. Limiter increment/TTL assignment is one Redis operation. Hash IP/user-agent if retained. Apply brute-force controls without permanent denial-of-service locking.

## 15. Audit and idempotency

Audit signup/login outcome, session create/rotate/revoke/reuse, logout-all and profile update. Metadata: request ID, session/family IDs, actor/subject IDs, changed field names, reason code; prohibit email/password/token/cookie/raw IP/body. Signup/profile/logout-all keys use composite actor scope, operation scope and key. Stored replays contain only safe durable data; exact signup replay mints a fresh credential in a separate post-commit session transaction and never stores or reuses the original refresh credential.

## 16. Events, realtime and jobs

Record domain events `identity.user.created.v1`, `identity.session.revoked.v1`, `identity.security.refresh_reuse.v1`, `identity.profile.updated.v1` for a future outbox only if 017 infrastructure already exists; otherwise return them from use cases without publishing and document deferred dispatch. No queue/realtime here.

## 17. Frontend alignment

Map `/login` and `/signup` fields to existing Zod schemas; future adapter provides session/me to `UserRepository`. Define loading, invalid-field, invalid-credentials, restricted-account and network states without changing visual design. This document changes no frontend code; 009 replaces mocks and adds query invalidation after profile/auth mutations.

## 18. Implementation file plan

Create identity application use cases, auth/profile controllers, auth module, JWT/token implementations, guard/decorators and unit/E2E specs under `server/src/modules/identity/`. Modify config/app module/DTO schemas narrowly. Preserve 003 adapters and frontend; avoid admin controllers.

## 19. Numbered implementation process

1. Reconcile DTO/domain/frontend fields and cookie topology.
2. Add validated auth configuration and security ports.
3. Implement token generator/hash/signer/verifier tests.
4. Implement signup/login use cases with transactional audit.
5. Implement locked refresh rotation/replay response and race tests.
6. Implement logout/current/all and session guard.
7. Implement session/me/profile use cases.
8. Add controllers/cookie/CSRF handling and canonical errors.
9. Add unit, PostgreSQL integration and HTTP E2E tests.
10. Manually verify with a real cookie jar; update state.

## 20. Test plan

Unit: normalization/password/status matrix/JWT claims/cookie attributes/profile patch and equal verification-operation counts. PostgreSQL: duplicate signup race, login persistence, refresh rotation rollback/reuse family revocation, concurrent refresh one-winner, logout-all, audit atomicity. Redis: atomic counter-plus-TTL, concurrent first increment, expiry, fail-closed outage and recovery. HTTP E2E: every endpoint success; malformed DTO; duplicate; bad credentials indistinguishable; revoked session exact logout-all replay accepted while new/conflicting keys are rejected; malformed refresh-cookie encoding; CSRF/origin; profile allowlist; rate-limit hook. Contract tests prove private fields absent. No provider/browser visual test.

## 21. Manual QA

Manual QA passed on 2026-08-06 against disposable `slice_test`: signup (201), session (200), profile update (200), login (200), refresh rotation (200), logout (204), and two-session logout-all (204). Security-remediation QA also proved first logout-all 204, exact replay from the revoked initiating access session 204, a new key from that revoked token 401 while a fresh session remained 200, malformed refresh cookie 400, atomic limiter threshold/TTL, and supported Redis disconnect/recovery 503/201. Test users and idempotency records were cleaned. Frontend remains mock-backed.

## 22. Verification commands

From `server/`: `npx prisma validate`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`; run the integration script added by 003. Use `curl.exe -c cookies.txt -b cookies.txt` for signup/login/refresh/logout manual calls; never paste real tokens into docs/logs.

## 23. Documentation and state updates

Update current state, project-state JSON, checklist, prompt index/order, API/entity/business/workflow blueprints, verification baseline and this prompt with actual results. Do not mark frontend integrated or 005 complete.

## 24. Completion checklist

- [x] Duplicate normalized email maps to `EMAIL_ALREADY_REGISTERED` under race and normalised HTTP duplicate handling.
- [x] Invalid login is non-enumerating and rate controlled. Real Redis tests cover threshold, hashed dimensions, TTL/reset, outage/recovery and canonical rate-limit responses.
- [x] JWT claims/algorithm/issuer/audience/expiry are verified.
- [x] Refresh-token replay revokes the entire family.
- [x] Refresh rotation has a single successful successor under the transaction guard; replay-family revocation is covered by real HTTP E2E.
- [x] Logout and logout-all are idempotent and audited. Durable composite replay records preserve the first revocation count and do not repeat the business mutation/audit.
- [x] Profile patch cannot change identity/security fields.
- [x] API excludes password/token hashes and unsafe internals.
- [x] Same-site cookie behavior is proven for local HTTP (`Secure=false`) and secure configuration (`Secure=true`); production rejects `COOKIE_SECURE=false`, proxy trust uses explicit bounded hops, and the deployment is same-site `SameSite=Lax`.
- [x] Transaction/audit rollback, PostgreSQL/Redis integration and all dedicated auth HTTP E2E cases pass.
- [x] A revoked logout-all access token can only perform a verified completed exact replay; new, in-progress, missing-key and fingerprint-conflicting requests are rejected before mutation.
- [x] Auth-abuse counter creation and TTL assignment are atomic; concurrent first increments have bounded TTL and 429 emits safe `Retry-After`.
- [x] Unknown-email and wrong-password login each perform one configured password verification; malformed percent-encoded refresh cookies return a safe 400.
- [x] Frontend remains unchanged.

## 25. Final report format

Report all 17 standard items, identifying models/migration changes, eight endpoint contracts, use cases, adapters, deferred events, tests/manual QA, frontend changes, limitations/blockers and next document `005`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

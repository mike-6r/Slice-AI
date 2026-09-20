# Preview runtime isolation verification

Date: 20 September 2026. Status: **PASS — deployed and runtime-verified for the application/data boundaries below.** No Drops functionality was implemented.

## Release provenance

| Environment    | Application source                                                               | Active release                                                  |
| -------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Normal staging | `main`, `e14f37de11d116a4082af5e71a0e80547ffe8908`                               | `/opt/slice/releases/e14f37d-20260920-home-dark-sections`       |
| Preview        | `codex/preview-runtime-verification`, `5abbeceb637bcce642ab8c21cf665fc6e82f8be8` | `/opt/slice-preview/releases/5abbece-20260920-preview-verified` |

Both environments' `app` and `current` symlinks resolve to their own release above. Source was cloned from GitHub and built on the VPS as `slice`; no local build, dependency tree, environment, database or Redis data was uploaded. The initial Preview release is retained for application rollback. Documentation commits after `5abbece` do not change the running application.

## Live topology

| Boundary           | Normal staging                          | Preview                                                                                         |
| ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Public application | `https://staging.slicecollectable.com/` | `https://staging.slicecollectable.com/preview/`                                                 |
| Public API         | `/api/v1/`                              | `/preview/api/v1/`                                                                              |
| API / SSR          | `127.0.0.1:3101` / `3102`               | `127.0.0.1:3201` / `3202`                                                                       |
| PostgreSQL         | Existing `slice_staging`                | New role/database `slice_preview`                                                               |
| Redis              | Existing `slice-redis`, loopback `6380` | New `slice-preview-redis`, loopback `6381`, DB 1, prefix `slice:preview:`                       |
| Secrets            | Existing protected file unchanged       | Fresh secrets in `/etc/slice/slice-preview.env`, `root:slice`, `0640`                           |
| Auth               | Existing issuer/audience/cookie         | `slice-preview-api` / `slice-preview-web`, `slice_preview_refresh`, path `/preview/api/v1/auth` |
| Units              | `slice-api`, `slice-web`                | `slice-preview-api`, `slice-preview-web`                                                        |

The Preview Redis container has its own password and data directory, a 384 MB container limit and 256 MB Redis memory limit. Internal service ports remain loopback-only. The database role has no superuser, database-creation or role-creation privileges. Its attempt to read staging's `User` table was rejected with permission denied. Staging verification connections explicitly used `default_transaction_read_only=on`.

## Runtime evidence

The disposable operator probe passed first on the initial deployment, then again on application commit `5abbece` at **19:01:54–19:01:56 UTC**.

| Test                          | Result                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running process environment   | PASS — inspected the Preview API process environment without printing secrets; database, Redis and JWT configuration match the protected Preview file and differ from staging                                               |
| Database creation             | PASS — created a disposable Preview user/profile and notification; their marker was absent from staging                                                                                                                     |
| Authenticated updates         | PASS — logged in through the public Preview API, changed the profile and marked the notification read; updates were visible only in Preview                                                                                 |
| Database deletion             | PASS — deleted only the disposable Preview user; its profile, sessions and notification were removed; the previous bearer token was subsequently rejected                                                                   |
| Staging data comparison       | PASS — counts and ordered row fingerprints for `User`, `UserProfile`, `Notification`, `Asset`, `FinancialAccount`, `OwnershipPosition` and `MoneyMovement` were unchanged before creation, after updates and after deletion |
| Redis writes                  | PASS — created, updated and deleted a uniquely named Preview key; it never appeared in staging Redis or Preview DB 0                                                                                                        |
| Access tokens                 | PASS — a real Preview login JWT was accepted in Preview and rejected by staging; a staging-signed test JWT was rejected by Preview; both public cross-environment requests returned 401                                     |
| Refresh cookies               | PASS — Preview login set a distinct Secure, HttpOnly, SameSite=Lax, host-only cookie at `/preview/api/v1/auth`; Preview rejected the staging cookie name and successfully rotated its own refresh token                     |
| Fail-closed configuration     | PASS — attempts to enable tested trading/deposit/withdrawal/worker/live-provider flags were rejected by the configuration loader                                                                                            |
| Fail-closed runtime endpoints | PASS — authenticated requests to deposits, withdrawals, order creation, order preview, submission creation and realtime returned 503 `FEATURE_DISABLED`                                                                     |
| Financial side effects        | PASS — Preview financial accounts, money movements and trading orders remained at zero                                                                                                                                      |

Combined staging comparison fingerprint SHA-256:
`df9cecb3870335a1f5f84b4eb297d45f700c81b1aef2bd0a25c640a2d96f51d1`.
No row contents, passwords, refresh tokens or access tokens were emitted in the report. Normal Preview audit evidence and expiring rate-limit counters are retained; the disposable account/profile/session/notification records and Redis sentinel were cleaned up. No existing staging record was created, edited or deleted by the probe.

## Browser and routing checks

- `/preview` returns 308 to `/preview/`; the application, health, readiness, signup-policy endpoint and stylesheet return 200. Preview responses are marked `noindex, nofollow`.
- Preview shows its visible isolated-environment banner. Home, Markets and Login navigation and first-party assets stay under `/preview/`. Apache access evidence shows market snapshot/assets/currency API reads under `/preview/api/v1/`, with 200 responses.
- Preview's catalogue is genuinely empty; it does not display staging's published assets. Staging still displays its own catalogue and restored its existing authenticated session. No staging accounts were cloned into Preview; no persistent Preview administrator was provisioned.
- Runtime review found shared browser currency keys and auth-refresh coordination names. Commit `5abbece` separates Preview Web Locks, local-storage fallback locks, BroadcastChannel names, currency storage and currency cookie/path. Existing staging keys are unchanged.
- Actual browser test: selected USD in Preview, reloaded both applications, and confirmed Preview retained USD while staging remained GBP and authenticated. Preview remained anonymous. Restored Preview's test selection to GBP afterward.
- No browser console errors were observed in the verified Preview pages.

At **19:03:08 UTC**, all four application services were active with zero restarts. Normal staging's active-enter timestamp remained **16:18:43 UTC**, unchanged throughout the Preview work; Preview's corrected release started at **19:01:49 UTC**. Both public readiness responses reported PostgreSQL and Redis up. Only Apache was gracefully reloaded to add the Preview-specific routes; normal staging units and release pointers were not changed.

## Build and regression checks

- Frontend tests: **57 files / 343 tests passed**, including deployment-specific Web Lock regression tests and persistence-key separation.
- Frontend typecheck passed. Targeted lint: zero errors, one existing Fast Refresh export warning in `CurrencyProvider.tsx`.
- VPS frontend client/SSR and backend builds passed. Initial Preview frontend/backend typechecks passed. Backend source is unchanged by the browser fix.
- Prisma validation passed; all 113 forward migrations were applied only to the initially empty Preview database. The corrected release had no pending migrations.
- Whole-repository lint remains non-green: 452 errors / 25 warnings in the existing baseline, with the disposable operator probe excluded. No broad lint or dependency upgrade was folded into this deployment. Existing dependency audit and large-bundle warnings remain.

## Boundaries and next work

This proves the tested application/data isolation, not a guarantee about every possible future feature or an adversarial security boundary. Both applications still share the hostname/browser origin, Apache, host resources, PostgreSQL server and Unix `slice` service user. Cookie paths and storage namespaces are not a substitute for a separate-origin/OS security sandbox against compromised code. Keep future Preview work trusted and release-scoped; stronger security isolation requires a separate review.

External provider credentials are absent from Preview, provider adapters are local, and risk-creating operations/workers are disabled. The existing frontend still imports Stripe.js; the verification establishes blocked backend provider/financial execution, not the absence of every third-party script request. No live payment or provider transaction was attempted.

No real money, inventory, admin account, Drops domain, draw logic or marketplace was created. The next development phase may be scoped separately to Preview. Paid randomized-money business logic remains deferred until the legal and payment-provider constraints are defined.

# Controlled cleanup plan

The cleanup must be wave-based. Each wave needs a small diff, characterization tests, a route/schema usage check, and a rollback plan.

## Wave 0 — authority and evidence gate (P1) — completed, owner decision remains

1. Static tracing confirms that approval does not create/link an `Asset`; its outbox event is notification-only. The only create/link callers are protected controllers and the demo setup script.
2. Read-only staging evidence is recorded: 12 approved submissions, 11 linked, one approved unlinked intake, and 21 Asset rows. The current default beta catalogue predicate returns two non-fixture records, so the historic zero-record screen is not current database authority.
3. Worker units/flags and route audience mapping are documented in the Wave 0 artifacts.
4. Characterization tests now cover invalid/replayed link safety, one-Asset/one-submission protection, duplicate certification blocking, and no downstream authority creation from the Asset/link operations.

**Decision gate:** The code does not state when canonicalization must occur. Model C (explicit staff canonicalization) is recommended, but **OWNER DECISION REQUIRED** before any behavior/UI/job change.

## Wave 1 — documentation/config reconciliation (P1/P2)

1. Regenerate current migration and feature status documents.
2. Reconcile `.env.example` with `app-config.ts`, especially market refresh and PriceCharting aliases.
3. Add a CI/check script that runs frontend/backend/Discord typecheck, build, lint, Prisma validation, unit tests, and explicitly gated database integration tests.
4. Document the three package roots, lockfile policy, and staging worker activation.

## Wave 2 — safe artifact and route cleanup (P2)

1. Confirm and remove or archive ignored local release bundles.
2. Compare `/staff`, `/operations/*`, and `/admin` audience/permission behavior.
3. Consolidate only proven duplicate screens; preserve deep links and authorization semantics.
4. Add route inventory tests or navigation checks before retiring a page.

## Wave 3 — decomposition and performance (P2/P3)

1. Split admin and submission orchestration into application/query modules without changing API contracts.
2. Extract shared pagination/filter/status projection helpers.
3. Review admin derived filters for bounded database execution and add representative query-plan/load tests.
4. Split frontend bundles by admin workspace and reduce initial route payload; retain API-mode authority behavior.

## Explicitly out of scope until a later approved prompt

Schema/table/migration removal, dependency removal, public API renames, financial or ownership logic changes, custody changes, production configuration, staging deployment, fixture creation, and mass formatting rewrites.

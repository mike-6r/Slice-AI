# Current Slice system state

This is the current engineering reference as of Wave 1 (`f0bd044` baseline).
It describes checked-in code and documented staging runtime, not a production
launch approval.

## Runtimes and storage

- **Web:** React 19 / TanStack Start SSR frontend. API mode is authoritative;
  mock mode is an explicit local visual-development option.
- **API:** NestJS application with Prisma/PostgreSQL and Redis. It exposes
  authenticated public, collector, staff, and admin APIs.
- **Discord:** independently deployed bot and worker sharing the Prisma schema
  only for Discord-owned community data and using Slice API contracts for Slice
  authorities.
- **Database:** PostgreSQL owns durable product, finance, ownership, lifecycle,
  provider, and outbox state. Redis is coordination/cache infrastructure.

## Active domains

`AssetSubmission` and `VerificationReview` own submission/review; `Asset` is
the canonical collectible; intake, receipt and verification are separate
authorities; `VaultCustodyRecord` owns custody; `ValuationDecision` owns staff
valuation; publication, ownership supply/positions, Initial Offering, and
trading remain separate downstream authorities. See the
[canonicalization contract](audit/CANONICALIZATION_AUTHORITY.md).

The API also contains identity/access, memberships, providers/webhooks,
notifications/outbox, finance, market research, and admin operational
projections. Canonicalization currently requires a protected explicit create
and link operation; Wave 0 records the pending owner decision.

## Background work and deployment

The Nest API can run outbox/delivery, market refresh, and portfolio snapshot
workers in-process under explicit configuration. Staging currently supervises
web, API, Discord bot, and Discord worker systemd units. The deployment model
is manual VPS immutable releases, protected environment files, Prisma forward
migrations, `current` symlink activation, and service health/readiness checks.
It is not CI/CD deployment.

`/health` is process/liveness; `/ready` is dependency/application readiness.
Neither proves that a particular Git revision has been deployed. The exact
release, rollback, access, and verification procedure is in
[STAGING_VPS_DEPLOYMENT.md](STAGING_VPS_DEPLOYMENT.md).

## Schema status

Schema inventory evolves with migrations. Do not copy historic counts into
current documentation. Use `cd server && npm run prisma:validate` and
`npm run prisma:status` for current state; audit snapshots retain their
historical counts as evidence.

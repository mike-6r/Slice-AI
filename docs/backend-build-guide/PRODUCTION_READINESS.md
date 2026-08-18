# Production readiness

## Deployment posture

Slice is **not authorised for production launch**. Provider certification and human security,
legal, operations and launch approvals remain required. `STRIPE_LIVE_ENABLED=false` is the
safe default; enabling live mode requires explicit `PROVIDER_MODE=stripe_live`, Stripe and
BlockchainAnalysis.io credentials, plus a non-placeholder encryption key.

Production configuration must be supplied from a deployment secret manager. It must set explicit
HTTPS `CORS_ORIGINS`, a non-loopback `HOST`, `COOKIE_SECURE=true`, PostgreSQL/Redis URLs and a
32-plus-character JWT secret. Startup rejects wildcard or malformed CORS origins, loopback hosts,
placeholder secrets, test databases and provider production mode without all mandatory credentials.

## Operational controls

`OPERATIONAL_TRADING_ENABLED`, `OPERATIONAL_DEPOSITS_ENABLED`,
`OPERATIONAL_WITHDRAWALS_ENABLED`, `OPERATIONAL_REALTIME_ENABLED` and
`OPERATIONAL_LISTING_ENABLED` are deployment-managed controls. They default **off** in production
and on in local/test environments. Disabled controls return safe `FEATURE_DISABLED` responses for
new-risk operations. Reads, own-order cancellation, reconciliation and inbound signed webhooks stay
available for recovery. Changing controls is an operational action requiring two-person approval,
an audit ticket and a deployment/configuration record; the application does not claim to replace an
organisation's change-control system.

## Required pre-launch gates

- All ownership, finance, trading, provider and outbox reconciliations are green.
- There are no unreviewed critical dead letters or open critical incidents.
- A PostgreSQL restore rehearsal has met the approved RPO/RTO and is recorded.
- Stripe sandbox certification and BlockchainAnalysis.io account certification are signed
  off by their respective owners before any external provider mode is enabled.
- Human security, legal, operations and product owners record an explicit launch decision.

## Local Phase 3 evidence

The backend uses Helmet security headers, strict credentialed CORS, request IDs, structured redacted
logs, liveness `/health` and dependency-aware readiness `/ready`. Redis is intentionally
non-durable; PostgreSQL outbox/delivery state is the durable worker authority. See
`BACKUP_RESTORE.md` and `OBSERVABILITY.md` for rehearsals and operating signals.

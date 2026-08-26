# Slice staging VPS deployment

This is a staging runbook, not a production-launch approval. It is designed
for the current TanStack Start SSR frontend, NestJS API, PostgreSQL, Redis,
in-process API workers, and the separately supervised Discord bot/worker.

## Current topology

- Apache owns the public HTTP(S) listener.
- The TanStack Start SSR process listens only on `127.0.0.1:3102`.
- The Nest API and its enabled outbox worker listen only on `127.0.0.1:3101`.
- PostgreSQL is local-only and uses a dedicated `slice_staging` database role.
- Redis is a Slice-specific password-protected container published only to
  `127.0.0.1:6380`, with persistent data under `/opt/slice/shared/redis`.
- Apache routes `/api/`, `/health`, and `/ready` to the API, serves compiled
  `/assets/` directly, and proxies all other routes to the SSR process.

Both Slice application services run as the unprivileged `slice` system user.
Their secrets live in `/etc/slice/slice.env` (root:slice, mode `0640`) and are
never copied into a release directory or source control.

The currently documented systemd units are `slice-api.service`,
`slice-web.service`, `slice-discord.service`, and `slice-discord-worker.service`.
Deployments are manual immutable releases; GitHub Actions verifies code only
and does not deploy or contact this host.

## Staging configuration

The temporary IP-only staging endpoint must run over HTTP and therefore uses
an explicit non-production configuration: `NODE_ENV=development` and
`COOKIE_SECURE=false`. This is acceptable only for restricted staging. Before
real-user or production use, configure a real hostname and HTTPS, then use
`NODE_ENV=production`, HTTPS-only explicit CORS origins, and
`COOKIE_SECURE=true`. The backend rejects insecure cookie/CORS combinations in
production mode.

External provider mode, trading, deposits, withdrawals and listing remain
off/fail-closed in the current staging environment. `PROVIDER_MODE=local` is
the deterministic QA path; `stripe_sandbox` and `stripe_live` are represented
but not enabled. Supplying Stripe credentials or enabling those flags is a
separate approved change and is not part of this deployment procedure.

Apache sets `nosniff`, `DENY` framing, a strict referrer policy, a restrictive
permissions policy and a CSP with explicit same-origin, font and image sources.
The CSP includes `script-src 'unsafe-inline'` solely because the current
TanStack Start SSR output emits a per-response inline hydration bootstrap.
It does not use `script-src *`; replace that exception with a nonce-aware CSP
when the frontend/runtime provides one. The staging browser check must be run
after any CSP edit because blocking that bootstrap renders server HTML but
causes client hydration to fail.

## Release procedure

1. Create a source archive from the trusted local workspace. Exclude
   `node_modules`, built output, `.env` files, local databases, test exports,
   logs and QA artifacts. Do not invent a Git remote when none exists.
2. Upload the archive over verified SSH, unpack it into a new directory below
   `/opt/slice/releases/`, and set the release ownership to `slice:slice`.
3. On the VPS, load the protected environment in the operator shell only long
   enough to provide the public origin to the release script. Do not print it
   or echo any secret values.

   ```bash
   set -a
   . /etc/slice/slice.env
   set +a
   export VITE_API_BASE_URL="$APP_PUBLIC_URL"
   /opt/slice/releases/<release>/scripts/deploy-vps-staging.sh \
     /opt/slice/releases/<release>
   ```

4. Verify service state and public health:

   ```bash
   systemctl status slice-api.service slice-web.service
   curl --fail http://127.0.0.1:3101/ready
   curl --fail http://127.0.0.1:3102/
   ```

`deploy-vps-staging.sh` uses locked dependencies, builds both applications,
runs `prisma generate`, `validate`, and `migrate deploy`, changes the `current`
symlink only after a successful build, restarts both services, and verifies
local liveness/readiness.

`/health` is a liveness check. `/ready` is the API's dependency/application
readiness signal. Neither endpoint proves that a particular Git commit is the
active release; verify the immutable release directory and `current` symlink
when confirming deployment provenance.

## Rollback

Application rollback is a symlink change plus service restart:

```bash
ln -sfn /opt/slice/releases/<previous-known-good> /opt/slice/current
systemctl restart slice-api.service slice-web.service
curl --fail http://127.0.0.1:3101/ready
```

Never roll back a Prisma migration by deleting migration history or restoring
an old database over the active staging database. If a release contains a
forward migration, use a compatible application rollback or make a separately
reviewed compensating forward migration.

## Backup and recovery

The VPS uses a systemd timer to create restricted daily PostgreSQL custom-format
dumps under `/opt/slice/shared/backups`. The retention period is 14 days. Test
a backup with `pg_restore --list`; restore drills must target a newly created,
isolated database, never `slice_staging`.

Redis is a cache/worker coordination store with persistent local data for
staging. PostgreSQL remains the authority for durable financial, ownership,
provider and outbox state. A Redis restart may delay/retry eligible worker
work; it must not be treated as a source of financial truth.

## Operational checks

```bash
systemctl is-active slice-api.service slice-web.service postgresql docker
journalctl -u slice-api.service -u slice-web.service --since '15 minutes ago'
docker ps --filter name=slice-redis
du -sh /opt/slice/shared/backups /opt/slice/shared/redis
df -h /opt/slice
free -h
```

Apache, PostgreSQL and Redis must not be broadly reconfigured on this shared
host without accounting for its existing applications. Slice internal ports
are loopback-bound; a host-level firewall change requires a separate review
because the VPS currently hosts other services.

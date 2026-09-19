# Slice isolated preview deployment

The preview environment is a separate Slice instance mounted at `/preview` on
the staging hostname. It exists for product review and must not share the
root-path staging application's database, Redis keys, cookies, service units,
or release pointers.

## Isolation contract

| Boundary | Preview requirement |
| --- | --- |
| Public route | `https://<staging-host>/preview` only |
| API route | `https://<staging-host>/preview/api/v1/*` |
| API / SSR ports | loopback `3201` / `3202` |
| PostgreSQL | a dedicated database whose name ends `_preview` |
| Redis | a non-default Redis database and `slice:preview:` key prefix |
| Session | `slice_preview_refresh`, scoped to `/preview/api/v1/auth` |
| JWT | `slice-preview-api` / `slice-preview-web` only |
| Providers and operations | local/read-safe; all workers, financial operations, live Stripe, identity, Ximilar, and PriceCharting disabled |
| Releases | `/opt/slice-preview/{releases,current,app}` only |
| systemd | `slice-preview-api.service` and `slice-preview-web.service` only |

Both the API configuration loader and `scripts/validate-preview-env.mjs`
enforce this contract before activation. A root-path staging setting causes the
preview release to fail closed rather than reuse shared state.

## One-time operator setup

1. Create `/opt/slice-preview/releases` and make it writable by the unprivileged
   `slice` service user. Keep it distinct from the root application directory.
2. Create the dedicated PostgreSQL role/database and a non-default Redis DB.
   Do not point preview at a staging database, even temporarily.
3. Copy [slice-preview.env.example](../deploy/preview/slice-preview.env.example)
   to `/etc/slice/slice-preview.env`, replace the preview-only secret values,
   set owner `root:slice`, and set mode `0640`.
4. Install [slice-preview-api.service](../deploy/systemd/slice-preview-api.service)
   and [slice-preview-web.service](../deploy/systemd/slice-preview-web.service)
   under `/etc/systemd/system/`, then run `systemctl daemon-reload`.
5. Include [slice-preview.conf](../deploy/apache/slice-preview.conf) inside the
   existing HTTPS virtual host. The fragment adds only `/preview`; it must not
   replace the existing root-path proxy rules. Test with `apachectl configtest`
   and reload Apache only after the config test passes.

## Release procedure

The source commit is the release input. On the VPS, unpack or check out that
committed source into a new immutable directory under
`/opt/slice-preview/releases/`. Never copy local `dist`, `node_modules`,
database files, Redis data, or `.env` files.

```bash
/opt/slice-preview/releases/<release>/scripts/deploy-vps-preview.sh \
  /opt/slice-preview/releases/<release>
```

The script validates the protected preview environment, builds the frontend
with `/preview` as its Vite and router base, validates/builds/migrates only the
preview database, updates only preview symlinks, restarts only preview units,
and checks the local preview services. It never names staging service units or
staging release paths.

After local health passes, check the public mount:

```bash
curl --fail --location https://<staging-host>/preview/health
curl --fail --location https://<staging-host>/preview/ready
curl --fail --location https://<staging-host>/preview/
```

Use browser devtools on `/preview/` to confirm API requests remain under
`/preview/api/v1/` and the refresh cookie is named `slice_preview_refresh`.

## Rollback

Application rollback changes preview symlinks only. It never changes staging
symlinks/services and never deletes or rolls back Prisma migrations.

```bash
ln -sfn /opt/slice-preview/releases/<previous-known-good> /opt/slice-preview/current
ln -sfn /opt/slice-preview/releases/<previous-known-good> /opt/slice-preview/app
systemctl restart slice-preview-api.service slice-preview-web.service
curl --fail http://127.0.0.1:3201/ready
```

If a forward migration was applied, use a compatible application rollback or a
reviewed compensating migration. Do not run `prisma migrate reset`, `db push`,
or database restore commands against either preview or staging.

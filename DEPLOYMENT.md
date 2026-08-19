# Slice VPS deployment

This repository is the source of truth for Slice releases. Do not copy local
`node_modules`, compiled Windows artifacts, databases, Redis data, or `.env`
files to a VPS.

## Requirements

- Ubuntu with Git, Node.js 22 LTS, PostgreSQL, Docker and Apache.
- PostgreSQL and Redis bound to loopback only.
- A dedicated unprivileged `slice` service user.
- `/etc/slice/slice.env` owned by `root:slice` with mode `0640`; it is never
  committed to Git.
- A GitHub SSH deploy key for the `slice` service user when the repository is
  private.

## Initial deployment

1. Clone the repository into `/opt/slice/app`.
2. Create the VPS-only environment file from `server/.env.example`, using
   deployment-managed secrets and keeping provider production mode disabled.
3. Install locked dependencies with `npm ci` at the repository root and in
   `server/`.
4. From `server/`, run `npx prisma generate`, `npx prisma validate`, and
   `npx prisma migrate deploy`. Never use `prisma migrate reset` or `db push`
   against staging or production data.
5. Build the backend with `npm run build` in `server/`.
6. Build the SSR frontend from the repository root with:

   ```bash
   VITE_APP_ENV=beta VITE_DATA_SOURCE=api VITE_API_BASE_URL="$APP_PUBLIC_URL" npm run build
   ```

7. Run the Nest API on `127.0.0.1:3101` and the SSR adapter with
   `npm run start:ssr` on `127.0.0.1:3102`.
8. Put Apache in front of both local services. Proxy `/api/`, `/health`, and
   `/ready` to the API; proxy application routes to the SSR adapter.

The detailed staging topology, health checks, rollback, backup and recovery
procedure is in [docs/STAGING_VPS_DEPLOYMENT.md](docs/STAGING_VPS_DEPLOYMENT.md).

## Safe update procedure

```bash
cd /opt/slice/app
git pull --ff-only origin main
npm ci
cd server && npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
cd ..
VITE_APP_ENV=beta VITE_DATA_SOURCE=api VITE_API_BASE_URL="$APP_PUBLIC_URL" npm run build
sudo systemctl restart slice-api.service slice-web.service
curl --fail http://127.0.0.1:3101/ready
```

Use only forward Prisma migrations. Application rollback is a source-release
rollback only when it remains compatible with the already-applied database
schema; database rollback requires a separately reviewed recovery procedure.

## Source-to-VPS workflow

The repository and GitHub commit are the source of truth. Commit the intended
source changes, push the commit to `main`, and deploy that commit into a new
server-side release directory. Do not create local `.tar.gz` or `.zip`
release bundles, copy local `dist` or `node_modules`, or deploy an uncommitted
working tree. Keep provider credentials in the protected VPS environment only.

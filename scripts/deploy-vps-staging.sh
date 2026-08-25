#!/usr/bin/env bash
set -euo pipefail

# Run on the staging VPS as an operator after the new source release has been
# unpacked into its own immutable release directory. Secrets stay in the
# systemd EnvironmentFile; this script deliberately reads none from source.

release_dir="${1:?usage: deploy-vps-staging.sh /opt/slice/releases/<release>}"
api_url="${VITE_API_BASE_URL:?VITE_API_BASE_URL must be the public staging origin}"
# Keep the client-side runtime policy aligned with the staging API. Without an
# explicit VITE_APP_ENV, the frontend defaults to development and can render
# retired showcase/demo controls even though the backend is in Beta mode.
frontend_app_env="${VITE_APP_ENV:-beta}"

if [[ ! -f "${release_dir}/package.json" || ! -f "${release_dir}/server/package.json" ]]; then
  echo "Release directory does not contain the Slice frontend and backend." >&2
  exit 1
fi

cd "${release_dir}"
npm ci
VITE_APP_ENV="${frontend_app_env}" \
  VITE_DATA_SOURCE=api \
  VITE_API_BASE_URL="${api_url}" \
  npm run build

if [[ ! -f "${release_dir}/apps/discord-bot/package.json" ]]; then
  echo "Release directory does not contain the Discord bot package." >&2
  exit 1
fi

cd "${release_dir}/apps/discord-bot"
npm ci
npm run build

cd server
npm ci
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run build

ln -sfn "${release_dir}" /opt/slice/current
# Staging systemd units run from /opt/slice/app. Keep both release pointers
# aligned so a successful build actually activates the release being checked.
ln -sfn "${release_dir}" /opt/slice/app
systemctl restart slice-api.service slice-web.service

for attempt in {1..15}; do
  if curl --fail --silent --show-error http://127.0.0.1:3101/health >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1:3101/ready >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1:3102/ >/dev/null; then
    echo "Slice staging health checks passed on attempt ${attempt}."
    echo "Slice staging release activated: ${release_dir}"
    exit 0
  fi
  sleep 2
done

echo "Slice staging services did not become healthy within 30 seconds." >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail

# Run on the staging VPS as an operator after the new source release has been
# unpacked into its own immutable release directory. Secrets stay in the
# systemd EnvironmentFile; this script deliberately reads none from source.

release_dir="${1:?usage: deploy-vps-staging.sh /opt/slice/releases/<release>}"
api_url="${VITE_API_BASE_URL:?VITE_API_BASE_URL must be the public staging origin}"

if [[ ! -f "${release_dir}/package.json" || ! -f "${release_dir}/server/package.json" ]]; then
  echo "Release directory does not contain the Slice frontend and backend." >&2
  exit 1
fi

cd "${release_dir}"
npm ci
VITE_DATA_SOURCE=api VITE_API_BASE_URL="${api_url}" npm run build

cd server
npm ci
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run build

ln -sfn "${release_dir}" /opt/slice/current
systemctl restart slice-api.service slice-web.service

curl --fail --silent --show-error http://127.0.0.1:3101/health >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3101/ready >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3102/ >/dev/null

echo "Slice staging release activated: ${release_dir}"

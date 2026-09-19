#!/usr/bin/env bash
set -Eeuo pipefail

# Isolated Slice preview activator. This script intentionally names only the
# preview root and preview units; it must never activate or restart root-path
# staging. Run it on the VPS after unpacking a committed source release.

preview_root="/opt/slice-preview"
preview_env="/etc/slice/slice-preview.env"
release_input="${1:?usage: deploy-vps-preview.sh /opt/slice-preview/releases/<release>}"

fail() {
  echo "preview deployment: $*" >&2
  exit 1
}

release_dir="$(readlink -f "${release_input}")" || fail "release directory does not exist."
case "${release_dir}" in
  "${preview_root}"/releases/*) ;;
  *) fail "release directory must be below ${preview_root}/releases/." ;;
esac

[[ -f "${preview_env}" ]] || fail "missing protected preview environment file."
[[ -f "${release_dir}/package.json" && -f "${release_dir}/server/package.json" ]] || \
  fail "release directory does not contain both Slice applications."

# The protected operator-owned env file is the sole source of deploy secrets.
# It is sourced only to pass values into build/validation processes; no values
# are printed by this script.
set -a
# shellcheck disable=SC1090
source "${preview_env}"
set +a

export VITE_DATA_SOURCE="api"
export VITE_APP_ENV="beta"
export VITE_DEPLOYMENT_CHANNEL="preview"
export VITE_PUBLIC_BASE_PATH="/preview"
export VITE_API_BASE_URL="${APP_PUBLIC_URL:?APP_PUBLIC_URL is required}"

node "${release_dir}/scripts/validate-preview-env.mjs"

cd "${release_dir}"
npm ci
npm run typecheck
npm run build

cd "${release_dir}/server"
npm ci
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run typecheck
npm run build

# Keep previously referenced, content-addressed preview assets available during
# a release handover. The source and destination are both preview-only.
previous_release="$(readlink -f "${preview_root}/current" 2>/dev/null || true)"
if [[ -n "${previous_release}" && "${previous_release}" != "${release_dir}" && -d "${previous_release}/dist/client/assets" ]]; then
  cp --archive --no-clobber "${previous_release}/dist/client/assets/." "${release_dir}/dist/client/assets/"
fi

ln -sfn "${release_dir}" "${preview_root}/current"
ln -sfn "${release_dir}" "${preview_root}/app"
systemctl restart slice-preview-api.service slice-preview-web.service

for attempt in {1..15}; do
  if curl --fail --silent --show-error http://127.0.0.1:3201/health >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1:3201/ready >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1:3202/preview/ >/dev/null; then
    echo "Slice isolated preview activated: ${release_dir}"
    exit 0
  fi
  sleep 2
done

cat >&2 <<EOF
Preview services did not become healthy after activation.
The previous preview release was: ${previous_release:-not available}.
Do not change database migration history. Follow the preview rollback procedure
in docs/PREVIEW_DEPLOYMENT.md after inspecting the preview-only service logs.
EOF
exit 1

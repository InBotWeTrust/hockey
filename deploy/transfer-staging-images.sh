#!/usr/bin/env bash
set -euo pipefail

: "${STAGING_SSH_USER:?}"
: "${STAGING_SSH_HOST:?}"
: "${STAGING_IMAGE_TAG:?}"
: "${SERVER_IMAGE:?}"
: "${WEB_IMAGE:?}"
: "${GHCR_USER:?}"
: "${GHCR_TOKEN:?}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-$HOME/.ssh/id_ed25519}"
[[ "$STAGING_IMAGE_TAG" =~ ^dev-sha-[0-9a-f]{7}$ ]]
[[ "$SERVER_IMAGE" =~ ^ghcr.io/[a-z0-9/_-]+$ ]]
[[ "$WEB_IMAGE" =~ ^ghcr.io/[a-z0-9/_-]+$ ]]
server_ref="$SERVER_IMAGE:$STAGING_IMAGE_TAG"
web_ref="$WEB_IMAGE:$STAGING_IMAGE_TAG"
ssh_target="$STAGING_SSH_USER@$STAGING_SSH_HOST"
ssh_options=(-i "$SSH_IDENTITY_FILE" -o BatchMode=yes -o ConnectTimeout=15)

# GHCR downloads stay on the Actions runner; the VPS receives ready-built layers.
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
timeout 300 docker pull "$server_ref"
timeout 300 docker pull "$web_ref"
server_id="$(docker image inspect --format '{{.Id}}' "$server_ref")"
web_id="$(docker image inspect --format '{{.Id}}' "$web_ref")"
[[ "$server_id" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$web_id" =~ ^sha256:[0-9a-f]{64}$ ]]

# Prune before loading: newly loaded images must survive until compose recreates services.
ssh "${ssh_options[@]}" "$ssh_target" 'docker image prune -af' < /dev/null
docker image save "$server_ref" "$web_ref" | gzip -1 | \
  timeout 600 ssh "${ssh_options[@]}" "$ssh_target" 'bash -o pipefail -c "gzip -d | docker image load"'

# A successful pipe alone is insufficient: both tags must name the exact runner images.
ssh "${ssh_options[@]}" "$ssh_target" bash -s -- "$server_ref" "$server_id" "$web_ref" "$web_id" <<'VERIFY'
set -euo pipefail
test "$(docker image inspect --format '{{.Id}}' "$1")" = "$2"
test "$(docker image inspect --format '{{.Id}}' "$3")" = "$4"
printf 'Verified staging image content for %s and %s\n' "$1" "$3"
VERIFY

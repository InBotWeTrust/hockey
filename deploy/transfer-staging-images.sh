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
local_dir="$(mktemp -d)"
remote_dir=""
cleanup() {
  docker logout ghcr.io >/dev/null 2>&1 || true
  rm -rf -- "$local_dir"
  if [[ "$remote_dir" =~ ^/tmp/hockey-staging-images\.[a-zA-Z0-9]+$ ]]; then
    ssh "${ssh_options[@]}" "$ssh_target" "rm -rf -- '$remote_dir'" < /dev/null || true
  fi
}
trap cleanup EXIT
timeout 300 docker pull "$server_ref"
timeout 300 docker pull "$web_ref"
server_id="$(docker image inspect --format '{{.Id}}' "$server_ref")"
web_id="$(docker image inspect --format '{{.Id}}' "$web_ref")"
[[ "$server_id" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$web_id" =~ ^sha256:[0-9a-f]{64}$ ]]

# Build a disposable basis from the images already serving dev. rsync reuses
# unchanged asset/dependency bytes even when Docker COPY layer digests differ.
# No image is built on the VPS, and running images remain available for rollback.
remote_dir="$(ssh "${ssh_options[@]}" "$ssh_target" bash -s <<'BASIS'
set -euo pipefail
command -v rsync > /dev/null
basis_dir="$(mktemp -d /tmp/hockey-staging-images.XXXXXXXX)"
server_basis="$(docker inspect --format '{{.Config.Image}}' ultimate-hockey-server-dev-1)"
web_basis="$(docker inspect --format '{{.Config.Image}}' ultimate-hockey-web-dev-1)"
timeout 300 docker image save "$server_basis" "$web_basis" > "$basis_dir/images.tar"
printf '%s\n' "$basis_dir"
BASIS
)"
[[ "$remote_dir" =~ ^/tmp/hockey-staging-images\.[a-zA-Z0-9]+$ ]]
docker image save "$server_ref" "$web_ref" > "$local_dir/images.tar"
printf -v rsync_shell '%q ' ssh "${ssh_options[@]}"
timeout 900 rsync --no-whole-file --compress --checksum --stats \
  -e "$rsync_shell" "$local_dir/images.tar" "$ssh_target:$remote_dir/images.tar"
ssh "${ssh_options[@]}" "$ssh_target" "timeout 300 docker image load < '$remote_dir/images.tar'" < /dev/null

# A successful pipe alone is insufficient: both tags must name the exact runner images.
ssh "${ssh_options[@]}" "$ssh_target" bash -s -- "$server_ref" "$server_id" "$web_ref" "$web_id" <<'VERIFY'
set -euo pipefail
test "$(docker image inspect --format '{{.Id}}' "$1")" = "$2"
test "$(docker image inspect --format '{{.Id}}' "$3")" = "$4"
printf 'Verified staging image content for %s and %s\n' "$1" "$3"
VERIFY

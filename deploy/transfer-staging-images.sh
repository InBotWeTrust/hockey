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
remote_dir="$(ssh "${ssh_options[@]}" "$ssh_target" 'mktemp -d /tmp/hockey-staging-images.XXXXXXXX' < /dev/null)"
[[ "$remote_dir" =~ ^/tmp/hockey-staging-images\.[a-zA-Z0-9]+$ ]]
archive_preparer="$(dirname "$0")/prepare-image-archive.py"
ssh "${ssh_options[@]}" "$ssh_target" "cat > '$remote_dir/prepare.py'" < "$archive_preparer"

# Build a disposable basis from the images already serving dev. rsync reuses
# unchanged asset/dependency bytes even when Docker COPY layer digests differ.
# No image is built on the VPS, and running images remain available for rollback.
ssh "${ssh_options[@]}" "$ssh_target" bash -s -- "$remote_dir" <<'BASIS'
set -euo pipefail
command -v rsync > /dev/null
# The superseded dev-only SSH pipe can outlive a cancelled Actions runner.
# Match its exact command under our own user; production uses registry pulls.
legacy_pids=""
for legacy_pid in $(
  pgrep -u "$(id -u)" -f '^bash -o pipefail -c gzip -d \| docker image load$' || true
  pgrep -u "$(id -u)" -f '^rsync --server .* /tmp/hockey-staging-images\.[a-zA-Z0-9]+/images\.tar$' || true
); do
  legacy_pids="$legacy_pids $legacy_pid $(pgrep -P "$legacy_pid" || true)"
  pkill -TERM -P "$legacy_pid" || true
  kill -TERM "$legacy_pid" || true
done
for attempt in {1..10}; do
  alive=""
  for pid in $legacy_pids; do
    if kill -0 "$pid" 2>/dev/null; then alive="$alive $pid"; fi
  done
  [[ -z "$alive" ]] && break
  sleep 1
done
[[ -z "$alive" ]] || { echo 'Legacy staging loader did not stop' >&2; exit 1; }
basis_dir="$1"
trap 'rm -rf -- "$basis_dir"' ERR
basis_refs=()
for container in ultimate-hockey-server-dev-1 ultimate-hockey-web-dev-1; do
  if basis_ref="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null)"; then
    basis_refs+=("$basis_ref")
  fi
done
if (( ${#basis_refs[@]} )); then
  timeout 300 docker image save "${basis_refs[@]}" > "$basis_dir/input.tar"
  timeout 300 python3 "$basis_dir/prepare.py" "$basis_dir/input.tar" "$basis_dir/images.tar"
  rm -- "$basis_dir/input.tar"
else
  : > "$basis_dir/images.tar"
fi
trap - ERR
BASIS
timeout 300 docker image save "$server_ref" "$web_ref" > "$local_dir/input.tar"
timeout 300 python3 "$archive_preparer" "$local_dir/input.tar" "$local_dir/images.tar"
timeout 300 python3 "$archive_preparer" --configs "$local_dir/input.tar" > "$local_dir/expected.json"
rm -- "$local_dir/input.tar"
# Prove the packaging is accepted by Docker before sending any image payload.
timeout 300 docker image load < "$local_dir/images.tar"
timeout 300 docker image save "$server_ref" "$web_ref" | \
  timeout 300 python3 "$archive_preparer" --verify-configs "$local_dir/expected.json"
ssh "${ssh_options[@]}" "$ssh_target" "cat > '$remote_dir/expected.json'" < "$local_dir/expected.json"
printf -v rsync_shell '%q ' ssh "${ssh_options[@]}"
timeout 900 rsync --no-whole-file --block-size=1024 --compress --checksum --stats \
  -e "$rsync_shell" "$local_dir/images.tar" "$ssh_target:$remote_dir/images.tar"
ssh "${ssh_options[@]}" "$ssh_target" "timeout 300 docker image load < '$remote_dir/images.tar'" < /dev/null

# OCI manifest IDs change with layer compression. The immutable config digest
# includes every runtime setting and the ordered raw filesystem layer digests.
ssh "${ssh_options[@]}" "$ssh_target" "bash -o pipefail -c 'timeout 300 docker image save $server_ref $web_ref | timeout 300 python3 $remote_dir/prepare.py --verify-configs $remote_dir/expected.json'" < /dev/null
printf 'Verified staging image content for %s and %s\n' "$server_ref" "$web_ref"

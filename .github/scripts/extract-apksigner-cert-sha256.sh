#!/usr/bin/env bash
set -euo pipefail

digest="$({
  awk '/^(V[0-9.]+ Signer:|Signer #[0-9]+) certificate SHA-256 digest: / {
    sub(/^.*certificate SHA-256 digest: /, "")
    print
    exit
  }'
} | tr '[:upper:]' '[:lower:]' | tr -d ':')"

[[ "$digest" =~ ^[0-9a-f]{64}$ ]] || {
  echo 'Could not extract a valid signer certificate SHA-256 digest from apksigner output' >&2
  exit 1
}

printf '%s\n' "$digest"

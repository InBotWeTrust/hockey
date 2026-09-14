#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$SCRIPT_DIR/extract-apksigner-cert-sha256.sh"
EXPECTED='2893c7191ca877b0e71f16cf4e839d31db0d11c23ba9e9d2a8d751997c0b497f'

actual="$({
  echo 'Verifies'
  echo 'V2 Signer: certificate SHA-256 digest: 2893C7191CA877B0E71F16CF4E839D31DB0D11C23BA9E9D2A8D751997C0B497F'
} | "$PARSER")"
[ "$actual" = "$EXPECTED" ]

actual="$({
  echo 'Verifies'
  echo 'Signer #1 certificate SHA-256 digest: 28:93:C7:19:1C:A8:77:B0:E7:1F:16:CF:4E:83:9D:31:DB:0D:11:C2:3B:A9:E9:D2:A8:D7:51:99:7C:0B:49:7F'
} | "$PARSER")"
[ "$actual" = "$EXPECTED" ]

if printf '%s\n' 'Verifies' | "$PARSER" >/dev/null 2>&1; then
  echo 'parser must reject output without a signer certificate digest' >&2
  exit 1
fi

#!/usr/bin/env bash
# Thin wrapper: node scripts/r2-inbox.mjs setup "$@"   (add --dry-run to print calls without running them)
# Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment. See README.md.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$here/r2-inbox.mjs" setup "$@"

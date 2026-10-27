#!/usr/bin/env bash
# Thin wrapper: node scripts/r2-inbox.mjs overlay-sync "$@"   (add --dry-run to print calls without running them)
# Uploads <privateDir>/r2/config/*.json to R2. See docs/private-deploy.md.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$here/r2-inbox.mjs" overlay-sync "$@"

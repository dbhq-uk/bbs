#!/usr/bin/env bash
# Deploy the board by hand: build, ship, purge the edge, prove it is live.
#
# THIS IS THE FALLBACK, not the route. Pushing to main runs
# .github/workflows/deploy.yml, which does these same four steps in the same
# order by calling these same scripts. Use this when CI is unavailable, and
# check first that CI is not already shipping the same commit:
#
#   gh run list --repo dbhq-uk/bbs --workflow deploy.yml --limit 3
#
#   ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# cargo and wasm-pack live in ~/.cargo/bin, which a non-login shell does not
# have on PATH.
export PATH="$HOME/.cargo/bin:$PATH"

: "${CLOUDFLARE_API_TOKEN:?source ~/.dbhq/env.sh first}"
: "${CLOUDFLARE_ZONE_ID:?source ~/.dbhq/env.sh first}"

echo "==> building"
wasm-pack build core --target web --release
(cd shell && npm run build)

echo "==> deploying"
npx wrangler deploy

./scripts/purge.sh
./scripts/verify.sh

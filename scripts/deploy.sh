#!/usr/bin/env bash
# Deploy the board, then purge the edge cache.
#
# THE PURGE IS NOT OPTIONAL. Cloudflare caches robots.txt, sitemap.xml and
# llms.txt at the zone, and a deploy does not invalidate them. This bit us
# on 9 Sep 2026: a new robots.txt and llms.txt were live on the
# workers.dev hostname and the zone was still serving a cached 404 and
# Cloudflare's own directive-free managed robots.txt. Both looked like
# deploy failures and were cache.
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

echo "==> purging the edge"
curl -fsS -X POST \
  "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"files":[
        "https://bbs.dbhq.uk/",
        "https://bbs.dbhq.uk/index.html",
        "https://bbs.dbhq.uk/robots.txt",
        "https://bbs.dbhq.uk/sitemap.xml",
        "https://bbs.dbhq.uk/llms.txt",
        "https://bbs.dbhq.uk/ascii-art-generator/",
        "https://bbs.dbhq.uk/tool.css",
        "https://bbs.dbhq.uk/analytics.js",
        "https://bbs.dbhq.uk/consent.js"
      ]}' >/dev/null
echo "    purged"

echo "==> verifying"
for p in "" ascii-art-generator/ robots.txt sitemap.xml llms.txt; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://bbs.dbhq.uk/${p}?cb=$RANDOM")
  printf '    %-14s %s\n' "/${p}" "$code"
done

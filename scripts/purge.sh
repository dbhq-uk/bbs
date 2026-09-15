#!/usr/bin/env bash
# Purge the edge cache for everything the board serves.
#
# THE PURGE IS NOT OPTIONAL. Cloudflare caches robots.txt, sitemap.xml and
# llms.txt at the zone, and a deploy does not invalidate them. This bit us on
# 9 Sep 2026: a new robots.txt and llms.txt were live on the workers.dev
# hostname and the zone was still serving a cached 404 and Cloudflare's own
# directive-free managed robots.txt. Both looked like deploy failures and were
# cache.
#
# Purge by file list, not purge_everything. The zone is dbhq.uk and it carries
# the marketing site and modem as well, so purging everything would throw away
# their caches to ship the board. Purge by hostname or by prefix would be the
# right tool and both are Enterprise-only.
#
#   ./scripts/purge.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CLOUDFLARE_API_TOKEN:?source ~/.dbhq/env.sh first}"
: "${CLOUDFLARE_ZONE_ID:?source ~/.dbhq/env.sh first}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

python3 scripts/urls.py >"$WORK/urls.txt"
COUNT=$(wc -l <"$WORK/urls.txt" | tr -d ' ')
echo "==> purging $COUNT URLs"

# Cloudflare takes at most 30 files per call on this plan and rejects the
# whole request if it is handed more, so the list is chunked rather than sent
# as one payload that silently grows past the limit.
split -l 30 "$WORK/urls.txt" "$WORK/chunk-"

for chunk in "$WORK"/chunk-*; do
  payload=$(python3 -c '
import json, sys
print(json.dumps({"files": [l.strip() for l in open(sys.argv[1]) if l.strip()]}))
' "$chunk")
  resp=$(curl -fsS -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$payload")
  # curl -f already fails on an HTTP error, but the API also answers 200 with
  # {"success":false} for a payload it accepted and then refused, so the body
  # has to be read rather than assumed.
  if ! grep -q '"success":true' <<<"$resp"; then
    echo "purge failed: $resp" >&2
    exit 1
  fi
done

echo "    purged"

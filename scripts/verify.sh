#!/usr/bin/env bash
# Prove the board is actually live, after a deploy and a purge.
#
# Every request is cache-busted. A plain request can still be handed a stale
# edge copy in the seconds after a purge, so a bare curl can report a deploy
# as good on the strength of the bytes it was meant to replace.
#
#   ./scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SITE="${BBS_SITE_URL:-https://bbs.dbhq.uk}"
SITE="${SITE%/}"
# In CI the commit is the strongest cache-buster there is; by hand, anything
# that is not the last one will do.
CB="${GITHUB_SHA:-$RANDOM}"

fail=0
note() { printf '    %-52s %s\n' "$1" "$2"; }

echo "==> every served URL must be reachable"
# -L, because /index.html and /about/index.html 307 to /  and /about/ before
# being served. That redirect is correct and asserting on the unfollowed
# status would fail a deploy that worked. The final URL is not checked here
# because the redirect is the asset server's own canonicalisation, not a
# rule of ours that could point somewhere unintended.
while read -r url; do
  code=$(curl -sL -o /dev/null -w '%{http_code}' "${url}?cb=${CB}")
  note "${url#"$SITE"}" "$code"
  [ "$code" = "200" ] || fail=1
done < <(python3 scripts/urls.py)

echo "==> the WASM core must be serving"
# The board is a WASM renderer with a terminal in front of it. A 200 on the
# HTML with a 404 on the payload is a page that looks fine and does nothing,
# and because the filename is content-hashed it is a different URL on every
# build - so the name is read from what was just built, not hardcoded.
wasm=$(find shell/dist/assets -name '*.wasm' -print -quit)
if [ -z "$wasm" ]; then
  echo "    no wasm in shell/dist/assets - the core was not built into the shell" >&2
  fail=1
else
  code=$(curl -s -o /dev/null -w '%{http_code}' "${SITE}/assets/$(basename "$wasm")?cb=${CB}")
  note "/assets/$(basename "$wasm")" "$code"
  [ "$code" = "200" ] || fail=1
fi

echo "==> the CSP must permit WASM"
# Instantiating the core needs 'wasm-unsafe-eval' in script-src. Without it
# the board fails at the edge and works perfectly in local testing, which is
# the worst possible way to find out. _headers is easy to leave out of a
# build and nothing else here would notice.
csp=$(curl -sI "${SITE}/?cb=${CB}" | tr -d '\r' | grep -i '^content-security-policy:' || true)
if [ -z "$csp" ]; then
  echo "    no Content-Security-Policy served - _headers did not make the deploy" >&2
  fail=1
elif ! grep -q 'wasm-unsafe-eval' <<<"$csp"; then
  echo "    CSP is present but does not permit wasm-unsafe-eval - the board will not run" >&2
  fail=1
else
  note "content-security-policy" "wasm-unsafe-eval present"
fi

echo "==> the Worker must be answering its own routes"
# worker/index.ts routes by exact string, and its own comment names the
# failure: one wrong string and an API caller is quietly served the shell's
# index.html instead of the endpoint. That is invisible to every check above,
# because the shell would still be serving perfectly.
#
# The status is deliberately not asserted. /session refuses an unauthenticated
# caller today and what it refuses with is the gate's business, not this
# script's. What must hold is that a Worker answered at all, which the
# content type says and static HTML cannot fake.
ctype=$(curl -s -o /dev/null -w '%{content_type}' "${SITE}/session?cb=${CB}")
note "/session content-type" "$ctype"
case "$ctype" in
  application/json*) ;;
  *) echo "    /session served $ctype - the shell answered instead of the Worker" >&2; fail=1 ;;
esac

if [ "$fail" -ne 0 ]; then
  echo "==> FAILED" >&2
  exit 1
fi
echo "==> all good"

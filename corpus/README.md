# The projection corpus

The honest measurement of how often this board turns the live web into
something readable. Spec 1 requires it, and until it existed **no percentage
claim about projection quality was allowed anywhere in the copy**. That ban
is lifted only for numbers this produces.

```bash
node corpus/capture.mjs --session <member-token>   # fetch, via the relay
node corpus/measure.mjs                            # measure, write REPORT.md
```

## Why capture goes through the relay

`capture.mjs` fetches through `/gw/fetch` rather than directly. A direct fetch
measures what the web serves; the relay is what the board actually receives,
after redirect re-validation, the content-type allowlist, the byte cap and the
timeout. Measuring anything else produces a number that does not describe the
product.

Pages the relay refuses stay in the report as `refused` rather than being
dropped, because dropping them would quietly improve the score.

## Getting a member session

The corpus is deliberately not on the curated list, so a guest session cannot
capture it. A member with the `G` flag can:

```bash
curl -s -X POST -H content-type:application/json -H x-bbs-client:1 \
  -d '{"email":"...","password":"..."}' https://bbs.dbhq.uk/auth/logon
```

Sessions last 30 minutes; a 50-page run takes about four. `capture.mjs` skips
pages already on disk, so an interrupted run can just be run again.

## Why the SPA section is in there

Five pages are known single-page-app shells and are expected to fail. They are
included so the empty-shell number is honest. A corpus of hand-picked static
blogs would produce a lovely percentage that means nothing.

`corpus/pages/` is git-ignored - it is ~16MB of captured HTML. `REPORT.md` is
committed, because the number is the point.

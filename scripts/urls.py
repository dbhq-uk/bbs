#!/usr/bin/env python3
"""Every URL the board serves under its own name, derived from shell/dist.

One list, two consumers: scripts/purge.sh purges these and scripts/verify.sh
checks each one is live. Deriving it beats writing it out, and the list this
replaced proves why - it was hand-maintained in scripts/deploy.sh and had
already gone stale, missing favicon.svg and icons.svg. A hand-written list
loses a file the moment somebody adds a page, silently, with the edge still
serving the old copy.

Two deliberate exclusions:

  assets/   Content-hashed by Vite (bbs_core_bg-Azor0m2H.wasm). A new build
            gives every one of them a new name, so a stale copy is not
            reachable and purging them wastes the quota.
  _headers  A build directive Cloudflare consumes at deploy time. It is not
            served, so requesting it proves nothing and purging it is a no-op.

A directory index is listed twice on purpose - as /about/index.html and as
/about/ - because those are separate cache entries at the edge and only the
second is what anyone actually requests.
"""

import os
import sys

DIST = "shell/dist"
SITE = os.environ.get("BBS_SITE_URL", "https://bbs.dbhq.uk").rstrip("/")


def urls(dist: str, site: str) -> list[str]:
    found: list[str] = []
    for root, dirs, files in os.walk(dist):
        dirs[:] = [d for d in dirs if d != "assets"]
        for name in files:
            if name == "_headers":
                continue
            rel = os.path.relpath(os.path.join(root, name), dist)
            rel = rel.replace(os.sep, "/")
            found.append(f"{site}/{rel}")
            if name == "index.html":
                found.append(f"{site}/{rel[: -len('index.html')]}")
    return sorted(set(found))


def main() -> int:
    if not os.path.isdir(DIST):
        print(f"no {DIST} - build the shell first", file=sys.stderr)
        return 1
    found = urls(DIST, SITE)
    # An empty or root-less list would let purge.sh and verify.sh both pass
    # having done nothing at all, which is the one failure this cannot be
    # allowed to have. A build that produced no index.html is broken.
    if f"{SITE}/" not in found:
        print(f"{DIST} has no index.html - the build is broken", file=sys.stderr)
        return 1
    print("\n".join(found))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

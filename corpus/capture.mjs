// Captures the corpus THROUGH THE BOARD'S OWN RELAY, not with a direct fetch.
//
// That distinction is the whole point. A direct fetch measures what the web
// serves; the relay is what the board actually receives, after redirect
// re-validation, the content-type allowlist, the byte cap and the timeout.
// Measuring anything else would produce a number that does not describe the
// product.
//
// Needs a MEMBER session, because a guest is confined to the curated list and
// the corpus deliberately is not. Get one with:
//
//   node corpus/capture.mjs --session <token>
//
// or set BBS_SESSION. See corpus/README.md for how to mint one.
//
// Resumable: pages already on disk are skipped, so a run interrupted by a
// rate limit can simply be run again.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const BASE = process.env.BBS_BASE ?? "https://bbs.dbhq.uk";
const SESSION =
  process.env.BBS_SESSION ??
  (process.argv.includes("--session")
    ? process.argv[process.argv.indexOf("--session") + 1]
    : null);

if (!SESSION) {
  console.error("no session. pass --session <token> or set BBS_SESSION");
  process.exit(1);
}

const OUT = new URL("./pages/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/// A filename that survives a round trip and stays readable in a diff.
export function slug(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9.-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export function parseUrls(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [category, url] = l.split(/\s+/);
      return { category, url };
    })
    .filter((e) => e.url);
}

// The per-session limit is 30/minute and the relay is not instant, so a
// small pause keeps a 50-page run inside it. Being refused mid-corpus is
// recoverable but wastes a run.
const PAUSE_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(entry) {
  const name = slug(entry.url);
  const page = `${OUT}${name}.html`;
  const meta = `${OUT}${name}.json`;
  if (existsSync(meta)) return "skipped";

  const res = await fetch(`${BASE}/gw/fetch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bbs-client": "1",
      "x-bbs-session": SESSION,
    },
    body: JSON.stringify({ url: entry.url }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Recorded, not thrown. A page the relay refuses is a real result about
    // the product and belongs in the report; dropping it would quietly
    // improve the score.
    writeFileSync(
      meta,
      JSON.stringify({ ...entry, ok: false, status: res.status, error: body.error }, null, 2),
    );
    return `refused ${res.status} ${body.error ?? ""}`;
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(page, bytes);
  writeFileSync(
    meta,
    JSON.stringify(
      {
        ...entry,
        ok: true,
        bytes: bytes.length,
        contentType: res.headers.get("x-bbs-content-type"),
        finalUrl: res.headers.get("x-bbs-final-url"),
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return `${(bytes.length / 1024).toFixed(0)}KB`;
}

const entries = parseUrls(
  readFileSync(new URL("./urls.txt", import.meta.url).pathname, "utf8"),
);
console.log(`${entries.length} urls`);

let n = 0;
for (const entry of entries) {
  n++;
  let result;
  try {
    result = await capture(entry);
  } catch (e) {
    result = `threw ${e.message}`;
  }
  console.log(`  ${String(n).padStart(2)}/${entries.length} ${entry.url} -> ${result}`);
  if (result !== "skipped") await sleep(PAUSE_MS);
}

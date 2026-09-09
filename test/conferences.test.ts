import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { siteMatches, type Site } from "../functions/_lib/db";

/// THE MENU MUST NOT OFFER WHAT THE GATE REFUSES.
///
/// Three of the four conferences on the main menu were dead for guests and
/// nothing failed. Each half was correct on its own: the conferences pointed
/// at real feeds, and the allowlist held real sites. They just described
/// different hosts - a conference reads hacker-news.firebaseio.com while the
/// allowlist named news.ycombinator.com - so pressing 1 returned
/// `members_only` and looked to the reader like the board being broken.
///
/// Nothing in either file can catch that, because the mismatch only exists
/// between them. So this test reads both and compares them. It parses source
/// rather than importing it because the allowlist lives in SQL and the
/// conferences live in the shell's TypeScript.
function allowlistHosts(): Site[] {
  const dir = new URL("../migrations/", import.meta.url).pathname;
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(dir + f, "utf8"))
    .join("\n");

  // Only URLs inside an `INSERT INTO sites` statement.
  const inserts = [...sql.matchAll(/INSERT INTO sites[\s\S]*?;/g)].map((m) => m[0]);
  const urls = inserts.flatMap((s) => [...s.matchAll(/'(https?:\/\/[^']+)'/g)].map((m) => m[1]));

  expect(urls.length, "no sites parsed from migrations").toBeGreaterThan(0);
  return urls.map((url, i) => ({ id: i, name: url, url, sort: i, listed: 1 }));
}

function conferenceUrls(): string[] {
  const src = readFileSync(
    new URL("../shell/src/conferences.ts", import.meta.url).pathname,
    "utf8",
  );
  const urls = [...src.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  expect(urls.length, "no conference urls parsed").toBeGreaterThan(0);
  return urls;
}

describe("every conference is reachable by a guest", () => {
  const allow = allowlistHosts();

  for (const url of conferenceUrls()) {
    it(`allows ${new URL(url).host}`, () => {
      expect(siteMatches(allow, url)).toBe(true);
    });
  }
});

describe("the relay accepts what the conferences return", () => {
  it("allows application/json", async () => {
    // The conferences are all JSON APIs. Without this every one of them
    // failed with `content type application/json` even once the host was
    // allowed - two independent causes of the same dead menu entry.
    const src = readFileSync(
      new URL("../functions/_lib/fetchsafe.ts", import.meta.url).pathname,
      "utf8",
    );
    expect(src).toContain('"application/json"');
  });
});

describe("the allowlist and the menu are different sets", () => {
  it("keeps the API feeds reachable but unlisted", () => {
    // Fixing reach by putting the feeds on the menu would have left readers
    // with "hacker-news.firebaseio.com" as somewhere to visit.
    const dir = new URL("../migrations/", import.meta.url).pathname;
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(dir + f, "utf8"))
      .join("\n");

    expect(sql).toMatch(/listed/);
    expect(sql).toMatch(/hacker-news\.firebaseio\.com[^)]*,\s*0\s*\)/);
  });
});

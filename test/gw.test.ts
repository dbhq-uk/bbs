import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { checkRequest } from "../functions/_lib/guard";
import {
  ANSI_TYPE,
  artTypeFor,
  MAX_BYTES,
  MAX_REDIRECTS,
  safeFetch,
  validateTarget,
} from "../functions/_lib/fetchsafe";
import { ALLOWANCE, decodeToken, signToken, verifyToken } from "../functions/_lib/quota";

function req(init: { method?: string; headers?: Record<string, string> } = {}) {
  return new Request("https://bbs.dbhq.uk/gw/fetch", {
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      "x-bbs-client": "1",
      "sec-fetch-site": "same-origin",
      ...init.headers,
    },
  });
}

describe("the preflight lock", () => {
  it("accepts a same-origin POST carrying the custom header", () => {
    expect(checkRequest(req()).ok).toBe(true);
  });

  it("rejects GET, so an img tag cannot trigger a fetch", () => {
    // Omitting Access-Control-Allow-Origin stops another origin READING the
    // response but not TRIGGERING it. Requiring POST plus a non-safelisted
    // header forces a preflight, which fails, so it never fires.
    expect(checkRequest(req({ method: "GET" })).ok).toBe(false);
  });

  it("rejects a request without the custom header", () => {
    const r = new Request("https://bbs.dbhq.uk/gw/fetch", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });
    expect(checkRequest(r).ok).toBe(false);
  });

  it("rejects cross-site Sec-Fetch-Site", () => {
    expect(checkRequest(req({ headers: { "sec-fetch-site": "cross-site" } })).ok).toBe(false);
  });

  it("rejects a form content type", () => {
    expect(
      checkRequest(req({ headers: { "content-type": "application/x-www-form-urlencoded" } })).ok,
    ).toBe(false);
  });
});

describe("target validation", () => {
  it("accepts ordinary http and https URLs", () => {
    expect(validateTarget("https://example.com/page").ok).toBe(true);
    expect(validateTarget("http://example.com/page").ok).toBe(true);
  });

  it("rejects non-http schemes", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://x/y",
      "data:text/html,x",
      "javascript:alert(1)",
      "gopher://x",
    ]) {
      expect(validateTarget(u).ok, u).toBe(false);
    }
  });

  it("rejects private and loopback literals", () => {
    for (const u of [
      "http://127.0.0.1/",
      "http://localhost/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://169.254.169.254/",
      "http://[::1]/",
      "http://0.0.0.0/",
    ]) {
      expect(validateTarget(u).ok, u).toBe(false);
    }
  });

  it("rejects a port that does not match the scheme", () => {
    expect(validateTarget("http://example.com:443/").ok).toBe(false);
    expect(validateTarget("https://example.com:80/").ok).toBe(false);
    expect(validateTarget("http://example.com:22/").ok).toBe(false);
    expect(validateTarget("https://example.com:443/").ok).toBe(true);
  });

  it("rejects our own origin, so the relay cannot be pointed at itself", () => {
    expect(validateTarget("https://bbs.dbhq.uk/gw/fetch").ok).toBe(false);
  });

  it("rejects a URL longer than the cap", () => {
    expect(validateTarget("https://example.com/" + "a".repeat(5000)).ok).toBe(false);
  });
});

describe("safeFetch under attack", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stub(handler: (url: string) => Response) {
    globalThis.fetch = ((input: RequestInfo | URL) =>
      Promise.resolve(handler(String(input)))) as typeof fetch;
  }

  it("refuses a redirect loop rather than following it forever", async () => {
    let hops = 0;
    stub(() => {
      hops++;
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/${hops}` },
      });
    });
    const r = await safeFetch("https://example.com/start");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too many redirects");
    expect(hops).toBeLessThanOrEqual(MAX_REDIRECTS + 1);
  });

  it("re-validates every hop, so a redirect cannot reach a private address", async () => {
    stub((url) =>
      url.includes("start")
        ? new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          })
        : new Response("secrets", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
    );
    const r = await safeFetch("https://example.com/start");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("private address");
  });

  it("rejects a body that declares an honest oversized length", async () => {
    stub(
      () =>
        new Response("x", {
          status: 200,
          headers: {
            "content-type": "text/html",
            "content-length": String(MAX_BYTES + 1),
          },
        }),
    );
    const r = await safeFetch("https://example.com/big");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too large");
  });

  it("rejects a decompression bomb that lies about its length", async () => {
    // Declares nothing, then streams past the cap. This is why the byte
    // count is enforced again while reading and not only from the header.
    const stream = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(256 * 1024));
      },
    });
    stub(
      () => new Response(stream, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const r = await safeFetch("https://example.com/bomb");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too large");
  });

  it("rejects a content type outside the allowlist", async () => {
    stub(
      () =>
        new Response("MZ", {
          status: 200,
          headers: { "content-type": "application/x-msdownload" },
        }),
    );
    expect((await safeFetch("https://example.com/x.exe")).ok).toBe(false);
  });

  it("does not forward caller cookies or authorization", async () => {
    let sent: Headers | undefined;
    globalThis.fetch = ((_i: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return Promise.resolve(
        new Response("<p>ok</p>", { status: 200, headers: { "content-type": "text/html" } }),
      );
    }) as typeof fetch;
    await safeFetch("https://example.com/");
    expect(sent?.get("cookie")).toBeNull();
    expect(sent?.get("authorization")).toBeNull();
  });
});

describe("session tokens", () => {
  const SECRET = "test-secret-not-the-real-one";

  it("round trips a signed token", async () => {
    const t = await signToken(SECRET, { sub: "abc", exp: Date.now() + 60_000, n: 0 });
    const v = await verifyToken(SECRET, t);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.claims.sub).toBe("abc");
  });

  it("rejects a tampered token", async () => {
    const t = await signToken(SECRET, { sub: "abc", exp: Date.now() + 60_000, n: 0 });
    const parts = t.split(".");
    const tampered = `${parts[0]}.${btoa('{"sub":"evil","exp":9999999999999,"n":0}')}.${parts[2]}`;
    expect((await verifyToken(SECRET, tampered)).ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const t = await signToken(SECRET, { sub: "abc", exp: Date.now() - 1000, n: 0 });
    const v = await verifyToken(SECRET, t);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("rejects a token signed with a different secret", async () => {
    const t = await signToken("other-secret", { sub: "abc", exp: Date.now() + 60_000, n: 0 });
    expect((await verifyToken(SECRET, t)).ok).toBe(false);
  });

  it("has an allowance with headroom, because KV accounting is approximate", () => {
    expect(ALLOWANCE.requestsPerSession).toBeGreaterThanOrEqual(200);
    expect(ALLOWANCE.requestsPerMinute).toBeGreaterThanOrEqual(20);
    expect(ALLOWANCE.sessionMinutes).toBeGreaterThanOrEqual(20);
  });

  it("decodes claims without verifying, for the status line", () => {
    const c = decodeToken("x." + btoa('{"sub":"s","exp":123,"n":5}') + ".y");
    expect(c?.n).toBe(5);
  });
});

describe("ANSI art files", () => {
  it("recognises art extensions", () => {
    for (const u of [
      "http://artscene.textfiles.com/ansi/bbs/1014.ans",
      "http://x.test/a.ASC",
      "http://x.test/deep/path/file.nfo",
      "http://x.test/file.diz",
    ]) {
      expect(artTypeFor(u), u).toBe(ANSI_TYPE);
    }
  });

  it("ignores anything that is not art", () => {
    for (const u of [
      "http://x.test/index.html",
      "http://x.test/a.ans.html",
      "http://x.test/ans",
      "not a url",
      "",
    ]) {
      expect(artTypeFor(u), u).toBe("");
    }
  });

  it("looks at the path, not the query, so ?x=.ans proves nothing", () => {
    expect(artTypeFor("http://x.test/page.html?download=art.ans")).toBe("");
  });

  it("is a fallback for a missing type, never an override of a real one", () => {
    // This is the security property. The extension is only consulted when
    // the server declares NOTHING; a server that says text/html is believed
    // even at an .ans path. Otherwise renaming a path would smuggle a
    // disallowed type past the allowlist.
    const src = readFileSync(
      new URL("../functions/_lib/fetchsafe.ts", import.meta.url).pathname,
      "utf8",
    );
    expect(src).toContain("declaredType || artTypeFor(current)");
    expect(src).not.toContain("artTypeFor(current) || declaredType");
  });
});

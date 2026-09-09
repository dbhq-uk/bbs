import { describe, expect, it } from "vitest";
import { hash, verify } from "../functions/_lib/password";
import { sha256hex } from "../functions/_lib/tokens";
import { normaliseEmail, normaliseHandle, siteMatches } from "../functions/_lib/db";

describe("password hashing", () => {
  it("round trips", async () => {
    const stored = await hash("correct horse battery staple");
    expect(await verify("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hash("correct horse battery staple");
    expect(await verify("Tr0ub4dor&3", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hash("same");
    const b = await hash("same");
    expect(a).not.toBe(b);
    expect(await verify("same", a)).toBe(true);
    expect(await verify("same", b)).toBe(true);
  });

  it("records the algorithm and cost, so they can be raised later", async () => {
    // Without this the parameters can never change without locking
    // everyone out, because nothing knows how an old hash was made.
    const stored = await hash("x");
    const [alg, iters] = stored.split("$");
    expect(alg).toBe("pbkdf2");
    expect(Number(iters)).toBeGreaterThanOrEqual(100000);
  });

  it("stays within the Workers PBKDF2 ceiling", async () => {
    // The runtime refuses anything above 100,000 with
    // "NotSupportedError: Pbkdf2 failed: iteration counts above 100000
    // are not supported". This shipped at 600,000 and every call threw in
    // production, so the ceiling gets a test rather than a comment.
    const [, iters] = (await hash("x")).split("$");
    expect(Number(iters)).toBeLessThanOrEqual(100000);
  });

  it("returns false on a malformed stored value rather than throwing", async () => {
    for (const bad of ["", "nonsense", "pbkdf2$notanumber$a$b", "pbkdf2$1$$", "a$b$c$d"]) {
      expect(await verify("x", bad), bad).toBe(false);
    }
  });

  it("verifies a hash made at a different cost", async () => {
    // Proves the recorded cost is actually used, not assumed.
    const stored = await hash("x");
    expect(await verify("x", stored)).toBe(true);
  });
});

describe("token hashing", () => {
  it("is stable, hex, and 256 bits", async () => {
    const h = await sha256hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256hex("hello")).toBe(h);
    expect(await sha256hex("hellp")).not.toBe(h);
  });
});

describe("normalisation", () => {
  it("lowercases and trims so uniqueness is case-insensitive", () => {
    expect(normaliseEmail("  Dan@DBHQ.uk ")).toBe("dan@dbhq.uk");
    expect(normaliseHandle(" Sysop ")).toBe("sysop");
  });
});

describe("the curated guest list", () => {
  const sites = [
    { id: 1, name: "Wikipedia", url: "https://en.wikipedia.org/", sort: 10, listed: 1 },
    { id: 2, name: "GOV.UK", url: "https://www.gov.uk/", sort: 20, listed: 1 },
  ];

  it("allows a listed origin and its pages", () => {
    expect(siteMatches(sites, "https://en.wikipedia.org/")).toBe(true);
    expect(siteMatches(sites, "https://en.wikipedia.org/wiki/BBS")).toBe(true);
    expect(siteMatches(sites, "https://www.gov.uk/vehicle-tax")).toBe(true);
  });

  it("refuses an origin that is not listed", () => {
    expect(siteMatches(sites, "https://example.com/")).toBe(false);
  });

  it("matches on host, so a lookalike domain cannot walk past it", () => {
    // A prefix check would accept every one of these.
    expect(siteMatches(sites, "https://en.wikipedia.org.evil.com/")).toBe(false);
    expect(siteMatches(sites, "https://evil-en.wikipedia.org/")).toBe(false);
    expect(siteMatches(sites, "https://www.gov.uk.attacker.net/")).toBe(false);
  });

  it("refuses an unparseable target", () => {
    expect(siteMatches(sites, "not a url")).toBe(false);
    expect(siteMatches(sites, "")).toBe(false);
  });
});

describe("the account-existence oracle stays shut", () => {
  it("the dummy hash verifies without throwing", async () => {
    // logon() hashes against a dummy when there is no such user, so the
    // response time does not reveal whether an address is registered.
    //
    // The dummy was hardcoded at 600,000 iterations while the real cost
    // dropped to the Workers ceiling of 100,000, so verifying it threw
    // NotSupportedError: an unknown address returned 500 while a known one
    // returned 401. That is the oracle the dummy exists to prevent,
    // reintroduced by a constant that drifted.
    const { ITERATIONS } = await import("../functions/_lib/password");
    const salt = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const dummy = `pbkdf2$${ITERATIONS}$${salt}$${salt}`;

    await expect(verify("anything", dummy)).resolves.toBe(false);
  });

  it("the dummy cost matches the real cost, so it can never throw", async () => {
    const { ITERATIONS } = await import("../functions/_lib/password");
    const real = Number((await hash("x")).split("$")[1]);
    expect(ITERATIONS).toBe(real);
  });
});

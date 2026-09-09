import { describe, expect, it } from "vitest";
import { mayFetch } from "../functions/gw/[[path]]";
import { validateRegistration } from "../functions/auth/register";
import { allowanceFor } from "../functions/_lib/session";

const sites = [
  { id: 1, name: "Wikipedia", url: "https://en.wikipedia.org/", sort: 10, listed: 1 },
];

const guest = { sub: "s", userId: null, handle: "GUEST", sl: 10, flags: "" };
const member = { sub: "s", userId: "u", handle: "Dan", sl: 20, flags: "VG" };
const sysop = { sub: "s", userId: "u", handle: "Sysop", sl: 100, flags: "VGPS" };
const twit = { sub: "s", userId: "u", handle: "Nuisance", sl: 0, flags: "" };

describe("who may fetch what", () => {
  it("refuses anyone who is not logged on at all", () => {
    const r = mayFetch(null, "https://en.wikipedia.org/", sites);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_session");
  });

  it("lets a guest reach the curated list", () => {
    expect(mayFetch(guest, "https://en.wikipedia.org/wiki/BBS", sites).ok).toBe(true);
  });

  it("refuses a guest anything off the list", () => {
    const r = mayFetch(guest, "https://example.com/", sites);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("members_only");
  });

  it("lets a member reach anything", () => {
    expect(mayFetch(member, "https://example.com/", sites).ok).toBe(true);
    expect(mayFetch(sysop, "https://example.com/", sites).ok).toBe(true);
  });

  it("refuses a member whose gateway flag was revoked, without demoting them", () => {
    // The reason flags exist alongside levels: a sanction that closes one
    // door rather than taking the whole board away.
    const revoked = { ...member, flags: "V" };
    expect(mayFetch(revoked, "https://example.com/", sites).ok).toBe(false);
    expect(mayFetch(revoked, "https://en.wikipedia.org/", sites).ok).toBe(true);
  });

  it("refuses a twit everything, including the curated list", () => {
    const r = mayFetch(twit, "https://en.wikipedia.org/", sites);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("access_denied");
  });

  it("does not let a lookalike domain past the guest list", () => {
    expect(mayFetch(guest, "https://en.wikipedia.org.evil.com/", sites).ok).toBe(false);
  });
});

describe("registration input", () => {
  const good = { handle: "Sysop", email: "dan@dbhq.uk", password: "a-long-enough-one" };

  it("accepts a reasonable application", () => {
    expect(validateRegistration(good).ok).toBe(true);
  });

  it("requires a handle a board could display", () => {
    for (const h of ["", "ab", "x".repeat(21)]) {
      expect(validateRegistration({ ...good, handle: h }).ok, h).toBe(false);
    }
  });

  it("refuses a handle CP437 cannot render", () => {
    // The handle appears on an 80x25 CP437 screen. One that arrives as
    // question marks is not a handle.
    expect(validateRegistration({ ...good, handle: "日本" }).ok).toBe(false);
    expect(validateRegistration({ ...good, handle: "Dan Grimes" }).ok).toBe(false);
    expect(validateRegistration({ ...good, handle: "Dan_Grimes" }).ok).toBe(true);
  });

  it("requires something that looks like an email", () => {
    expect(validateRegistration({ ...good, email: "nope" }).ok).toBe(false);
    expect(validateRegistration({ ...good, email: "a@b" }).ok).toBe(false);
    expect(validateRegistration({ ...good, email: "a@b.uk" }).ok).toBe(true);
  });

  it("requires a password long enough to be worth hashing, and caps it", () => {
    expect(validateRegistration({ ...good, password: "short" }).ok).toBe(false);
    expect(validateRegistration({ ...good, password: "x".repeat(12) }).ok).toBe(true);
    expect(validateRegistration({ ...good, password: "x".repeat(1025) }).ok).toBe(false);
  });

  it("returns codes, not sentences, because the core owns the wording", () => {
    const r = validateRegistration({ ...good, handle: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^[a-z_]+$/);
  });
});

describe("allowance by level", () => {
  it("gives a member more than a guest, and a twit nothing", () => {
    expect(allowanceFor(20)).toBeGreaterThan(allowanceFor(10));
    expect(allowanceFor(0)).toBe(0);
  });

  it("does not give a guest zero, because the curated list must work", () => {
    expect(allowanceFor(10)).toBeGreaterThan(0);
  });

  it("is monotonic, so a promotion never costs you allowance", () => {
    const levels = [0, 10, 20, 100];
    for (let i = 1; i < levels.length; i++) {
      expect(allowanceFor(levels[i])).toBeGreaterThanOrEqual(allowanceFor(levels[i - 1]));
    }
  });
});

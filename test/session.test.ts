import { describe, expect, it } from "vitest";
import { allowanceFor, mint, read } from "../functions/_lib/session";

/// A token is only half a session. The other half is the `sess:<sub>`
/// record in KV that carries the level and flags, and a token without it
/// verifies perfectly and is then refused at the gate.
///
/// That shipped: /session signed a token and wrote no record, so every
/// guest got `no_session` on their first fetch and the whole guest tier was
/// shut in production while the full suite passed. These tests exercise the
/// round trip rather than either half on its own, because each half was
/// individually correct.
function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
  } as unknown as KVNamespace & { store: Map<string, string> };
}

const env = () => ({ SESSION_SECRET: "test-secret", QUOTA: fakeKv() });

describe("the session round trip", () => {
  it("mints a guest session the gate accepts", async () => {
    const e = env();
    const session = await read(e, await mint(e, null));

    expect(session).not.toBeNull();
    expect(session!.handle).toBe("GUEST");
    expect(session!.sl).toBe(10);
  });

  it("mints a member session carrying their level and flags", async () => {
    const e = env();
    const user = { id: "u1", handle: "dan", sl: 20, flags: "G" };
    const session = await read(e, await mint(e, user as never));

    expect(session!.userId).toBe("u1");
    expect(session!.sl).toBe(20);
    expect(session!.flags).toBe("G");
  });

  it("writes the KV record, not just a token", async () => {
    // The exact omission that closed the guest tier.
    const e = env();
    await mint(e, null);
    const keys = [...(e.QUOTA as unknown as { store: Map<string, string> }).store.keys()];
    expect(keys.some((k) => k.startsWith("sess:"))).toBe(true);
  });

  it("refuses a well-formed token with no record behind it", async () => {
    // A revoked or expired session looks exactly like the broken mint did.
    const e = env();
    const token = await mint(e, null);
    (e.QUOTA as unknown as { store: Map<string, string> }).store.clear();
    expect(await read(e, token)).toBeNull();
  });

  it("refuses a token signed with another secret", async () => {
    const a = env();
    const token = await mint(a, null);
    expect(await read({ ...a, SESSION_SECRET: "different" }, token)).toBeNull();
  });

  it("is the only session minter, so the wrong one cannot be imported", async () => {
    // quota.ts used to export a rival mintSession() under an almost
    // identical name that signed a token and wrote no record. Having two
    // is what made picking the broken one easy.
    const quota = await import("../functions/_lib/quota");
    expect(Object.keys(quota)).not.toContain("mintSession");
  });
});

describe("the allowance follows the level", () => {
  it("gives a guest less than a member and a member less than a sysop", () => {
    expect(allowanceFor(10)).toBeLessThan(allowanceFor(20));
    expect(allowanceFor(20)).toBeLessThan(allowanceFor(100));
  });

  it("gives a TWIT nothing", () => {
    expect(allowanceFor(0)).toBe(0);
  });

  it("is monotonic, so a promotion never costs allowance", () => {
    let last = -1;
    for (let sl = 0; sl <= 100; sl++) {
      expect(allowanceFor(sl), `sl ${sl}`).toBeGreaterThanOrEqual(last);
      last = allowanceFor(sl);
    }
  });
});

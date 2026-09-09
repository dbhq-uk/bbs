import { afterEach, describe, expect, it, vi } from "vitest";
import { sendConfirm, sendReset } from "../functions/_lib/mail";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function captureFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(status === 200 ? '{"id":"x"}' : "denied", { status }),
    );
  }) as unknown as typeof fetch;
  return calls;
}

const body = (calls: { init: RequestInit }[]) =>
  JSON.parse(calls[0].init.body as string);

describe("outbound mail", () => {
  it("sends nothing when no key is configured", async () => {
    const calls = captureFetch();
    expect(await sendConfirm({}, "a@example.com", "dan", "tok")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("posts to Resend with the token in a confirm link", async () => {
    const calls = captureFetch();
    const ok = await sendConfirm({ RESEND_API_KEY: "k" }, "a@example.com", "dan", "tok123");

    expect(ok).toBe(true);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer k");

    const sent = body(calls);
    expect(sent.to).toEqual(["a@example.com"]);
    expect(sent.text).toContain("https://bbs.dbhq.uk/?confirm=tok123");
    expect(sent.text).toContain("dan");
  });

  it("uses a reset link for a reset, not a confirm link", async () => {
    // The two mails are one function apart and were easy to cross-wire.
    const calls = captureFetch();
    await sendReset({ RESEND_API_KEY: "k" }, "a@example.com", "dan", "tok456");

    const sent = body(calls);
    expect(sent.text).toContain("?reset=tok456");
    expect(sent.text).not.toContain("?confirm=");
  });

  it("url-encodes the token, so a padded base64url token survives", async () => {
    const calls = captureFetch();
    await sendConfirm({ RESEND_API_KEY: "k" }, "a@example.com", "dan", "a+b/c=");
    expect(body(calls).text).toContain("a%2Bb%2Fc%3D");
  });

  it("reports failure without throwing when Resend refuses", async () => {
    // Registration must still return its usual response: whether mail went
    // out tells an anonymous caller whether the address is registered.
    captureFetch(422);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendConfirm({ RESEND_API_KEY: "k" }, "a@example.com", "dan", "t")).toBe(false);
    // Silence here is the trap: `confirm_sent` with nothing arriving looks
    // exactly like a spam filter unless the reason is recorded.
    expect(spy).toHaveBeenCalled();
  });

  it("reports failure without throwing when the network does", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendConfirm({ RESEND_API_KEY: "k" }, "a@example.com", "dan", "t")).toBe(false);
  });

  it("honours BOARD_URL, so a preview does not mail production links", async () => {
    const calls = captureFetch();
    await sendConfirm(
      { RESEND_API_KEY: "k", BOARD_URL: "https://preview.example" },
      "a@example.com",
      "dan",
      "t",
    );
    expect(body(calls).text).toContain("https://preview.example/?confirm=t");
  });
});

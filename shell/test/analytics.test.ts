import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

// The analytics notice and opt-out, pinned. The pattern is the estate's, and
// is written up in dbhq/docs/reference/analytics.md under "Analytics notice
// and opt-out": GA4 on by default with the ad signals denied, a non-modal
// notice with an "Opt out" as prominent as "OK", and the choice kept in a
// dbhq_analytics cookie on .dbhq.uk so opting out here opts out everywhere.

const GATE = readFileSync("public/analytics.js", "utf8");
const NOTICE = readFileSync("public/consent.js", "utf8");
const PAGES = ["index.html", "about/index.html", "ascii-art-generator/index.html"];
const CURRENT_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

type Board = {
  window: JSDOM["window"] & Record<string, any>;
  cookieWrites: string[];
  gaTags: () => number;
  pushed: () => unknown[][];
};

/// One page of the board, as a browser on `host` would run it: the gate, then
/// the notice, against the real markup of the home page.
function visit(opts: { host?: string; ua?: string; before?: (w: any) => void } = {}): Board {
  const html = readFileSync("index.html", "utf8");
  const dom = new JSDOM(html, {
    url: `https://${opts.host ?? "bbs.dbhq.uk"}/`,
    // No `resources`: jsdom then fetches nothing, so the tag the gate adds is
    // counted in the DOM and never requested.
    runScripts: "outside-only",
  });
  const w = dom.window as Board["window"];
  const ua = opts.ua ?? CURRENT_CHROME;
  Object.defineProperty(w.navigator, "userAgent", { get: () => ua });
  const cookieWrites: string[] = [];
  const real = Object.getOwnPropertyDescriptor(w.Document.prototype, "cookie")!;
  Object.defineProperty(w.document, "cookie", {
    configurable: true,
    get: () => real.get!.call(w.document),
    set: (v: string) => { cookieWrites.push(v); real.set!.call(w.document, v); },
  });
  opts.before?.(w);
  w.eval(GATE);
  w.eval(NOTICE);
  return {
    window: w,
    cookieWrites,
    gaTags: () => w.document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length,
    pushed: () => (w.dataLayer as ArrayLike<unknown>[]).map((a) => Array.from(a)),
  };
}

describe("the gate", () => {
  it("loads GA4 for a new visitor with the analytics-only consent and config", () => {
    const b = visit();
    expect(b.gaTags()).toBe(1);
    expect(b.pushed()).toContainEqual([
      "consent", "default",
      { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" },
    ]);
    expect(b.pushed()).toContainEqual([
      "config", "G-3H3NFGSX85",
      { allow_google_signals: false, allow_ad_personalization_signals: false },
    ]);
  });

  it("loads nothing off the live host", () => {
    expect(visit({ host: "bbs.dbhq-uk.workers.dev" }).gaTags()).toBe(0);
    expect(visit({ host: "localhost" }).gaTags()).toBe(0);
  });

  it("loads nothing for stale desktop Chrome, which is how scrapers look", () => {
    expect(visit({ ua: CURRENT_CHROME.replace("Chrome/141", "Chrome/118") }).gaTags()).toBe(0);
  });

  it("loads nothing for a visitor who opted out", () => {
    const b = visit({ before: (w) => { w.document.cookie = "dbhq_analytics=off; Path=/"; } });
    expect(b.gaTags()).toBe(0);
  });

  it("honours a decline from the old opt-in prompt and moves it onto the estate cookie", () => {
    const b = visit({ before: (w) => w.localStorage.setItem("dbhq-consent", "denied") });
    expect(b.gaTags()).toBe(0);
    expect(b.window.localStorage.getItem("dbhq-consent")).toBeNull();
    expect(b.cookieWrites).toContainEqual(expect.stringMatching(/^dbhq_analytics=off;.*Domain=dbhq\.uk/));
  });

  it("opting out writes off on .dbhq.uk, sets ga-disable and expires _ga", () => {
    const b = visit({ before: (w) => { w.document.cookie = "_ga=GA1.1.1.1; Path=/"; } });
    b.window.dbhqAnalytics.optOut();
    const write = b.cookieWrites.find((c) => c.startsWith("dbhq_analytics="))!;
    expect(write).toBe("dbhq_analytics=off; Max-Age=31536000; Path=/; SameSite=Lax; Secure; Domain=dbhq.uk");
    expect(b.window["ga-disable-G-3H3NFGSX85"]).toBe(true);
    expect(b.pushed()).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect(b.cookieWrites).toContainEqual(expect.stringMatching(/^_ga=; expires=Thu, 01 Jan 1970.*domain=\.dbhq\.uk$/));
    expect(b.window.document.cookie).not.toMatch(/(^|; )_ga=/);
  });

  it("turning back on clears ga-disable and loads GA4 on the spot", () => {
    const b = visit({ before: (w) => { w.document.cookie = "dbhq_analytics=off; Path=/"; } });
    b.window.dbhqAnalytics.keepOn();
    expect(b.window["ga-disable-G-3H3NFGSX85"]).toBe(false);
    expect(b.gaTags()).toBe(1);
    expect(b.cookieWrites).toContainEqual(expect.stringMatching(/^dbhq_analytics=on;.*Domain=dbhq\.uk/));
  });
});

describe("the notice", () => {
  it("shows to a new visitor without taking focus", () => {
    const b = visit();
    const box = b.window.document.querySelector("[data-analytics-notice]")!;
    expect(box.hasAttribute("hidden")).toBe(false);
    expect(b.window.document.activeElement).toBe(b.window.document.body);
  });

  it("stays hidden once a choice is stored", () => {
    const b = visit({ before: (w) => { w.document.cookie = "dbhq_analytics=on; Path=/"; } });
    expect(b.window.document.querySelector("[data-analytics-notice]")!.hasAttribute("hidden")).toBe(true);
  });

  it("Cookie settings reopens it, saying analytics is off and offering to turn it back on", () => {
    const b = visit();
    const d = b.window.document;
    (d.querySelector("[data-analytics-off]") as HTMLButtonElement).click();
    expect(d.querySelector("[data-analytics-notice]")!.hasAttribute("hidden")).toBe(true);
    const settings = d.querySelector("footer [data-analytics-settings]") as HTMLButtonElement;
    expect(settings.hidden).toBe(false);
    settings.click();
    expect(d.querySelector("[data-analytics-notice]")!.hasAttribute("hidden")).toBe(false);
    expect(d.querySelector("[data-analytics-status]")!.textContent).toBe("Analytics is off in this browser.");
    expect(d.querySelector("[data-analytics-on]")!.textContent).toBe("Turn back on");
  });

  it("keeps its keys from the board, which cancels Enter and Space on window", () => {
    const b = visit();
    let reachedBoard = false;
    b.window.addEventListener("keydown", () => { reachedBoard = true; });
    const ok = b.window.document.querySelector("[data-analytics-on]")!;
    ok.dispatchEvent(new b.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(reachedBoard).toBe(false);
  });
});

describe.each(PAGES)("%s", (page) => {
  const html = readFileSync(page, "utf8");
  const doc = new JSDOM(html).window.document;

  it("draws the notice non-modal, not as a <dialog>", () => {
    expect(doc.querySelector("dialog")).toBeNull();
    expect(html).not.toContain("showModal");
    const box = doc.querySelector("[data-analytics-notice]")!;
    expect(box.tagName).toBe("ASIDE");
    expect(box.getAttribute("aria-modal")).toBeNull();
  });

  it("offers Opt out beside OK, and links how it works", () => {
    expect(doc.querySelector("[data-analytics-off]")!.textContent).toBe("Opt out");
    expect(doc.querySelector("[data-analytics-on]")!.textContent).toBe("OK");
    expect(doc.querySelector('[data-analytics-notice] a[href="https://dbhq.uk/privacy/#analytics"]')).not.toBeNull();
  });

  it("has Cookie settings in the footer, hidden until the script runs", () => {
    const b = doc.querySelector("footer [data-analytics-settings]") as HTMLButtonElement;
    expect(b.textContent).toBe("Cookie settings");
    expect(b.hasAttribute("hidden")).toBe(true);
  });

  it("loads the gate before the notice", () => {
    const srcs = Array.from(doc.querySelectorAll("script[src]")).map((s) => s.getAttribute("src"));
    expect(srcs.indexOf("/analytics.js")).toBeGreaterThanOrEqual(0);
    expect(srcs.indexOf("/analytics.js")).toBeLessThan(srcs.indexOf("/consent.js"));
  });
});

describe("site.css", () => {
  const css = readFileSync("public/site.css", "utf8");
  it("draws Opt out and OK from one rule, so neither is more prominent", () => {
    expect(css).toMatch(/\.analytics-notice-actions button \{/);
    expect(css).not.toMatch(/data-analytics-(on|off)\]/);
    expect(css).not.toContain("::backdrop");
  });
});

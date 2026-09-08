import init, { font_bytes, render_art, render_document, render_image, render_lines, version }
  from "bbs-core";
import { Terminal, COLS, ROWS, type Screen } from "./terminal";
import { onKey } from "./keyboard";
import { nextState, type State } from "./board/state";
import {
  conferenceScreen,


  webScreen,
  NO_DOCUMENT,
  type Item,
} from "./board/screens";
import { loadConference } from "./board/conference";
import { fetchImage, openUrl, type WebResult } from "./board/web";
import { CONFERENCES } from "./conferences";
import { haveSession, openSession, type Meter } from "./gw";
import { loginArt, menuArt, type Art } from "./board/art";
import { meterLine } from "./board/screens";

let term: Terminal;
let state: State = { screen: "login" };
let meter: Meter | null = null;
let items: Item[] = [];
let doc: Extract<WebResult, { ok: true }> | null = null;
/// Typed input for the URL prompt and for multi-digit item numbers.
let input = "";
let status = "";

const wasm = { render_document, render_image };

async function boot() {
  await init();
  console.log(`bbs core ${version()}`);

  const canvas = document.querySelector<HTMLCanvasElement>("#screen")!;
  term = new Terminal(canvas, font_bytes());
  redraw();

  onKey(handleKey);
  await openTurnstileSession();
  redraw();

  // Deep link: ?url=... opens the gateway straight onto a page, so a
  // rendered view can be shared as an ordinary link.
  const deep = new URLSearchParams(location.search).get("url");
  if (deep) await go(deep);
}

/// Renders the widget, waits for a token, exchanges it for a session. One
/// challenge per session, not per request.
async function openTurnstileSession(): Promise<void> {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!key) {
    status = "GATEWAY OFFLINE - CONFERENCES ONLY";
    return;
  }
  // The api.js tag is async defer, so `turnstile` can exist as a partial
  // object before `render` is attached. Calling it early throws
  // "t.render is not a function" and the session is never opened.
  const ts = await loadTurnstile();
  if (!ts) {
    // Turnstile did not initialise - blocked, offline, or an automation
    // browser. Try the exchange anyway and let the Worker's secret decide.
    //
    // This is safe because it fails closed: locally the Worker holds
    // Cloudflare's documented always-passes test secret, so a session is
    // issued and the gateway works; in production it holds the real
    // secret, which rejects any token that did not come from a solved
    // challenge, so this path just reports the gateway offline.
    try {
      await openSession("");
      status = "";
    } catch {
      status = "GATEWAY OFFLINE - CONFERENCES ONLY";
    }
    return;
  }

  return new Promise((resolve) => {
    const id = ts.render("#turnstile", {
      sitekey: key,
      callback: async (token: string) => {
        try {
          await openSession(token);
          status = "";
        } catch {
          status = "NO CARRIER - GATEWAY OFFLINE";
        }
        redraw();
        resolve();
      },
      "error-callback": () => {
        status = "NO CARRIER - GATEWAY OFFLINE";
        redraw();
        resolve();
      },
    });

    // An invisible widget does not always run on render alone. Asking it
    // to execute is harmless when it has already started.
    try {
      (ts as any).execute?.(id);
    } catch {
      // Already executing, which is fine.
    }

    // Never hang the board on a challenge that will not resolve.
    setTimeout(() => {
      if (!haveSession()) {
        status = "GATEWAY OFFLINE - CONFERENCES ONLY";
        redraw();
      }
      resolve();
    }, 15000);
  });
}

/// Loads Turnstile from here, rather than from a tag in the HTML.
///
/// A tag in the HTML is a race we lose. api.js is async and this module is
/// deferred, so api.js ran first, looked for its onload callback before
/// this module had installed one, and logged "Unable to find onload
/// callback ... got undefined". An inline script would fix the ordering
/// but the CSP forbids inline script and adding 'unsafe-inline' to buy a
/// convenience is a bad trade.
///
/// Injecting the tag from here removes the race entirely: the callback is
/// installed first, by construction, because this code installs it before
/// it creates the element.
function loadTurnstile(timeoutMs = 12000): Promise<{ render: Function } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { render: Function } | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const ready = () => {
      const ts = (globalThis as Record<string, any>).turnstile;
      return ts && typeof ts.render === "function" ? ts : null;
    };

    // Already there, if the module ran after a cached load.
    const now = ready();
    if (now) return finish(now);

    (globalThis as Record<string, any>).onloadTurnstileCallback = () => finish(ready());

    const el = document.createElement("script");
    el.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js" +
      "?render=explicit&onload=onloadTurnstileCallback";
    el.async = true;
    el.onerror = () => finish(null);
    document.head.appendChild(el);

    // Belt and braces: if the callback never fires but the API appears
    // anyway, take it.
    const started = Date.now();
    const tick = () => {
      if (done) return;
      const ts = ready();
      if (ts) return finish(ts);
      if (Date.now() - started > timeoutMs) return finish(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function handleKey(key: string) {
  // Screens with a text prompt consume keys before navigation sees them.
  if (state.screen === "web" || state.screen === "conference") {
    if (key === "Enter") return void (await submitInput());
    if (key === "Backspace") {
      input = input.slice(0, -1);
      return redraw();
    }
    if (key.length === 1 && key !== "Q" && !(state.screen === "conference" && "NP".includes(key))) {
      input += key;
      return redraw();
    }
  }

  const before = state.screen;
  state = nextState(state, key);

  if (state.screen !== before) {
    input = "";
    status = "";
    if (state.screen === "conference") await enterConference(state.id);
  }
  redraw();
}

async function submitInput() {
  const typed = input.trim();
  input = "";
  if (!typed) return redraw();

  if (state.screen === "web") return void (await go(typed));

  const n = Number(typed);
  if (Number.isInteger(n) && n >= 1 && n <= items.length) {
    await go(items[n - 1].url);
  } else {
    status = "NO SUCH ITEM";
    redraw();
  }
}

async function enterConference(id: string) {
  const c = CONFERENCES.find((c) => c.id === id)!;
  items = [];
  status = "LOADING...";
  redraw();
  try {
    items = await loadConference(c);
    status = "";
  } catch {
    status = NO_DOCUMENT;
  }
}

/// Opens a URL through the W door, then fetches and appends its images.
async function go(url: string) {
  status = "CONNECTING...";
  redraw();

  const result = await openUrl(url, wasm);
  if (!result.ok) {
    status = result.message;
    return redraw();
  }

  doc = result;
  meter = result.meter;
  state = { screen: "reading", page: 0 };
  status = "";
  redraw();

  // Images are fetched after the text is on screen, so the reader is never
  // waiting on them, and each is appended as its own page.
  for (const img of result.images.slice(0, 4)) {
    const screen = await fetchImage(img.src, result.finalUrl, wasm);
    if (screen && doc) {
      doc.pages.push(screen);
      redraw();
    }
  }
}

function redraw() {
  if (!term) return;
  // Bound to a const so TypeScript can narrow it; a module-level `let` is
  // not narrowed inside the switch.
  const s = state;
  switch (s.screen) {
    case "login":
      return art(loginArt(meter ? meterLine(meter) : "", status));
    case "menu":
      return art(menuArt(CONFERENCES, meter ? meterLine(meter) : "", status, input));
    case "web":
      return paint(webScreen(input, status, meter));
    case "conference": {
      const c = CONFERENCES.find((x) => x.id === s.id)!;
      return paint(conferenceScreen(c.name, items, s.page, input, status));
    }
    case "reading": {
      const screen = doc?.pages[s.page];
      // Document screens arrive from the core already as cells and are
      // blitted straight out.
      if (!screen) return paint(["", "   " + NO_DOCUMENT]);
      return term.draw(screen);
    }
  }
}

/// Paints a coloured art screen. The core does the CP437 folding.
function art(a: Art) {
  term.draw(render_art(a.lines, a.fg, a.bg, COLS, ROWS) as Screen);
}

/// Paints plain lines. The core does the CP437 folding so the shell never
/// has to know about code pages.
function paint(lines: string[]) {
  const colours = lines.map((l) =>
    l.includes("b b s") ? 11 : l.trimStart().startsWith("W)") ? 14 : 7,
  );
  term.draw(render_lines(lines, new Uint8Array(colours), COLS, ROWS) as Screen);
}

boot();

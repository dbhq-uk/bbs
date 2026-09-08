import init, { font_bytes, render_document, render_image, render_lines, version }
  from "bbs-core";
import { Terminal, COLS, ROWS, type Screen } from "./terminal";
import { onKey } from "./keyboard";
import { nextState, type State } from "./board/state";
import {
  conferenceScreen,
  loginScreen,
  menuScreen,
  webScreen,
  NO_DOCUMENT,
  type Item,
} from "./board/screens";
import { loadConference } from "./board/conference";
import { fetchImage, openUrl, type WebResult } from "./board/web";
import { CONFERENCES } from "./conferences";
import { openSession, type Meter } from "./gw";

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
}

/// Renders the widget, waits for a token, exchanges it for a session. One
/// challenge per session, not per request.
function openTurnstileSession(): Promise<void> {
  return new Promise((resolve) => {
    const ts = (globalThis as Record<string, any>).turnstile;
    const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!ts || !key) {
      status = "GATEWAY OFFLINE - CONFERENCES ONLY";
      return resolve();
    }
    ts.render("#turnstile", {
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
    });
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
      return paint(loginScreen(meter, status));
    case "menu":
      return paint(menuScreen(meter, status));
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

/// Paints plain lines. The core does the CP437 folding so the shell never
/// has to know about code pages.
function paint(lines: string[]) {
  const colours = lines.map((l) =>
    l.includes("b b s") ? 11 : l.trimStart().startsWith("W)") ? 14 : 7,
  );
  term.draw(render_lines(lines, new Uint8Array(colours), COLS, ROWS) as Screen);
}

boot();

import { CONFERENCES } from "../conferences";
import type { Meter } from "../gw";

/// The failure the spec specifies. Containment is what lets an unwinnable
/// fight with the open web read as a joke rather than as a bug.
export const NO_DOCUMENT = "REMOTE SYSTEM RETURNED NO READABLE DOCUMENT";

/// Turns a relay error code into something a caller can act on.
///
/// The Worker returns machine codes and never presentation; this is where
/// they become the board's voice. A raw code on screen tells the reader
/// nothing about what to do next, which is what "(no session)" was doing.
export function gatewayMessage(reason: string): string {
  switch (reason) {
    case "no session":
    case "no_session":
      return "CARRIER NOT ESTABLISHED - RELOAD TO REDIAL";
    case "expired":
      return "YOUR CALL HAS TIMED OUT - RELOAD TO REDIAL";
    case "session spent":
      return "NO REQUESTS LEFT THIS CALL - RELOAD TO REDIAL";
    case "rate":
    case "ip":
    case "global":
      return "SYSTEM BUSY - TRY AGAIN IN A MOMENT";
    case "target":
      return "THAT SITE HAS HAD ENOUGH OF US - TRY ANOTHER";
    case "members_only":
      return "MEMBERS ONLY - THAT ADDRESS IS OFF THE GUEST LIST";
    case "timeout":
      return "REMOTE SYSTEM DID NOT ANSWER";
    case "too large":
      return "REMOTE SYSTEM SENT TOO MUCH - REFUSED";
    case "private address":
    case "scheme":
    case "port":
    case "own origin":
      return "THAT ADDRESS IS NOT REACHABLE FROM HERE";
    default:
      if (reason.startsWith("content type")) return "NOT A DOCUMENT THIS BOARD CAN READ";
      if (reason.startsWith("upstream")) return `REMOTE SYSTEM SAID ${reason.slice(9)}`;
      return NO_DOCUMENT;
  }
}

const D = "═"; // double horizontal
const V = "║"; // double vertical
const TL = "╔";
const TR = "╗";
const BL = "╚";
const BR = "╝";

function box(lines: string[], width = 46): string[] {
  const pad = (s: string) => s + " ".repeat(Math.max(0, width - 2 - s.length));
  return [
    TL + D.repeat(width - 2) + TR,
    ...lines.map((l) => V + pad(l) + V),
    BL + D.repeat(width - 2) + BR,
  ];
}

/// The metering banner. A real board told you what was left, so the rate
/// limit is period furniture rather than an error dialog.
export function meterLine(m: Meter): string {
  return `TIME REMAINING THIS CALL: ${m.minutesLeft} MIN     REQUESTS LEFT: ${m.remaining}`;
}

export function loginScreen(m: Meter | null, status: string): string[] {
  return [
    "",
    ...box([
      "",
      "   b b s . d b h q . u k",
      "",
      "   THE WORLD WIDE WEB, AS A BOARD",
      "",
    ]).map((l) => "  " + l),
    "",
    "    A DBHQ EXPERIMENT",
    "",
    m ? "    " + meterLine(m) : "    " + (status || "CONNECTING..."),
    "",
    "    PRESS ENTER TO LOG ON",
  ];
}

export function menuScreen(m: Meter | null, status: string): string[] {
  return [
    "",
    "   MAIN MENU",
    "   " + "─".repeat(9),
    "",
    ...CONFERENCES.map((c) => `    ${c.key}) ${c.name}`),
    "",
    "    W) WORLD WIDE WEB GATEWAY",
    "",
    "",
    "   " + "─".repeat(40),
    m ? "   " + meterLine(m) : "",
    "",
    status ? "   " + status : "",
    "",
    "   COMMAND: ",
  ];
}

export function webScreen(input: string, status: string, m: Meter | null): string[] {
  return [
    "",
    "   WORLD WIDE WEB GATEWAY",
    "   " + "─".repeat(23),
    "",
    "   Type a URL and press RETURN.  Q returns to the main menu.",
    "",
    `   URL: ${input}_`,
    "",
    status ? "   " + status : "",
    "",
    "",
    "   " + "─".repeat(40),
    m ? "   " + meterLine(m) : "",
  ];
}

export type Item = { title: string; url: string };

export function conferenceScreen(
  name: string,
  items: Item[],
  page: number,
  input: string,
  status: string,
): string[] {
  const perPage = 16;
  const slice = items.slice(page * perPage, (page + 1) * perPage);
  return [
    "",
    `   ${name}`,
    "   " + "─".repeat(name.length),
    "",
    ...slice.map((it, i) =>
      `   [${String(page * perPage + i + 1).padStart(2)}] ${it.title}`.slice(0, 79),
    ),
    ...(slice.length === 0 ? ["   " + (status || "LOADING...")] : []),
    "",
    "   N) NEXT   P) PREV   Q) MAIN MENU   NUMBER TO READ",
    "",
    `   ITEM: ${input}_`,
    status && slice.length ? "   " + status : "",
  ];
}

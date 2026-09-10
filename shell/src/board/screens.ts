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

/// The metering banner. A real board told you what was left, so the rate
/// limit is period furniture rather than an error dialog.
export function meterLine(m: Meter): string {
  return `TIME REMAINING THIS CALL: ${m.minutesLeft} MIN     REQUESTS LEFT: ${m.remaining}`;
}

/// Two of these screens draw a prompt and nothing else, so they need no
/// row count. The conference listing does: how many items fit on a page is
/// the whole difference between 50 rows and 25.
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

export type Listing = { lines: string[]; hot: import("../touch").Hot[] };

export function conferenceScreen(
  name: string,
  items: Item[],
  page: number,
  input: string,
  status: string,
  rows: number,
  cols: number,
): Listing {
  // Nine lines of furniture wrap the list - a title, a rule, the key
  // legend, the prompt and the blank rows between them - so the page size
  // is whatever is left. It was a hardcoded 40, which was right for one
  // mode and showed a fifth of a screen or overran it in the others.
  const perPage = Math.max(1, rows - 9);
  const slice = items.slice(page * perPage, (page + 1) * perPage);

  const head = ["", `   ${name}`, "   " + "─".repeat(name.length), ""];
  const body = slice.map((it, i) =>
    `   [${String(page * perPage + i + 1).padStart(2)}] ${it.title}`.slice(0, cols),
  );

  // Tapping an item types its number and presses return, which is exactly
  // what a caller does. The row is its index in the finished array, so it
  // stays correct if the heading ever grows.
  const hot = slice.map((_, i) => ({
    row: head.length + i,
    keys: [...String(page * perPage + i + 1), "Enter"],
  }));

  const legend = "   N) NEXT   P) PREV   Q) MAIN MENU   NUMBER TO READ";
  const tail = [
    ...(slice.length === 0 ? ["   " + (status || "LOADING...")] : []),
    "",
    legend,
    "",
    `   ITEM: ${input}_`,
    status && slice.length ? "   " + status : "",
  ];

  const lines = [...head, ...body, ...tail];
  // The legend is a control row too, but only for the keys that are not
  // item numbers.
  return { lines, hot };
}

import { CONFERENCES } from "../conferences";

export type State =
  | { screen: "login" }
  | { screen: "menu" }
  | { screen: "logon" }
  | { screen: "register" }
  | { screen: "conference"; id: string; page: number }
  | { screen: "web" }
  | { screen: "reading"; page: number };

/// Pure navigation. Kept free of I/O so it can be tested without a
/// browser, a network or the WASM module.
export function nextState(s: State, key: string): State {
  if (key === "Q" && s.screen !== "login") return { screen: "menu" };

  switch (s.screen) {
    // The login screen offers three keys and, until now, honoured one.
    //
    // [ N ] and [ G ] have been drawn on it since the art landed and did
    // nothing at all - a keyboard caller pressed N, got the same screen
    // back, and had no way to tell a dead key from a missed keystroke.
    // Making the rows tappable would have made that unmissable rather than
    // merely wrong.
    case "login":
      if (key === "Enter" || key === "G") return { screen: "menu" };
      if (key === "N") return { screen: "register" };
      return s;

    case "menu": {
      if (key === "W") return { screen: "web" };
      if (key === "L") return { screen: "logon" };
      if (key === "N") return { screen: "register" };
      const c = CONFERENCES.find((c) => c.key === key);
      return c ? { screen: "conference", id: c.id, page: 0 } : s;
    }

    case "conference":
      if (key === "N") return { ...s, page: s.page + 1 };
      if (key === "P") return { ...s, page: Math.max(0, s.page - 1) };
      return s;

    case "reading":
      if (key === "N" || key === " ") return { ...s, page: s.page + 1 };
      if (key === "P") return { ...s, page: Math.max(0, s.page - 1) };
      return s;

    case "web":
    case "logon":
    case "register":
      return s;
  }
}

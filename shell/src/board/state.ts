import { CONFERENCES } from "../conferences";

export type State =
  | { screen: "login" }
  | { screen: "menu" }
  | { screen: "conference"; id: string; page: number }
  | { screen: "web" }
  | { screen: "reading"; page: number };

/// Pure navigation. Kept free of I/O so it can be tested without a
/// browser, a network or the WASM module.
export function nextState(s: State, key: string): State {
  if (key === "Q" && s.screen !== "login") return { screen: "menu" };

  switch (s.screen) {
    case "login":
      return key === "Enter" ? { screen: "menu" } : s;

    case "menu": {
      if (key === "W") return { screen: "web" };
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
      return s;
  }
}

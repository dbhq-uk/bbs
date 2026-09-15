import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asCommand } from "../src/keyboard";
import { formKey, formLines, newForm } from "../src/board/forms";
import { nextState } from "../src/board/state";

/// THE BOARD'S COMMANDS ARE CASE-INSENSITIVE. ITS TEXT FIELDS ARE NOT.
///
/// keyboard.ts used to uppercase every single character on the way in,
/// before anything knew which of those two it was. The commands looked
/// fine, so nothing failed, and the two places that take real text were
/// quietly broken:
///
///   - every password was stored uppercased, throwing away the case bits
///     and guaranteeing a mismatch with anything a password manager saved
///   - a URL typed at the W door was uppercased whole, and a hostname does
///     not care but a PATH does
describe("a command folds case", () => {
  it("uppercases a single character", () => {
    expect(asCommand("w")).toBe("W");
    expect(asCommand("W")).toBe("W");
  });

  it("leaves a named key alone", () => {
    // "Enter".toUpperCase() is "ENTER", which matches nothing.
    for (const named of ["Enter", "Escape", "Backspace", "ArrowUp"]) {
      expect(asCommand(named)).toBe(named);
    }
  });

  it("still drives navigation from a lowercase keypress", () => {
    expect(nextState({ screen: "menu" }, asCommand("w")).screen).toBe("web");
    expect(nextState({ screen: "menu" }, asCommand("l")).screen).toBe("logon");
    expect(nextState({ screen: "web" }, asCommand("q")).screen).toBe("menu");
  });
});

describe("a form takes text exactly as typed", () => {
  const password = "Correct-Horse-Battery-Staple-42";

  it("keeps the case of a password", () => {
    const f = newForm("LOG ON", [
      { key: "email", label: "EMAIL:" },
      { key: "password", label: "PASSWORD:", secret: true },
    ]);
    for (const ch of "dan@dbhq.uk") formKey(f, ch);
    formKey(f, "Enter");
    for (const ch of password) formKey(f, ch);

    expect(f.values.email).toBe("dan@dbhq.uk");
    expect(f.values.password).toBe(password);
    // The exact regression: uppercased, it still round-trips through
    // register and logon, so nothing fails - it just is not the password.
    expect(f.values.password).not.toBe(password.toUpperCase());
  });

  it("lets a password contain the letter q", () => {
    // Q is the board's "back to the menu" key everywhere else, and a form
    // deliberately owns every character so that does not apply here.
    const f = newForm("LOG ON", [{ key: "password", label: "PASSWORD:", secret: true }]);
    for (const ch of "quiet-quails-quibble") formKey(f, ch);
    expect(f.values.password).toBe("quiet-quails-quibble");
  });

  it("promises the key it actually honours", () => {
    // The legend read "Q to abandon", which a form cannot honour without
    // making a Q impossible in a password. Escape is what handleKey reads.
    const f = newForm("LOG ON", [{ key: "password", label: "PASSWORD:", secret: true }]);
    const legend = formLines(f).join("\n");
    expect(legend).toContain("ESC to abandon");
    expect(legend).not.toContain("Q to abandon");
  });
});

/// The fix lives in the absence of a line, which is the hardest kind to
/// keep. Nothing about reading main.ts tells you that its input layer must
/// not fold case first, so these read the input layer directly.
describe("the input layer never folds case", () => {
  const sources: [string, string][] = [
    ["keyboard.ts", "../src/keyboard.ts"],
    ["touch.ts", "../src/touch.ts"],
  ];

  for (const [label, path] of sources) {
    it(`${label} passes characters through as typed`, () => {
      const src = readFileSync(new URL(path, import.meta.url).pathname, "utf8");
      // asCommand is the one sanctioned fold, and it is a command, not input.
      const body = src.replace(/export function asCommand[\s\S]*?\n}\n/, "");
      expect(body, `${label} is uppercasing input again`).not.toMatch(/toUpperCase\(\)/);
    });
  }
});

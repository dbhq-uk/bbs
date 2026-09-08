// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import init from "bbs-core";
import { readFileSync } from "node:fs";
import { menuEntries } from "../src/board/menu-model";

beforeAll(async () => {
  await init(readFileSync("../core/pkg/bbs_core_bg.wasm"));
});

describe("the menu is filtered by level, and hides rather than disables", () => {
  it("hides everything from a twit", () => {
    // A twit is on the board and can read; they are offered nothing.
    expect(menuEntries(0, "").map((e) => e.key)).toEqual([]);
  });

  it("shows the gateway to a guest, because the curated list works", () => {
    expect(menuEntries(10, "").map((e) => e.key)).toContain("W");
  });

  it("offers LOG ON and NEW USER to a guest and neither to a member", () => {
    const guest = menuEntries(10, "").map((e) => e.key);
    expect(guest).toContain("L");
    expect(guest).toContain("N");

    const member = menuEntries(20, "VG").map((e) => e.key);
    expect(member).not.toContain("L");
    expect(member).not.toContain("N");
  });

  it("offers GOODBYE only once there is a session to end", () => {
    expect(menuEntries(10, "").map((e) => e.key)).not.toContain("G");
    expect(menuEntries(20, "VG").map((e) => e.key)).toContain("G");
  });

  it("lists every conference to a guest", () => {
    const keys = menuEntries(10, "").map((e) => e.key);
    for (const k of ["1", "2", "3", "4"]) expect(keys).toContain(k);
  });
});

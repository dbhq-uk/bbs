import { describe, expect, it } from "vitest";
import { routeFor } from "../worker/index";

/// Under Pages the file tree was the router, so these routes could not be
/// wrong without a file being missing. Moving to a Worker made routing into
/// code, and a wrong string here does not fail loudly - it serves the
/// shell's index.html to a caller expecting JSON, which looks like a client
/// bug for as long as it takes to work out it is not one.
describe("the router", () => {
  it("routes every endpoint the shell calls", () => {
    for (const path of [
      "/session",
      "/sites",
      "/auth/register",
      "/auth/confirm",
      "/auth/logon",
      "/auth/reset",
      "/auth/reset-confirm",
    ]) {
      expect(routeFor(path), path).toBe(path);
    }
  });

  it("routes the gateway wildcard", () => {
    expect(routeFor("/gw/fetch")).toBe("gw");
    expect(routeFor("/gw/anything/deeper")).toBe("gw");
  });

  it("does not route a prefix that merely starts with gw", () => {
    // Without the trailing slash /gwibble reaches the relay.
    expect(routeFor("/gwibble")).toBe(null);
    expect(routeFor("/gw")).toBe(null);
  });

  it("sends everything else to the static shell", () => {
    for (const path of ["/", "/index.html", "/assets/main.js", "/favicon.svg"]) {
      expect(routeFor(path), path).toBe(null);
    }
  });

  it("matches exactly, so a traversal cannot reach a handler", () => {
    expect(routeFor("/auth/logon/../../gw/fetch")).toBe(null);
    expect(routeFor("/session/")).toBe(null);
    expect(routeFor("/SESSION")).toBe(null);
  });

  it("is not fooled by an inherited Object property", () => {
    // The leading slash is what makes these safe today, not the lookup, so
    // the bare names are checked too - they are what an `in` test would
    // resolve to a handler if a route were ever added without a slash.
    for (const path of ["/constructor", "/toString", "constructor", "toString"]) {
      expect(routeFor(path), path).toBe(null);
    }
  });
});

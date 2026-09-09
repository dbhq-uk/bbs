/// The board as a single Worker with static assets, replacing Pages.
///
/// WHY THIS EXISTS, because "it worked on Pages" is a fair question.
///
/// The spec chose atomic rate-limit bindings deliberately: KV is
/// read-modify-write, so under a burst many requests read the same counter
/// and overwrite each other, and a per-client limit is simply bypassed.
/// That is the exact weakness the bindings exist to fix.
///
/// A Pages project cannot have one. `wrangler pages deploy` rejects
/// `unsafe` bindings outright with "Configuration file for Pages projects
/// does not support unsafe", and setting it through the REST API is worse
/// than a refusal - the PATCH returns success and silently discards the
/// binding. Workers with static assets support the full binding set, so
/// the board moves.
///
/// The handlers are unchanged. Each Pages Function exported `onRequest`
/// with a `{ request, env }` context, and the router below calls them with
/// exactly that, so the migration is a routing change rather than a
/// rewrite of everything that was already tested.

import { onRequest as gw } from "../functions/gw/[[path]]";
import { onRequest as session } from "../functions/session";
import { onRequest as sites } from "../functions/sites";
import { onRequest as register } from "../functions/auth/register";
import { onRequest as confirm } from "../functions/auth/confirm";
import { onRequest as logon } from "../functions/auth/logon";
import { onRequest as reset } from "../functions/auth/reset";
import { onRequest as resetConfirm } from "../functions/auth/reset-confirm";

/// The handlers are still typed `PagesFunction<TheirOwnEnv>`, so each one
/// declares only the bindings it uses. The router cannot satisfy eight
/// different Env types at once and does not need to: it passes the whole
/// env through untouched, so the cast is narrowing nothing.
type Handler = (ctx: { request: Request; env: never }) => Promise<Response> | Response;

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  [key: string]: unknown;
}

/// Exact paths only. A prefix router would let /auth/logon/../../gw slip
/// through, and every route here is a fixed string anyway.
const ROUTES: Record<string, Handler> = {
  "/session": session as Handler,
  "/sites": sites as Handler,
  "/auth/register": register as Handler,
  "/auth/confirm": confirm as Handler,
  "/auth/logon": logon as Handler,
  "/auth/reset": reset as Handler,
  "/auth/reset-confirm": resetConfirm as Handler,
};

/// Which handler a path belongs to, or null for the static shell.
///
/// Separated from fetch() and exported so the routing can be tested without
/// a Worker runtime, a database or a network. Under Pages the file tree WAS
/// the router and a missing route was a missing file; here it is code, and
/// a single wrong string silently serves the shell's index.html to an API
/// caller instead of the endpoint.
export function routeFor(pathname: string): "gw" | keyof typeof ROUTES | null {
  // hasOwn, not `in`: `in` walks the prototype chain. Every route here
  // starts with a slash so no Object.prototype key can collide today, but
  // that is an accident of the current names rather than a property of the
  // lookup, and it stops being true the first time one does not.
  if (Object.hasOwn(ROUTES, pathname)) return pathname;
  // The gateway is the one wildcard, matching the Pages [[path]] route.
  // The trailing slash is required: /gwibble must not reach the relay.
  if (pathname.startsWith("/gw/")) return "gw";
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const ctx = { request, env } as unknown as { request: Request; env: never };

    const route = routeFor(pathname);
    if (route === "gw") return (gw as Handler)(ctx);
    if (route) return ROUTES[route](ctx);

    // Everything else is the board itself.
    return env.ASSETS.fetch(request);
  },
};

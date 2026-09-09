import { checkRequest } from "../_lib/guard";
import { safeFetch, validateTarget } from "../_lib/fetchsafe";
import { spend, type QuotaEnv } from "../_lib/quota";
import { siteMatches, sites, type DbEnv, type Site } from "../_lib/db";
import {
  allowanceFor,
  read as readSession,
  type Session,
  type SessionEnv,
} from "../_lib/session";
import { json } from "../_lib/http";

type Env = QuotaEnv & SessionEnv & DbEnv & { KILL_SWITCH?: string };

/// The gate, as a pure function so it can be tested without a network.
///
/// A guest may reach the curated list. A member may reach anything, but
/// only while holding the G flag - revoking it closes the door without
/// taking the board away, which is the reason flags exist alongside
/// levels.
export function mayFetch(
  s: Session | null,
  url: string,
  list: Site[],
): { ok: true } | { ok: false; reason: string } {
  if (!s) return { ok: false, reason: "no_session" };
  if (s.sl <= 0) return { ok: false, reason: "access_denied" };
  if (s.sl >= 20 && s.flags.includes("G")) return { ok: true };
  if (siteMatches(list, url)) return { ok: true };
  return { ok: false, reason: "members_only" };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (env.KILL_SWITCH === "on") {
    return json({ error: "SYSTEM IS DOWN FOR MAINTENANCE" }, 503);
  }

  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const token = request.headers.get("x-bbs-session");

  // The body is read before spending, because the per-target quota needs
  // the hostname. A malformed request costs nothing.
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return json({ error: "no url" }, 400);

  const target = validateTarget(body.url);
  if (!target.ok) return json({ error: target.reason }, 400);

  // Who you are decides WHAT you may reach; the quota decides HOW MUCH.
  // Both apply, and the cheaper identity check comes first.
  const session = await readSession(env, token);
  const allowed = mayFetch(session, body.url, await sites(env));
  if (!allowed.ok) {
    return json({ error: allowed.reason, sl: session?.sl ?? null }, 403);
  }

  // The budget follows the level, so a guest is not silently handed the
  // member's. session is non-null here - mayFetch refused above if not.
  const allowance = await spend(
    env,
    token,
    ip,
    target.url.hostname,
    allowanceFor(session!.sl),
  );
  if (!allowance.ok) return json({ error: allowance.reason }, 429);

  const result = await safeFetch(body.url);
  if (!result.ok) {
    return json({ error: result.reason, remaining: allowance.remaining }, 502);
  }

  // The relay returns bytes and says what they are. It knows nothing about
  // HTML, BBSes or ANSI - all of that is the client's job.
  return new Response(result.body, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "x-bbs-content-type": result.contentType,
      "x-bbs-final-url": result.finalUrl,
      "x-bbs-remaining": String(allowance.remaining),
      "x-bbs-minutes-left": String(allowance.minutesLeft),
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=300",
      // No Access-Control-Allow-Origin, deliberately. See guard.ts.
    },
  });
};

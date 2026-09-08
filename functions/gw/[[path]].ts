import { checkRequest } from "../_lib/guard";
import { safeFetch, validateTarget } from "../_lib/fetchsafe";
import { spend, type QuotaEnv } from "../_lib/quota";

type Env = QuotaEnv & { KILL_SWITCH?: string };

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

  const allowance = await spend(env, token, ip, target.url.hostname);
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-content-type-options": "nosniff" },
  });
}

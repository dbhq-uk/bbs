import { checkRequest } from "./_lib/guard";
import { ALLOWANCE, mintSession } from "./_lib/quota";

type Env = {
  SESSION_SECRET: string;
  TURNSTILE_SECRET: string;
};

/// Exchanges a Turnstile token for a session. One challenge per session,
/// not per request. Turnstile is free with unlimited verifications.
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";

  // A solved challenge is worth a full session. Anything else is worth a
  // GUEST session with a much smaller allowance.
  //
  // Turnstile was spec 1's stopgap to stop anonymous relay abuse, and it
  // is fragile: it does not initialise at all in some browsers, and when
  // it fails there is nothing the caller can do about it. Refusing them
  // outright makes the board useless for a problem that is not theirs.
  //
  // Refusing is also the wrong shape. Spec 2 replaces this idea with a
  // real guest tier, and the relay is already bounded independently of who
  // is calling: GET only, byte caps, content-type allowlist, no private
  // addresses, and per-IP, per-target and global rate limits. A guest
  // session does not open anything those do not already contain.
  let verified = false;
  if (body?.token) {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", body.token);
    form.append("remoteip", ip);
    try {
      const verify = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        { method: "POST", body: form },
      );
      verified = ((await verify.json()) as { success: boolean }).success === true;
    } catch {
      verified = false;
    }
  }

  return json({
    session: await mintSession(env.SESSION_SECRET),
    allowance: verified
      ? ALLOWANCE
      : { ...ALLOWANCE, requestsPerSession: 40, requestsPerMinute: 10 },
    tier: verified ? "verified" : "guest",
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      // No Access-Control-Allow-Origin, deliberately. See guard.ts.
    },
  });
}

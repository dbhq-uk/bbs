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
  if (!body?.token) return json({ error: "no turnstile token" }, 400);

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", body.token);
  form.append("remoteip", ip);

  const verify = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form },
  );
  const outcome = (await verify.json()) as { success: boolean };
  if (!outcome.success) return json({ error: "challenge failed" }, 403);

  return json({
    session: await mintSession(env.SESSION_SECRET),
    allowance: ALLOWANCE,
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

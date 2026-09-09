import { checkRequest } from "./_lib/guard";
import { json } from "./_lib/http";
import { ALLOWANCE } from "./_lib/quota";
import { allowanceFor, mint, SESSION_MINUTES, type SessionEnv } from "./_lib/session";

type Env = SessionEnv & {
  TURNSTILE_SECRET: string;
};

/// The security level of an unauthenticated caller. Matches the GUEST
/// level in the core's access model, and mint() applies it.
const GUEST_SL = 10;

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

  // A REAL guest session, not a bare signed token.
  //
  // mint() writes the `sess:<sub>` record the gateway reads to learn the
  // caller's level and flags. Signing a token without it produced one that
  // verified fine and was then refused at the gate as `no_session`, which
  // is what shipped and what closed the guest tier in production.
  return json({
    session: await mint(env, null),
    allowance: {
      ...ALLOWANCE,
      requestsPerSession: allowanceFor(GUEST_SL),
      sessionMinutes: SESSION_MINUTES,
    },
    tier: "guest",
    // Reported, not spent. Spec 2 makes the guest tier uniform, so a solved
    // challenge buys no extra allowance today; it stays here because it is
    // the only Sybil signal the board has and the next tier will want it.
    verified,
  });
};


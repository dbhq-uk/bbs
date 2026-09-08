import { checkRequest } from "../_lib/guard";
import { recordLogon, userByEmail, type DbEnv } from "../_lib/db";
import { ITERATIONS, verify } from "../_lib/password";
import { mint as mintSession, type SessionEnv } from "../_lib/session";
import { json } from "../_lib/http";

type Env = DbEnv & SessionEnv & { RL_IP?: RateLimit; RL_SESSION?: RateLimit };

/// A syntactically valid hash that no password matches, used when there is
/// no such user so the response time does not reveal whether an address is
/// registered. Returning early instead would make this endpoint an
/// account-existence oracle by stopwatch.
///
/// THE COST HERE MUST TRACK ITERATIONS IN password.ts. It was hardcoded at
/// 600,000 while the real cost dropped to the Workers ceiling of 100,000,
/// and this line then threw NotSupportedError - so an unknown address
/// returned 500 while a known one returned 401. That is the very oracle
/// the dummy exists to prevent, reintroduced by a constant that drifted.
/// Importing it removes the possibility.
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const DUMMY = `pbkdf2$${ITERATIONS}$${DUMMY_SALT}$${DUMMY_SALT}`;

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  if (!body?.email || !body?.password) return json({ error: "bad_request" }, 400);

  // Limited per IP AND per account. Per account alone lets an attacker
  // lock out a named user from anywhere; per IP alone lets them walk a
  // list of accounts from a single address.
  if (env.RL_IP && !(await env.RL_IP.limit({ key: `logon:${ip}` })).success) {
    return json({ error: "rate_limited" }, 429);
  }
  const acct = body.email.trim().toLowerCase();
  if (env.RL_SESSION && !(await env.RL_SESSION.limit({ key: `logon:${acct}` })).success) {
    return json({ error: "rate_limited" }, 429);
  }

  const user = await userByEmail(env, body.email);
  const ok = await verify(body.password, user?.pw_hash ?? DUMMY);
  if (!user || !ok) return json({ error: "bad_credentials" }, 401);

  await recordLogon(env, user.id);
  return json({
    ok: true,
    session: await mintSession(env, user),
    handle: user.handle,
    sl: user.sl,
    flags: user.flags,
  });
};

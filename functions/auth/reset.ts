import { checkRequest } from "../_lib/guard";
import { userByEmail, type DbEnv } from "../_lib/db";
import { mint } from "../_lib/tokens";
import { sendReset, type MailEnv } from "../_lib/mail";
import { json } from "../_lib/http";

type Env = DbEnv & MailEnv & { RL_IP?: RateLimit };

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  if (env.RL_IP && !(await env.RL_IP.limit({ key: `reset:${ip}` })).success) {
    return json({ error: "rate_limited" }, 429);
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) return json({ error: "bad_request" }, 400);

  const user = await userByEmail(env, body.email);
  if (user) {
    await sendReset(env, user.email, user.handle, await mint(env, user.id, "reset"));
  }

  // The same response whether or not the address is known, or this
  // endpoint becomes an account-existence oracle.
  return json({ ok: true, code: "reset_sent" });
};

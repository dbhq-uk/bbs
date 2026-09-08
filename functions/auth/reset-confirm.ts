import { checkRequest } from "../_lib/guard";
import { setPassword, userById, type DbEnv } from "../_lib/db";
import { redeem } from "../_lib/tokens";
import { hash } from "../_lib/password";
import { json } from "../_lib/http";

export const onRequest: PagesFunction<DbEnv> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const body = (await request.json().catch(() => null)) as
    | { token?: string; password?: string }
    | null;
  if (!body?.token || !body?.password) return json({ error: "bad_request" }, 400);
  if (body.password.length < 12) return json({ error: "password_short" }, 400);
  if (body.password.length > 1024) return json({ error: "password_long" }, 400);

  const userId = await redeem(env, body.token, "reset");
  if (!userId) return json({ error: "token_invalid" }, 400);

  const user = await userById(env, userId);
  if (!user) return json({ error: "no_account" }, 400);

  await setPassword(env, userId, await hash(body.password));
  return json({ ok: true, code: "password_changed" });
};

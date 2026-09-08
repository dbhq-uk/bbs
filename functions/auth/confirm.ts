import { checkRequest } from "../_lib/guard";
import { setLevel, userById, type DbEnv } from "../_lib/db";
import { redeem } from "../_lib/tokens";
import { mint as mintSession, type SessionEnv } from "../_lib/session";
import { json } from "../_lib/http";

type Env = DbEnv & SessionEnv;

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return json({ error: "no_token" }, 400);

  const userId = await redeem(env, body.token, "confirm");
  if (!userId) return json({ error: "token_invalid" }, 400);

  // The whole point of the exercise. Mystic BBS calls this "verification
  // codes with optional security level upgrades": a confirmed address
  // raises the level, which opens the gateway.
  await setLevel(env, userId, 20, "VG");

  const user = await userById(env, userId);
  if (!user) return json({ error: "no_account" }, 400);

  return json({
    ok: true,
    session: await mintSession(env, user),
    handle: user.handle,
    sl: user.sl,
    flags: user.flags,
  });
};

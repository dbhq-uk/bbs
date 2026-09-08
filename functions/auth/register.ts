import { checkRequest } from "../_lib/guard";
import { createUser, normaliseEmail, userByEmail, userByHandle, type DbEnv } from "../_lib/db";
import { hash } from "../_lib/password";
import { mint } from "../_lib/tokens";
import { sendConfirm, type MailEnv } from "../_lib/mail";
import { json } from "../_lib/http";

type Env = DbEnv & MailEnv & { RL_IP?: RateLimit; QUOTA: KVNamespace };

export type Registration = { handle: string; email: string; password: string };

/// Handles are drawn on an 80x25 CP437 screen, so they are restricted to
/// what that can render: letters, digits, hyphen and underscore. A handle
/// that arrives as a row of question marks is not a handle.
const HANDLE = /^[A-Za-z0-9_-]{3,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export function validateRegistration(
  r: Registration,
): { ok: true } | { ok: false; reason: string } {
  if (!HANDLE.test((r.handle ?? "").trim())) return { ok: false, reason: "bad_handle" };
  if (!EMAIL.test((r.email ?? "").trim())) return { ok: false, reason: "bad_email" };
  if ((r.password ?? "").length < 12) return { ok: false, reason: "password_short" };
  if (r.password.length > 1024) return { ok: false, reason: "password_long" };
  return { ok: true };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  if (env.RL_IP && !(await env.RL_IP.limit({ key: `reg:${ip}` })).success) {
    return json({ error: "rate_limited" }, 429);
  }

  const body = (await request.json().catch(() => null)) as Registration | null;
  if (!body) return json({ error: "bad_request" }, 400);

  const valid = validateRegistration(body);
  if (!valid.ok) return json({ error: valid.reason }, 400);

  // A taken HANDLE is reported, because handles are public on the board
  // and a caller has to be able to pick another one.
  if (await userByHandle(env, body.handle)) {
    return json({ error: "handle_taken" }, 409);
  }

  // A taken EMAIL is not, because that would turn this endpoint into an
  // account-existence oracle for addresses that are private. Both branches
  // below must return the identical response.
  const existing = await userByEmail(env, body.email);
  if (!existing) {
    const id = await createUser(env, {
      handle: body.handle.trim(),
      email: normaliseEmail(body.email),
      pw_hash: await hash(body.password),
    });
    const token = await mint(env, id, "confirm");
    await sendConfirm(env, normaliseEmail(body.email), body.handle.trim(), token);
  }

  // Identical either way. Do not add a field, a status code, or a timing
  // difference that distinguishes them.
  return json({ ok: true, code: "confirm_sent" });
};

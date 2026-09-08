import type { User } from "./db";
import { signToken, verifyToken } from "./quota";

export type Session = {
  sub: string;
  userId: string | null;
  handle: string;
  sl: number;
  flags: string;
};

export const SESSION_MINUTES = 30;

/// Requests a session may spend, by security level.
///
/// A guest gets enough to browse the curated list properly; a member gets
/// the open internet and a much larger budget. Monotonic on purpose: a
/// promotion must never cost you allowance.
export function allowanceFor(sl: number): number {
  if (sl <= 0) return 0;
  if (sl < 20) return 60;
  if (sl < 100) return 400;
  return 2000;
}

export type SessionEnv = { SESSION_SECRET: string; QUOTA: KVNamespace };

/// The session carries a COPY of level and flags.
///
/// A demotion therefore does not bite until the session expires, which is
/// accepted deliberately: sessions are short, and the alternative is a D1
/// read on every gateway request. When it must bite immediately, the
/// sysop calls revoke().
export async function mint(
  env: SessionEnv,
  user: User | null,
  minutes = SESSION_MINUTES,
): Promise<string> {
  const sub = crypto.randomUUID();
  const s: Session = user
    ? { sub, userId: user.id, handle: user.handle, sl: user.sl, flags: user.flags }
    : { sub, userId: null, handle: "GUEST", sl: 10, flags: "" };

  await env.QUOTA.put(`sess:${sub}`, JSON.stringify(s), {
    expirationTtl: minutes * 60,
  });

  return signToken(env.SESSION_SECRET, {
    sub,
    exp: Date.now() + minutes * 60_000,
    n: 0,
  });
}

export async function read(
  env: SessionEnv,
  token: string | null,
): Promise<Session | null> {
  if (!token) return null;
  const v = await verifyToken(env.SESSION_SECRET, token);
  if (!v.ok) return null;
  const raw = await env.QUOTA.get(`sess:${v.claims.sub}`);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function revoke(env: { QUOTA: KVNamespace }, sub: string): Promise<void> {
  await env.QUOTA.delete(`sess:${sub}`);
}

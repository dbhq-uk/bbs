import type { DbEnv } from "./db";

/// Confirmation and reset tokens.
///
/// The token is handed back to the caller once, to be emailed, and is
/// never stored. Only its SHA-256 goes in the database, so a leak of the
/// tokens table hands over nothing usable.
export const TTL = {
  confirm: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
} as const;

export type Kind = keyof typeof TTL;

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mint(env: DbEnv, userId: string, kind: Kind): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Any earlier token of this kind dies the moment a new one is issued,
  // or a user who requests two resets leaves one of them live.
  await env.DB.prepare("DELETE FROM tokens WHERE user_id = ? AND kind = ?")
    .bind(userId, kind)
    .run();

  await env.DB.prepare(
    "INSERT INTO tokens (hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256hex(token), userId, kind, Date.now() + TTL[kind])
    .run();

  return token;
}

/// Returns the user id if the token is valid and unused, else null, and
/// marks it used in the same statement.
///
/// Single use is enforced by the UPDATE, not by a read followed by a
/// write, so two simultaneous redemptions cannot both succeed.
export async function redeem(
  env: DbEnv,
  token: string,
  kind: Kind,
): Promise<string | null> {
  const h = await sha256hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `UPDATE tokens SET used_at = ?
     WHERE hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?
     RETURNING user_id`,
  )
    .bind(now, h, kind, now)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

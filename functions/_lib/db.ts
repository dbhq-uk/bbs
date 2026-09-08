export type User = {
  id: string;
  handle: string;
  email: string;
  pw_hash: string;
  sl: number;
  flags: string;
  created_at: number;
  last_on: number | null;
  calls: number;
};

export type Site = { id: number; name: string; url: string; sort: number };

export type DbEnv = { DB: D1Database };

export function normaliseEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function normaliseHandle(s: string): string {
  return s.trim().toLowerCase();
}

/// Whether a URL is on the curated guest list.
///
/// Compares HOSTS, not string prefixes. A prefix check would accept
/// https://en.wikipedia.org.evil.com because it starts with the listed
/// URL, which is the classic way an allowlist gets walked past.
export function siteMatches(sites: Site[], target: string): boolean {
  let host: string;
  try {
    host = new URL(target).host.toLowerCase();
  } catch {
    return false;
  }
  return sites.some((s) => {
    try {
      return new URL(s.url).host.toLowerCase() === host;
    } catch {
      return false;
    }
  });
}

export async function userByEmail(env: DbEnv, email: string): Promise<User | null> {
  return env.DB.prepare("SELECT * FROM users WHERE email_lower = ?")
    .bind(normaliseEmail(email))
    .first<User>();
}

export async function userByHandle(env: DbEnv, handle: string): Promise<User | null> {
  return env.DB.prepare("SELECT * FROM users WHERE handle_lower = ?")
    .bind(normaliseHandle(handle))
    .first<User>();
}

export async function userById(env: DbEnv, id: string): Promise<User | null> {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
}

export async function createUser(
  env: DbEnv,
  u: { handle: string; email: string; pw_hash: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, handle, handle_lower, email, email_lower, pw_hash,
                        sl, flags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 10, '', ?)`,
  )
    .bind(
      id,
      u.handle.trim(),
      normaliseHandle(u.handle),
      u.email.trim(),
      normaliseEmail(u.email),
      u.pw_hash,
      Date.now(),
    )
    .run();
  return id;
}

export async function setLevel(
  env: DbEnv,
  id: string,
  sl: number,
  flags: string,
): Promise<void> {
  await env.DB.prepare("UPDATE users SET sl = ?, flags = ? WHERE id = ?")
    .bind(sl, flags, id)
    .run();
}

export async function setPassword(env: DbEnv, id: string, hash: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").bind(hash, id).run();
}

export async function recordLogon(env: DbEnv, id: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET last_on = ?, calls = calls + 1 WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

export async function sites(env: DbEnv): Promise<Site[]> {
  const r = await env.DB.prepare("SELECT * FROM sites ORDER BY sort, name").all<Site>();
  return r.results ?? [];
}

/// The last few callers, for the login screen. Handles only - a board
/// showed who had called, never their email.
export async function lastCallers(env: DbEnv, n = 8): Promise<
  { handle: string; last_on: number; calls: number }[]
> {
  const r = await env.DB.prepare(
    "SELECT handle, last_on, calls FROM users WHERE last_on IS NOT NULL ORDER BY last_on DESC LIMIT ?",
  )
    .bind(n)
    .all<{ handle: string; last_on: number; calls: number }>();
  return r.results ?? [];
}

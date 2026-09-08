export type Claims = { sub: string; exp: number; n: number };

/// The allowance, surfaced to the reader as a time and call limit.
///
/// Deliberately loose. KV is eventually consistent, so the session counter
/// is approximate; the numbers must have enough headroom that the
/// approximation never bites a legitimate reader. Everything that is a
/// security boundary uses the atomic rate-limit bindings instead.
export const ALLOWANCE = {
  requestsPerSession: 300,
  requestsPerMinute: 30,
  sessionMinutes: 30,
};

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

export async function signToken(secret: string, claims: Claims): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign("HMAC", await key(secret), data);
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

export type Verified = { ok: true; claims: Claims } | { ok: false; reason: string };

export async function verifyToken(secret: string, token: string): Promise<Verified> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await key(secret), unb64url(parts[2]), data);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!valid) return { ok: false, reason: "bad signature" };

  const claims = decodeToken(token);
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.exp < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

/// Reads claims without verifying. Only for display, never for a decision.
export function decodeToken(token: string): Claims | null {
  try {
    const raw = token.split(".")[1];
    return JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export type SpendResult =
  | { ok: true; remaining: number; minutesLeft: number }
  | {
      ok: false;
      reason: "no session" | "expired" | "session spent" | "rate" | "ip" | "target" | "global";
    };

export type QuotaEnv = {
  QUOTA: KVNamespace;
  SESSION_SECRET: string;
  /// Native Workers rate limiting. Unlike KV this is atomic, which matters:
  /// KV is read-modify-write, so under a burst many requests read the same
  /// counter and overwrite each other, and the per-client rate limit is
  /// simply bypassed. Anything that is a security boundary uses these.
  RL_SESSION: RateLimit;
  RL_IP: RateLimit;
  RL_TARGET: RateLimit;
  RL_GLOBAL: RateLimit;
};

/// Per-client rate limiting, layered over IP-prefix, per-target and global
/// limits.
///
/// Per-session limiting cannot stand alone: the Sybil cost of a fresh
/// session is one Turnstile solve, so an attacker discards identities
/// freely. The IP, target and global layers are what bound the damage.
export async function spend(
  env: QuotaEnv,
  token: string | null,
  ip: string,
  targetHost: string,
): Promise<SpendResult> {
  if (!token) return { ok: false, reason: "no session" };

  const v = await verifyToken(env.SESSION_SECRET, token);
  if (!v.ok) return { ok: false, reason: v.reason === "expired" ? "expired" : "no session" };

  const now = Date.now();
  const sub = v.claims.sub;

  // Broadest and cheapest first, so an attacker cannot spend the expensive
  // checks on their way to being refused.
  if (!(await env.RL_GLOBAL.limit({ key: "all" })).success) {
    return { ok: false, reason: "global" };
  }
  if (!(await env.RL_IP.limit({ key: ipPrefix(ip) })).success) {
    return { ok: false, reason: "ip" };
  }
  if (!(await env.RL_SESSION.limit({ key: sub })).success) {
    return { ok: false, reason: "rate" };
  }
  // Per-target-origin, so the relay cannot be turned into a scraper aimed
  // at one unlucky site.
  if (!(await env.RL_TARGET.limit({ key: targetHost })).success) {
    return { ok: false, reason: "target" };
  }

  const sessionKey = `s:${sub}`;
  const used = Number((await env.QUOTA.get(sessionKey)) ?? "0");
  if (used >= ALLOWANCE.requestsPerSession) return { ok: false, reason: "session spent" };
  await env.QUOTA.put(sessionKey, String(used + 1), {
    expirationTtl: ALLOWANCE.sessionMinutes * 60,
  });

  return {
    ok: true,
    remaining: ALLOWANCE.requestsPerSession - used - 1,
    minutesLeft: Math.max(0, Math.round((v.claims.exp - now) / 60_000)),
  };
}

/// Group by /24 (or /48 for v6) so one household is one bucket rather than
/// one address, which a rotating client would otherwise walk straight past.
function ipPrefix(ip: string): string {
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":");
  return ip.split(".").slice(0, 3).join(".");
}

export async function mintSession(secret: string): Promise<string> {
  return signToken(secret, {
    sub: crypto.randomUUID(),
    exp: Date.now() + ALLOWANCE.sessionMinutes * 60_000,
    n: 0,
  });
}

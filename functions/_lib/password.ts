/// PBKDF2-HMAC-SHA256 via WebCrypto.
///
/// Argon2id is stronger but needs WASM inside the Worker, which is a
/// dependency this does not justify. Mystic BBS stores 512-bit PBKDF2, so
/// this is period-plausible as well as correct.
///
/// Stored form: `pbkdf2$<iterations>$<salt b64>$<hash b64>`. The cost is
/// recorded IN the string deliberately - without it, raising the iteration
/// count later would invalidate every existing password, because nothing
/// would know how an old hash was made.
const ITERATIONS = 600_000;
const KEY_BITS = 256;

export async function hash(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const bits = await derive(plain, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

export async function verify(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = Number(parts[1]);
  if (!Number.isInteger(iters) || iters < 1 || iters > 5_000_000) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = unb64(parts[2]);
    expected = unb64(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const bits = new Uint8Array(await derive(plain, salt, iters));
  return timingSafeEqual(bits, expected);
}

async function derive(plain: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
}

/// Constant time for equal lengths. A plain === on secrets leaks their
/// contents through timing, one byte at a time.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

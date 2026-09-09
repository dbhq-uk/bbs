export type TargetCheck = { ok: true; url: URL } | { ok: false; reason: string };

const MAX_URL = 2048;
const OWN_HOSTS = new Set(["bbs.dbhq.uk", "localhost", "127.0.0.1"]);

export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const TIMEOUT_MS = 10_000;

/// The board's own type for CP437 art. Not a registered media type - it is
/// invented here so the shell can tell art apart from prose and hand it to
/// the ANSI decoder rather than the HTML projection.
export const ANSI_TYPE = "text/x-ansi";

/// Art file extensions, matched only when the server declares NO type.
///
/// The ANSI Art Archive is on the board's curated list and serves every
/// .ans with no content-type at all, so the relay refused all of them and a
/// board built to render ANSI could not show a single piece of ANSI art.
///
/// Deliberately narrow: this is a fallback for a MISSING header, never an
/// override of one the server sent. A server that says `text/html` is
/// believed even if the path ends in .ans, so this cannot be used to smuggle
/// a disallowed type past the allowlist by renaming a path.
const ART_EXTENSIONS = [".ans", ".asc", ".nfo", ".diz"];

export function artTypeFor(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
  return ART_EXTENSIONS.some((e) => path.endsWith(e)) ? ANSI_TYPE : "";
}

/// What the relay will hand back. Everything else is refused before a byte
/// reaches the caller.
///
/// application/json is here because the board's own conferences are built
/// from JSON APIs - Hacker News, the Wikipedia query API, GitHub - and
/// without it every one of them failed with `content type application/json`
/// while application/xml, which is strictly more dangerous to parse, was
/// allowed. The relay returns bytes either way; nothing here is executed.
const ALLOWED_TYPES = [
  "text/html", "text/plain", "application/xhtml+xml", "application/xml", "text/xml",
  "application/json",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
  ANSI_TYPE,
];

/// Blocks private, loopback, link-local and unspecified address literals.
///
/// A Worker has no private network to reach, so classic SSRF is largely
/// moot on this platform. This covers what remains: pointing the relay at
/// itself, and at cloud metadata endpoints.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h === "0.0.0.0") return true;

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  return false;
}

export function validateTarget(raw: string): TargetCheck {
  if (!raw || raw.length > MAX_URL) return { ok: false, reason: "url length" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme" };
  }
  // The port must match the scheme. Accepting http on 443 or https on 80
  // lets a caller probe a port the scheme check was meant to exclude.
  if (url.port) {
    const expected = url.protocol === "https:" ? "443" : "80";
    if (url.port !== expected) return { ok: false, reason: "port" };
  }
  if (OWN_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: "own origin" };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, reason: "private address" };
  }
  return { ok: true, url };
}

export type FetchResult =
  | { ok: true; status: number; contentType: string; body: ArrayBuffer; finalUrl: string }
  | { ok: false; reason: string };

/// Fetches a target with every cap the spec requires. Never forwards caller
/// cookies, Authorization or arbitrary headers, and validates every hop of
/// the redirect chain rather than trusting the first URL.
export async function safeFetch(raw: string): Promise<FetchResult> {
  let current = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateTarget(current);
    if (!check.ok) return { ok: false, reason: check.reason };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(check.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; bbs.dbhq.uk; +https://bbs.dbhq.uk/)",
          accept: "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5",
          "accept-language": "en-GB,en;q=0.9",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      return {
        ok: false,
        reason: e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable",
      };
    }
    // Deliberately NOT clearing the timer here. Headers arriving says
    // nothing about the body: a server can dribble bytes forever, and a
    // timeout that ends at the header boundary leaves the read unbounded.
    // The signal stays live until readCapped has finished below.

    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: "redirect without location" };
      current = new URL(loc, check.url).toString();
      continue;
    }

    if (!res.ok) {
      clearTimeout(timer);
      return { ok: false, reason: `upstream ${res.status}` };
    }

    const declaredType = (res.headers.get("content-type") ?? "")
      .split(";")[0].trim().toLowerCase();
    // ANSI art predates content types and the archives still serve it
    // without one, so the extension is the only signal there is.
    const contentType = declaredType || artTypeFor(current);
    if (!ALLOWED_TYPES.includes(contentType)) {
      clearTimeout(timer);
      return { ok: false, reason: `content type ${declaredType || "unknown"}` };
    }

    // Declared length first, then enforced again while reading, because a
    // decompression bomb declares a small compressed size.
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) {
      clearTimeout(timer);
      return { ok: false, reason: "too large" };
    }

    let body: ArrayBuffer | null;
    try {
      body = await readCapped(res, MAX_BYTES);
    } catch {
      return { ok: false, reason: "timeout" };
    } finally {
      clearTimeout(timer);
    }
    if (!body) return { ok: false, reason: "too large" };

    return {
      ok: true,
      status: res.status,
      contentType,
      body,
      finalUrl: check.url.toString(),
    };
  }
  return { ok: false, reason: "too many redirects" };
}

async function readCapped(res: Response, max: number): Promise<ArrayBuffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out.buffer;
}

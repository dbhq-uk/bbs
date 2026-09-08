const HEADERS = {
  "content-type": "application/json",
  // The non-safelisted header that forces a preflight. See guard.ts.
  "x-bbs-client": "1",
};

let session: string | null = null;

export type Meter = { remaining: number; minutesLeft: number };

export function haveSession(): boolean {
  return session !== null;
}

export async function openSession(turnstileToken: string): Promise<void> {
  const res = await fetch("/session", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ token: turnstileToken }),
  });
  if (!res.ok) throw new Error("NO CARRIER");
  session = ((await res.json()) as { session: string }).session;
}

export type Fetched =
  | {
      ok: true;
      bytes: ArrayBuffer;
      contentType: string;
      finalUrl: string;
      meter: Meter;
    }
  | { ok: false; reason: string };

export async function gwFetch(url: string): Promise<Fetched> {
  const res = await fetch("/gw/fetch", {
    method: "POST",
    headers: { ...HEADERS, ...(session ? { "x-bbs-session": session } : {}) },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: body.error ?? `HTTP ${res.status}` };
  }

  return {
    ok: true,
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("x-bbs-content-type") ?? "application/octet-stream",
    finalUrl: res.headers.get("x-bbs-final-url") ?? url,
    meter: {
      remaining: Number(res.headers.get("x-bbs-remaining") ?? "0"),
      minutesLeft: Number(res.headers.get("x-bbs-minutes-left") ?? "0"),
    },
  };
}

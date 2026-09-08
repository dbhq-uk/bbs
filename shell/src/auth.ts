import { setSession } from "./gw";

const HEADERS = { "content-type": "application/json", "x-bbs-client": "1" };

export type Caller = { handle: string; sl: number; flags: string };

const GUEST: Caller = { handle: "GUEST", sl: 10, flags: "" };
let me: Caller | null = null;

export function caller(): Caller {
  return me ?? GUEST;
}

export function isMember(): boolean {
  return caller().sl >= 20;
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // The server returns codes; throwing the code lets the board decide the
  // wording, which is the rule the whole back-end follows.
  if (!res.ok) throw new Error(String(data.error ?? `http_${res.status}`));
  return data;
}

/// Takes both the identity and the session from a logon or confirm, so
/// the caller never has to move a token around by hand and cannot forget.
function adopt(d: Record<string, unknown>): Caller {
  if (typeof d.session === "string") setSession(d.session);
  me = {
    handle: String(d.handle ?? "GUEST"),
    sl: Number(d.sl ?? 10),
    flags: String(d.flags ?? ""),
  };
  return me;
}

export async function register(handle: string, email: string, password: string) {
  return post("/auth/register", { handle, email, password });
}

export async function logon(email: string, password: string): Promise<Caller> {
  return adopt(await post("/auth/logon", { email, password }));
}

export async function confirm(token: string): Promise<Caller> {
  return adopt(await post("/auth/confirm", { token }));
}

export async function requestReset(email: string) {
  return post("/auth/reset", { email });
}

export async function completeReset(token: string, password: string) {
  return post("/auth/reset-confirm", { token, password });
}

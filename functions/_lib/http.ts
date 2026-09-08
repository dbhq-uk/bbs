/// JSON responses for every endpoint.
///
/// The back-end returns DATA, never presentation. Bodies carry
/// machine-readable codes - `bad_credentials`, `confirm_sent` - and the
/// WASM core owns what those read as on an 80x25 screen. Otherwise the
/// board's voice ends up split across two languages and two repositories.
///
/// No Access-Control-Allow-Origin, deliberately. See guard.ts: its absence
/// is half the preflight lock.
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

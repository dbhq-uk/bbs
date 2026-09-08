export type Check = { ok: true } | { ok: false; reason: string };

/// The preflight lock.
///
/// The relay sends NO Access-Control-Allow-Origin header, which stops
/// another origin READING a response. That alone does not stop them
/// TRIGGERING the request through an img tag, form or navigation, which
/// still burns quota. Requiring POST plus a non-safelisted header and a
/// JSON content type forces a CORS preflight, which fails without ACAO, so
/// the request never fires at all.
export function checkRequest(req: Request): Check {
  if (req.method !== "POST") {
    return { ok: false, reason: "method" };
  }
  if (req.headers.get("x-bbs-client") !== "1") {
    return { ok: false, reason: "missing client header" };
  }
  const ct = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (ct !== "application/json") {
    return { ok: false, reason: "content type" };
  }
  const site = req.headers.get("sec-fetch-site");
  // Sec-Fetch-* are forbidden header names, so page script cannot forge
  // them. A missing value means a non-browser client, which the quota
  // layer handles rather than this one.
  if (site && site !== "same-origin" && site !== "none") {
    return { ok: false, reason: "cross-site" };
  }
  return { ok: true };
}

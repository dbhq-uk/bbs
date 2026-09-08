import { checkRequest } from "./_lib/guard";
import { sites, type DbEnv } from "./_lib/db";
import { json } from "./_lib/http";

/// The curated list a guest may reach. Rows only - the core decides how a
/// numbered menu looks.
export const onRequest: PagesFunction<DbEnv> = async ({ request, env }) => {
  const guard = checkRequest(request);
  if (!guard.ok) return json({ error: guard.reason }, 403);
  return json({ sites: await sites(env) });
};

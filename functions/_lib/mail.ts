export type MailEnv = {
  /// Cloudflare Email Sending, public beta since 16 April 2026. Optional
  /// because it needs the Workers Paid plan, and the board should degrade
  /// rather than fail if it is not bound.
  EMAIL?: { send(msg: SendArgs): Promise<void> };
  BOARD_URL?: string;
};

type SendArgs = {
  from: { email: string; name?: string };
  to: { email: string }[];
  subject: string;
  text: string;
};

const FROM = { email: "sysop@bbs.dbhq.uk", name: "bbs.dbhq.uk" };

/// Every outbound message goes through here.
///
/// Cloudflare Email Sending is in public beta and reviewers flag API
/// instability, so swapping to Resend has to be a change to one function
/// rather than a hunt through the codebase.
///
/// Returns whether it was sent. Callers must not surface that to the
/// caller of the endpoint: telling an anonymous visitor whether mail went
/// out tells them whether the address is registered.
async function send(
  env: MailEnv,
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!env.EMAIL) return false;
  try {
    await env.EMAIL.send({ from: FROM, to: [{ email: to }], subject, text });
    return true;
  } catch {
    return false;
  }
}

function boardUrl(env: MailEnv): string {
  return env.BOARD_URL ?? "https://bbs.dbhq.uk";
}

export async function sendConfirm(
  env: MailEnv,
  to: string,
  handle: string,
  token: string,
): Promise<boolean> {
  const url = `${boardUrl(env)}/?confirm=${encodeURIComponent(token)}`;
  return send(
    env,
    to,
    "bbs.dbhq.uk - confirm your account",
    [
      `Welcome to bbs.dbhq.uk, ${handle}.`,
      "",
      "Confirm this address to open the world wide web gateway:",
      "",
      url,
      "",
      "The link is good for 24 hours and works once.",
      "If you did not apply for an account, ignore this and nothing happens.",
      "",
      "Kind Regards,",
      "The Sysop",
    ].join("\n"),
  );
}

export async function sendReset(
  env: MailEnv,
  to: string,
  handle: string,
  token: string,
): Promise<boolean> {
  const url = `${boardUrl(env)}/?reset=${encodeURIComponent(token)}`;
  return send(
    env,
    to,
    "bbs.dbhq.uk - new password",
    [
      `A new password was requested for ${handle}.`,
      "",
      url,
      "",
      "The link is good for one hour and works once.",
      "If this was not you, ignore it. Your password has not changed.",
      "",
      "Kind Regards,",
      "The Sysop",
    ].join("\n"),
  );
}

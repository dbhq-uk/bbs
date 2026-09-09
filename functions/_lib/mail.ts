export type MailEnv = {
  /// Resend. Optional so the board degrades rather than fails when the key
  /// is not set - registration still succeeds, it just cannot tell anyone.
  RESEND_API_KEY?: string;
  BOARD_URL?: string;
};

const FROM = "bbs.dbhq.uk <sysop@bbs.dbhq.uk>";
const ENDPOINT = "https://api.resend.com/emails";

/// Every outbound message goes through here.
///
/// WHY NOT CLOUDFLARE. Wrangler's `send_email` binding is Email Routing,
/// and it can only reach addresses already VERIFIED on the account. That
/// is structurally useless for account confirmation, whose entire job is
/// mailing a stranger who just registered. Cloudflare's newer Email
/// Sending would do it but needs the Workers Paid plan; Resend's free tier
/// covers this board many times over (Dan, 9 Sep 2026).
///
/// Returns whether it was sent. Callers must NOT surface that to the
/// caller of the endpoint: telling an anonymous visitor whether mail went
/// out tells them whether the address is registered.
async function send(
  env: MailEnv,
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    if (!res.ok) {
      // Logged, never returned. A silent false here means registration
      // reports `confirm_sent` and nothing ever arrives, which is
      // indistinguishable from a spam filter unless the reason is
      // recorded somewhere. `wrangler tail` is that somewhere.
      console.error(`mail: resend ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`mail: resend threw ${e}`);
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

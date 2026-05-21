/**
 * Thin Resend HTTP wrapper. Server-only — reads RESEND_API_KEY from
 * env. Returns `{ ok: true, id }` on success or `{ ok: false, error }`
 * on failure. Callers should treat email as best-effort.
 *
 * https://resend.com/docs/api-reference/emails/send-email
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Override the default sender. Falls back to env or onboarding@resend.dev. */
  from?: string;
  /** Optional reply-to. */
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: "no_api_key" };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set", skipped: "no_api_key" };
  }
  const from =
    input.from ?? process.env.RESEND_FROM ?? "onboarding@resend.dev";
  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) body.html = input.html;
  if (input.text) body.text = input.text;
  if (input.replyTo) body.reply_to = input.replyTo;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: j.message || j.name || `HTTP ${res.status}`,
      };
    }
    return { ok: true, id: j.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Gmail SMTP mailer via nodemailer. Server-only.
 *
 * Required env:
 *   GMAIL_USER          — the Gmail address that sends (e.g. me@gmail.com)
 *   GMAIL_APP_PASSWORD  — a 16-char Google "App Password" (NOT the normal
 *                         account password). Generate it at
 *                         Google Account → Security → 2-Step Verification
 *                         → App passwords.
 * Optional:
 *   GMAIL_FROM_NAME     — display name shown in the From header.
 *
 * Returns `{ ok: true, id }` on success, `{ ok: false, error }` on
 * failure. Email is best-effort — callers should never block on it.
 *
 * Note: a free Gmail account caps at ~500 recipients/day. Fine for a
 * PoC; move to a real provider for production volume.
 */
import nodemailer from "nodemailer";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: "no_credentials" };

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // implicit TLS
    auth: { user, pass },
  });
  return cachedTransport;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const user = process.env.GMAIL_USER as string;
  const fromName = process.env.GMAIL_FROM_NAME || "Korail Booking";
  try {
    // getTransport() is inside the try so a nodemailer load / config
    // failure becomes a returned error rather than an uncaught throw.
    const transport = getTransport();
    if (!transport) {
      return {
        ok: false,
        error: "GMAIL_USER / GMAIL_APP_PASSWORD not set",
        skipped: "no_credentials",
      };
    }
    const info = await transport.sendMail({
      // Gmail rewrites the address to the authenticated account anyway,
      // so we only customise the display name.
      from: `"${fromName}" <${user}>`,
      to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    return { ok: true, id: info.messageId ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

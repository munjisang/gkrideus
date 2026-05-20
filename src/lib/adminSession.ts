/**
 * Admin session: small HMAC-signed cookie token.
 *
 * Token format: `<iat>.<exp>.<hmac>` (base64url-encoded HMAC of "<iat>.<exp>"
 * using ADMIN_SESSION_SECRET). Pure stateless — no DB hits per request.
 */
import crypto from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_COOKIE_MAX_AGE_S = 60 * 60 * 12; // 12h

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    // Deliberately throw — running without a secret defeats the gate.
    throw new Error(
      "ADMIN_SESSION_SECRET is not configured (or shorter than 16 chars).",
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function hmac(payload: string): string {
  return b64url(crypto.createHmac("sha256", getSecret()).update(payload).digest());
}

export function issueAdminToken(now: number = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const exp = iat + ADMIN_COOKIE_MAX_AGE_S;
  const payload = `${iat}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyAdminToken(
  token: string | undefined | null,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [iatStr, expStr, sig] = parts;
  const payload = `${iatStr}.${expStr}`;
  const expected = hmac(payload);
  // Constant-time string compare.
  if (
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return false;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return false;
  return now / 1000 < exp;
}

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE_S,
  checkAdminPassword,
  issueAdminToken,
} from "../../../../lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Login. Expects { password }. Sets the httpOnly admin_session cookie. */
export async function POST(req: Request) {
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* fall through — empty body */
  }
  const pw = body.password ?? "";
  if (!checkAdminPassword(pw)) {
    // 401 + small delay would also help against brute force, but the
    // PoC scale doesn't warrant rate-limit infrastructure.
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: issueAdminToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_S,
  });
  return res;
}

/** Logout — clear the cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

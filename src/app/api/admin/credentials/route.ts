import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  verifyAdminToken,
} from "../../../../lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseConfig(): { base: string; key: string } | null {
  const base =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}

async function requireAdmin(): Promise<NextResponse | null> {
  const jar = await cookies();
  const ok = verifyAdminToken(jar.get(ADMIN_COOKIE)?.value);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** GET — returns the stored ID and whether a password is set. Never leaks
 *  the password itself. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard) return guard;
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 500 });
  }
  const url = `${cfg.base}/rest/v1/korail_credentials?select=korail_id,korail_password,updated_at&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `supabase ${res.status}` },
      { status: 502 },
    );
  }
  const rows = (await res.json()) as {
    korail_id: string;
    korail_password: string;
    updated_at: string;
  }[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({
      ok: true,
      configured: false,
      korailId: null,
      hasPassword: false,
      updatedAt: null,
    });
  }
  const r = rows[0];
  return NextResponse.json({
    ok: true,
    configured: !!(r.korail_id && r.korail_password),
    korailId: r.korail_id ?? null,
    hasPassword: !!r.korail_password,
    updatedAt: r.updated_at ?? null,
  });
}

/** PUT — upsert the single 'default' row. Body: { korailId, korailPassword }. */
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 500 });
  }
  let body: { korailId?: string; korailPassword?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const id = (body.korailId ?? "").trim();
  const pw = (body.korailPassword ?? "").trim();
  if (!id || !pw) {
    return NextResponse.json(
      { ok: false, error: "korailId and korailPassword are required" },
      { status: 400 },
    );
  }
  const url = `${cfg.base}/rest/v1/korail_credentials?on_conflict=id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      {
        id: "default",
        korail_id: id,
        korail_password: pw,
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `supabase ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}

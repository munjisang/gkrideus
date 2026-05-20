import { NextResponse } from "next/server";
import {
  requireAdmin,
  supabaseConfig,
  supaFetch,
} from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — update password and/or enabled flag.
 *  Body: { accountPassword?, enabled? } */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: "supabase not configured" },
      { status: 500 },
    );
  }
  const { id } = await ctx.params;
  let body: { accountPassword?: string; enabled?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.accountPassword === "string") {
    const pw = body.accountPassword.trim();
    if (!pw) {
      return NextResponse.json(
        { ok: false, error: "accountPassword cannot be empty" },
        { status: 400 },
      );
    }
    patch.account_password = pw;
  }
  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled;
  }
  // Don't issue a no-op UPDATE.
  if (Object.keys(patch).length <= 1) {
    return NextResponse.json(
      { ok: false, error: "nothing to update" },
      { status: 400 },
    );
  }
  const url = `/rest/v1/service_accounts?id=eq.${encodeURIComponent(id)}`;
  const res = await supaFetch(cfg, url, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
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

/** DELETE — remove the account row entirely. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: "supabase not configured" },
      { status: 500 },
    );
  }
  const { id } = await ctx.params;
  const res = await supaFetch(
    cfg,
    `/rest/v1/service_accounts?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `supabase ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}

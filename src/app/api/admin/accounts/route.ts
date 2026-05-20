import { NextResponse } from "next/server";
import {
  requireAdmin,
  supabaseConfig,
  supaFetch,
} from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  service: "korail" | "srt";
  account_id: string;
  account_password: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const ALLOWED_SERVICES = new Set(["korail", "srt"]);

/** GET — list all accounts (newest first), never returns passwords. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard) return guard;
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: "supabase not configured" },
      { status: 500 },
    );
  }
  const res = await supaFetch(
    cfg,
    "/rest/v1/service_accounts?select=id,service,account_id,enabled,created_at,updated_at&order=service.asc,created_at.asc",
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `supabase ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  const rows = (await res.json()) as Omit<AccountRow, "account_password">[];
  return NextResponse.json({ ok: true, accounts: rows });
}

/** POST — create a new account.
 *  Body: { service: 'korail'|'srt', accountId, accountPassword, enabled? } */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: "supabase not configured" },
      { status: 500 },
    );
  }
  let body: {
    service?: string;
    accountId?: string;
    accountPassword?: string;
    enabled?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const service = String(body.service ?? "").toLowerCase();
  const aid = (body.accountId ?? "").trim();
  const apw = (body.accountPassword ?? "").trim();
  if (!ALLOWED_SERVICES.has(service)) {
    return NextResponse.json(
      { ok: false, error: "service must be 'korail' or 'srt'" },
      { status: 400 },
    );
  }
  if (!aid || !apw) {
    return NextResponse.json(
      { ok: false, error: "accountId and accountPassword are required" },
      { status: 400 },
    );
  }
  const enabled = body.enabled ?? true;
  const res = await supaFetch(cfg, "/rest/v1/service_accounts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        service,
        account_id: aid,
        account_password: apw,
        enabled,
      },
    ]),
  });
  if (!res.ok) {
    const text = await res.text();
    // 23505 = unique_violation (service, account_id)
    const conflict = /23505/.test(text);
    return NextResponse.json(
      {
        ok: false,
        error: conflict
          ? "이미 등록된 계정입니다."
          : `supabase ${res.status}: ${text.slice(0, 200)}`,
      },
      { status: conflict ? 409 : 502 },
    );
  }
  const rows = (await res.json()) as AccountRow[];
  return NextResponse.json({
    ok: true,
    account: rows[0]
      ? {
          id: rows[0].id,
          service: rows[0].service,
          account_id: rows[0].account_id,
          enabled: rows[0].enabled,
          created_at: rows[0].created_at,
          updated_at: rows[0].updated_at,
        }
      : null,
  });
}

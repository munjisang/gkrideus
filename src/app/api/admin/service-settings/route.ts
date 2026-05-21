import { NextResponse } from "next/server";
import {
  requireAdmin,
  supabaseConfig,
  supaFetch,
} from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  booking_fee_rate: number | string;
  booking_fee_basis: "regular" | "discounted";
  cancel_fee_rate: number | string;
  updated_at: string;
};

function rowToSettings(r: Row) {
  return {
    bookingFeeRate: Number(r.booking_fee_rate),
    bookingFeeBasis: r.booking_fee_basis,
    cancelFeeRate: Number(r.cancel_fee_rate),
    updatedAt: r.updated_at,
  };
}

/** GET — fetch the (single) default row. Returns hard-coded fallbacks
 *  when the row hasn't been seeded yet so the admin form can still render. */
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
    "/rest/v1/service_settings?id=eq.default&select=*&limit=1",
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `supabase ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  const rows = (await res.json()) as Row[];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      settings: {
        bookingFeeRate: 0.2,
        bookingFeeBasis: "discounted",
        cancelFeeRate: 0.1,
        updatedAt: null,
      },
    });
  }
  return NextResponse.json({ ok: true, settings: rowToSettings(rows[0]) });
}

/** PUT — partial update on the default row. Validates rates ∈ [0, 1]
 *  and basis ∈ {regular, discounted}. */
export async function PUT(req: Request) {
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
    bookingFeeRate?: number;
    bookingFeeBasis?: string;
    cancelFeeRate?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.bookingFeeRate !== undefined) {
    const v = Number(body.bookingFeeRate);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      return NextResponse.json(
        { ok: false, error: "bookingFeeRate must be in [0, 1]" },
        { status: 400 },
      );
    }
    patch.booking_fee_rate = v;
  }
  if (body.bookingFeeBasis !== undefined) {
    if (body.bookingFeeBasis !== "regular" && body.bookingFeeBasis !== "discounted") {
      return NextResponse.json(
        { ok: false, error: "bookingFeeBasis must be 'regular' or 'discounted'" },
        { status: 400 },
      );
    }
    patch.booking_fee_basis = body.bookingFeeBasis;
  }
  if (body.cancelFeeRate !== undefined) {
    const v = Number(body.cancelFeeRate);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      return NextResponse.json(
        { ok: false, error: "cancelFeeRate must be in [0, 1]" },
        { status: 400 },
      );
    }
    patch.cancel_fee_rate = v;
  }
  if (Object.keys(patch).length <= 1) {
    return NextResponse.json(
      { ok: false, error: "nothing to update" },
      { status: 400 },
    );
  }
  // Upsert: ensures the default row exists even on a fresh DB.
  const res = await supaFetch(cfg, "/rest/v1/service_settings", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([{ id: "default", ...patch }]),
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `supabase ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  const rows = (await res.json()) as Row[];
  return NextResponse.json({
    ok: true,
    settings: rows[0] ? rowToSettings(rows[0]) : null,
  });
}

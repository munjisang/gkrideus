import { NextResponse } from "next/server";
import { supabaseConfig, supaFetch } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public read endpoint for the fare settings the booking flow needs at
 *  checkout. Returns only rate/basis values — no admin auth required
 *  because these are visible to anyone making a booking anyway. */
export async function GET() {
  const fallback = {
    bookingFeeRate: 0.2,
    bookingFeeBasis: "discounted" as const,
    cancelFeeRate: 0.1,
  };
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json({ ok: true, settings: fallback });
  }
  const res = await supaFetch(
    cfg,
    "/rest/v1/service_settings?id=eq.default&select=booking_fee_rate,booking_fee_basis,cancel_fee_rate&limit=1",
  );
  if (!res.ok) {
    return NextResponse.json({ ok: true, settings: fallback });
  }
  const rows = (await res.json()) as {
    booking_fee_rate: number | string;
    booking_fee_basis: "regular" | "discounted";
    cancel_fee_rate: number | string;
  }[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, settings: fallback });
  }
  const r = rows[0];
  return NextResponse.json({
    ok: true,
    settings: {
      bookingFeeRate: Number(r.booking_fee_rate),
      bookingFeeBasis: r.booking_fee_basis,
      cancelFeeRate: Number(r.cancel_fee_rate),
    },
  });
}

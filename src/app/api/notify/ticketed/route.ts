import { NextResponse } from "next/server";
import { sendEmail } from "../../../../lib/mailer";
import { supabaseConfig, supaFetch } from "../../../../lib/supabaseAdmin";
import { durationMinutes } from "../../../../lib/format";
import { stationLabel, gradeLabel } from "../../../../lib/i18n";
import type {
  Order,
  Reservation,
  SeatType,
  TrainSchedule,
} from "../../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─────────────────────────────── small helpers */

function fmtTime(p: string): string {
  if (p.length < 12) return p;
  return `${p.slice(8, 10)}:${p.slice(10, 12)}`;
}
function fmtDateDots(p: string): string {
  if (p.length < 8) return p;
  return `${p.slice(0, 4)}.${p.slice(4, 6)}.${p.slice(6, 8)}`;
}
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

type Row = {
  id: string;
  created_at: string;
  trip_type: Order["tripType"];
  seat_type: Order["seatType"];
  inbound_seat_type: Order["seatType"] | null;
  passenger_count: number;
  pax_breakdown: Order["paxBreakdown"] | null;
  total_price: number;
  outbound: Order["outbound"];
  inbound: Order["inbound"] | null;
  passengers: Order["passengers"];
  reservation: Order["reservation"] | null;
  inbound_reservation: Order["reservation"] | null;
  pay_method: Order["payMethod"] | null;
  fee_settings: Order["feeSettings"] | null;
};
function rowToOrder(r: Row): Order {
  return {
    id: r.id,
    createdAt: r.created_at,
    tripType: r.trip_type,
    seatType: r.seat_type,
    inboundSeatType: r.inbound_seat_type ?? undefined,
    passengerCount: r.passenger_count,
    paxBreakdown: r.pax_breakdown ?? undefined,
    totalPrice: r.total_price,
    outbound: r.outbound,
    inbound: r.inbound ?? undefined,
    passengers: r.passengers,
    reservation: r.reservation ?? undefined,
    inboundReservation: r.inbound_reservation ?? undefined,
    payMethod: r.pay_method ?? undefined,
    feeSettings: r.fee_settings ?? undefined,
  };
}

async function loadOrderById(id: string): Promise<Order | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const res = await supaFetch(
    cfg,
    `/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Row[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rowToOrder(rows[0]);
}

async function patchReservation(
  orderId: string,
  leg: "out" | "in",
  reservation: Reservation,
): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  const col = leg === "out" ? "reservation" : "inbound_reservation";
  const res = await supaFetch(
    cfg,
    `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ [col]: reservation }),
    },
  );
  return res.ok;
}

/* ─────────────────────────────── email body */

type SeatedPax = { label: string; isSeated: boolean };

/** Per-passenger labels in display order (Adult→Child→Senior→Toddler).
 *  Toddlers carry isSeated=false — they ride without a dedicated seat. */
function seatedPaxLabels(order: Order): SeatedPax[] {
  const b = order.paxBreakdown;
  const out: SeatedPax[] = [];
  const add = (n: number | undefined, en: string, seated: boolean) => {
    for (let i = 1; i <= (n ?? 0); i++) {
      out.push({ label: `${en} ${i}`, isSeated: seated });
    }
  };
  if (b) {
    add(b.adults, "Adult", true);
    add(b.children, "Child", true);
    add(b.seniors, "Senior", true);
    add(b.toddlers, "Toddler", false);
  }
  if (out.length === 0) {
    for (let i = 1; i <= Math.max(1, order.passengerCount); i++) {
      out.push({ label: `Adult ${i}`, isSeated: true });
    }
  }
  return out;
}

function durationEn(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** One itinerary card — mirrors the /bookings/[id] 여정 LegBlock layout:
 *  badge·status·rsvId / train+class+date / times / stations / per-pax seats. */
function legHtml(
  label: string,
  train: TrainSchedule,
  rsv: Reservation | undefined,
  seatType: SeatType,
  paxLabels: SeatedPax[],
): string {
  const dur = durationEn(durationMinutes(train.depPlandTime, train.arrPlandTime));
  const classLabel = seatType === "first" ? "First" : "Standard";
  const depStation = stationLabel(train.depPlaceName, "en");
  const arrStation = stationLabel(train.arrPlaceName, "en");
  const trainName = gradeLabel(train.trainGradeName, "en");

  // Per-passenger car/seat rows (rsv.seats is the full tk_seat_info list).
  let seatRows = "";
  if (rsv?.seats && rsv.seats.length > 0) {
    let idx = 0;
    const rows = paxLabels
      .map((p) => {
        const seat = p.isSeated ? rsv.seats![idx++] : null;
        const val = seat
          ? `Car ${Number(seat.carNo) || seat.carNo} · ${esc(seat.seatNo)}`
          : "—";
        return `<tr>
          <td style="padding:3px 0;color:#475569;font-size:13px">${esc(p.label)}</td>
          <td style="padding:3px 0;text-align:right;color:#6d28d9;font-weight:600;font-size:13px">${val}</td>
        </tr>`;
      })
      .join("");
    seatRows = `<table style="width:100%;border-collapse:collapse;margin-top:10px;border-top:1px solid #f1f5f9"><tbody>${rows}</tbody></table>`;
  }

  return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff">
      <!-- badge · status · reservation no -->
      <div style="font-size:12px">
        <span style="font-weight:700;color:#0369a1;background:#f0f9ff;border:1px solid #bae6fd;padding:2px 8px;border-radius:6px">${esc(label)}</span>
        <span style="color:#cbd5e1"> · </span>
        <span style="font-weight:700;color:#6d28d9">Ticketed</span>
        ${
          rsv?.rsvId
            ? `<span style="color:#cbd5e1"> · </span><span style="font-weight:600;color:#475569">${esc(rsv.rsvId)}</span>`
            : ""
        }
      </div>
      <!-- train + class ········ date -->
      <div style="margin-top:12px;font-size:14px;color:#0f172a">
        <strong>${esc(trainName)} ${Number(train.trainNo) || train.trainNo}</strong>
        <span style="font-size:11px;font-weight:700;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;padding:1px 6px;border-radius:9999px;margin-left:4px">${classLabel}</span>
        <span style="float:right;color:#64748b;font-size:13px">${fmtDateDots(train.depPlandTime)}</span>
      </div>
      <!-- departure / arrival times + duration -->
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <tbody>
          <tr>
            <td style="font-size:16px;font-weight:700;color:#0f172a">${fmtTime(train.depPlandTime)}</td>
            <td style="text-align:center;font-size:12px;color:#94a3b8">${dur}</td>
            <td style="text-align:right;font-size:16px;font-weight:700;color:#0f172a">${fmtTime(train.arrPlandTime)}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#475569;padding-top:2px">${esc(depStation)}</td>
            <td></td>
            <td style="font-size:13px;color:#475569;text-align:right;padding-top:2px">${esc(arrStation)}</td>
          </tr>
        </tbody>
      </table>
      ${seatRows}
    </div>`;
}

function buildEmail(order: Order, triggerLeg: "out" | "in") {
  const booker = order.passengers[0];
  const paxLabels = seatedPaxLabels(order);

  // Only include legs that are ACTUALLY ticketed. For a round-trip
  // where just one leg has been issued, the email shows that leg only.
  const legCards: string[] = [];
  if (order.reservation?.ticketed) {
    legCards.push(
      legHtml("Outbound", order.outbound, order.reservation, order.seatType, paxLabels),
    );
  }
  if (
    order.tripType === "roundtrip" &&
    order.inbound &&
    order.inboundReservation?.ticketed
  ) {
    legCards.push(
      legHtml(
        "Inbound",
        order.inbound,
        order.inboundReservation,
        order.inboundSeatType ?? order.seatType,
        paxLabels,
      ),
    );
  }

  // Subject keys off the leg that triggered this send.
  const subjTrain = triggerLeg === "out" ? order.outbound : order.inbound!;
  const subject = `🎫 KTX Ticket Issued — ${stationLabel(subjTrain.depPlaceName, "en")} → ${stationLabel(subjTrain.arrPlaceName, "en")} (${fmtDateDots(subjTrain.depPlandTime)})`;

  // Absolute link to the booking detail — emails can't use relative URLs.
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://mykorailproject.vercel.app"
  ).replace(/\/$/, "");
  const detailUrl = `${siteUrl}/bookings/${encodeURIComponent(order.id)}`;

  const boardingGuide = [
    "Please arrive at the station at least 30 minutes early for a smooth ride.",
    "Please check the train, departure time, destination, and platform number on the departure information board.",
    "Please follow the sign to the appropriate platform.",
    "Please find your seat by E-ticket after boarding the train. If there is a request from the staff, please present your ticket.",
  ]
    .map(
      (line, i) =>
        `<li style="margin-bottom:6px">${i + 1}. ${esc(line)}</li>`,
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px 0">Your tickets have been issued</h2>
      <p style="color:#475569;margin:0 0 20px 0">
        ${esc(booker?.name ?? "Customer")}, your train tickets have been issued by KORAIL.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px">
        ${legCards.join("")}
      </div>

      <!-- Link to the booking detail page -->
      <div style="margin-top:20px;text-align:center">
        <a href="${detailUrl}"
           style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px">
          View Booking
        </a>
      </div>

      <!-- Boarding guide -->
      <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:12px">
        <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px">
          Boarding Guide
        </div>
        <ol style="margin:0;padding:0;list-style:none;color:#475569;font-size:13px;line-height:1.5">
          ${boardingGuide}
        </ol>
      </div>

      <p style="color:#94a3b8;font-size:12px;margin-top:24px;line-height:1.5">
        This is an automated email.
      </p>
    </div>`;
  return { subject, html };
}

/* ─────────────────────────────── route */

export async function POST(req: Request) {
  // Top-level guard so any unexpected throw surfaces as readable JSON
  // instead of an opaque 500.
  try {
    return await handle(req);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        stage: "crash",
        error: (e as Error)?.message ?? String(e),
        trace: (e as Error)?.stack?.split("\n").slice(0, 4).join("\n"),
      },
      { status: 500 },
    );
  }
}

async function handle(req: Request) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: true, skipped: "no GMAIL credentials" });
  }
  let body: { orderId?: string; leg?: "out" | "in" } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const orderId = (body.orderId ?? "").trim();
  const leg = body.leg === "in" ? "in" : "out";
  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "orderId required" },
      { status: 400 },
    );
  }
  const order = await loadOrderById(orderId);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "order not found" },
      { status: 404 },
    );
  }
  const rsv = leg === "out" ? order.reservation : order.inboundReservation;
  if (!rsv || !rsv.ticketed) {
    return NextResponse.json(
      { ok: false, error: "leg is not ticketed" },
      { status: 400 },
    );
  }
  if (rsv.notifiedTicketedAt) {
    // Idempotency: don't re-send.
    return NextResponse.json({ ok: true, skipped: "already_notified" });
  }
  const booker = order.passengers[0];
  if (!booker?.email) {
    return NextResponse.json(
      { ok: false, error: "no booker email on order" },
      { status: 400 },
    );
  }
  const { subject, html } = buildEmail(order, leg);
  const sendResult = await sendEmail({
    to: booker.email,
    subject,
    html,
  });
  if (!sendResult.ok) {
    return NextResponse.json(
      { ok: false, error: sendResult.error, skipped: sendResult.skipped },
      { status: sendResult.skipped ? 200 : 502 },
    );
  }
  // Persist the flag so future syncs don't re-send.
  await patchReservation(orderId, leg, {
    ...rsv,
    notifiedTicketedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, id: sendResult.id });
}

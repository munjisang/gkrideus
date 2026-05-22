import { NextResponse } from "next/server";
import { sendEmail } from "../../../../lib/mailer";
import { supabaseConfig, supaFetch } from "../../../../lib/supabaseAdmin";
import type {
  Order,
  Reservation,
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
function krw(n: number): string {
  return `${(n ?? 0).toLocaleString("ko-KR")}원`;
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

function seatRowsHtml(rsv: Reservation | undefined): string {
  if (!rsv?.seats || rsv.seats.length === 0) {
    if (rsv?.carNo && rsv?.seatNo) {
      const car = String(Number(rsv.carNo) || rsv.carNo);
      return `<div style="color:#475569">좌석: <strong>${car}호 ${esc(rsv.seatNo)}</strong></div>`;
    }
    return "";
  }
  const list = rsv.seats
    .map((s) => `${Number(s.carNo) || s.carNo}호 ${esc(s.seatNo)}`)
    .join(", ");
  return `<div style="color:#475569">좌석: <strong>${list}</strong></div>`;
}

function legHtml(
  label: string,
  train: TrainSchedule,
  rsv: Reservation | undefined,
): string {
  return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff">
      <div style="font-size:12px;font-weight:700;color:#0369a1;background:#f0f9ff;border:1px solid #bae6fd;display:inline-block;padding:2px 8px;border-radius:6px">${esc(label)}</div>
      <div style="margin-top:8px;font-size:14px;color:#0f172a;font-weight:600">
        ${esc(train.depPlaceName)} → ${esc(train.arrPlaceName)}
      </div>
      <div style="color:#475569;margin-top:4px">
        ${esc(train.trainGradeName)} ${Number(train.trainNo) || train.trainNo} · ${fmtDateDots(train.depPlandTime)} ${fmtTime(train.depPlandTime)} → ${fmtTime(train.arrPlandTime)}
      </div>
      ${seatRowsHtml(rsv)}
      ${rsv?.rsvId ? `<div style="color:#94a3b8;font-size:12px;margin-top:6px">예약번호 ${esc(rsv.rsvId)}</div>` : ""}
    </div>`;
}

function buildEmail(order: Order, leg: "out" | "in") {
  const train = leg === "out" ? order.outbound : order.inbound!;
  const rsv = leg === "out" ? order.reservation : order.inboundReservation;
  const booker = order.passengers[0];
  const subject = `🎫 KTX 예매 발권완료 — ${train.depPlaceName} → ${train.arrPlaceName} (${fmtDateDots(train.depPlandTime)})`;
  // Show the OTHER leg too so the booker sees the full trip context.
  const otherLeg =
    leg === "out"
      ? order.tripType === "roundtrip" && order.inbound
        ? legHtml("오는 편", order.inbound, order.inboundReservation)
        : ""
      : legHtml("가는 편", order.outbound, order.reservation);
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px 0">발권이 완료되었습니다</h2>
      <p style="color:#475569;margin:0 0 20px 0">
        ${esc(booker?.name ?? "고객")}님, 예매하신 승차권이 KORAIL에서 발권되었어요.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px">
        ${legHtml(leg === "out" ? "가는 편" : "오는 편", train, rsv)}
        ${otherLeg}
      </div>

      <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:12px">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span style="color:#475569">결제 금액</span>
          <strong style="color:#0369a1">${krw(order.totalPrice)}</strong>
        </div>
        ${
          order.payMethod
            ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-top:4px">
                 <span>결제수단</span><span>${order.payMethod === "card" ? "신용카드" : "Paypal"}</span>
               </div>`
            : ""
        }
      </div>

      <p style="color:#94a3b8;font-size:12px;margin-top:24px;line-height:1.5">
        자세한 정보는 KORAIL 모바일 앱 또는 letskorail.com에서 확인하실 수 있습니다.<br>
        본 메일은 자동 발송 메일입니다.
      </p>
    </div>`;
  return { subject, html };
}

/* ─────────────────────────────── route */

export async function POST(req: Request) {
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

import { NextResponse } from "next/server";
import { notifyDiscord, type DiscordEmbed } from "../../../../lib/discord";
import { supabaseConfig, supaFetch } from "../../../../lib/supabaseAdmin";
import type { Order, TrainSchedule } from "../../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ───────────────────────────── helpers (server-only) */

function fmtTime(plandTime: string): string {
  if (plandTime.length < 12) return plandTime;
  return `${plandTime.slice(8, 10)}:${plandTime.slice(10, 12)}`;
}
function fmtDateDots(plandTime: string): string {
  if (plandTime.length < 8) return plandTime;
  return `${plandTime.slice(0, 4)}.${plandTime.slice(4, 6)}.${plandTime.slice(6, 8)}`;
}
function krw(n: number): string {
  return `${(n ?? 0).toLocaleString("ko-KR")}원`;
}

/** Mirror of storage.rowToOrder — avoids importing the client storage
 *  module here. Keep these two in sync if the schema evolves. */
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

function paxSummary(o: Order): string {
  const b = o.paxBreakdown;
  if (!b) return `어른 ${o.passengerCount}`;
  const parts: string[] = [];
  if (b.adults) parts.push(`어른 ${b.adults}`);
  if (b.children) parts.push(`어린이 ${b.children}`);
  if (b.toddlers) parts.push(`유아 ${b.toddlers}`);
  if (b.seniors) parts.push(`경로 ${b.seniors}`);
  return parts.length ? parts.join(" · ") : `어른 ${o.passengerCount}`;
}

function legText(t: TrainSchedule, rsvId?: string): string {
  const lines = [
    `**${t.depPlaceName} → ${t.arrPlaceName}**`,
    `${t.trainGradeName} ${Number(t.trainNo) || t.trainNo}`,
    `${fmtDateDots(t.depPlandTime)} ${fmtTime(t.depPlandTime)} → ${fmtTime(t.arrPlandTime)}`,
  ];
  if (rsvId) lines.push(`예약번호 \`${rsvId}\``);
  return lines.join("\n");
}

/** Tailwind sky-500 (#0EA5E9) → matches our brand accent. */
const EMBED_COLOR = 0x0ea5e9;

function buildEmbed(o: Order): DiscordEmbed {
  const booker = o.passengers[0];
  const tripType = o.tripType === "roundtrip" ? "왕복" : "편도";
  const fields: DiscordEmbed["fields"] = [
    { name: "가는 편", value: legText(o.outbound, o.reservation?.rsvId), inline: false },
  ];
  if (o.tripType === "roundtrip" && o.inbound) {
    fields.push({
      name: "오는 편",
      value: legText(o.inbound, o.inboundReservation?.rsvId),
      inline: false,
    });
  }
  fields.push(
    { name: "인원", value: paxSummary(o), inline: true },
    { name: "결제 금액", value: krw(o.totalPrice), inline: true },
  );
  if (booker) {
    fields.push(
      { name: "예약자", value: booker.name || "—", inline: true },
      { name: "이메일", value: booker.email || "—", inline: true },
    );
  }
  const footerBits: string[] = [];
  if (o.payMethod) {
    footerBits.push(
      `결제수단 ${o.payMethod === "card" ? "신용카드" : "Paypal"}`,
    );
  }
  footerBits.push(`주문 ${o.id}`);
  return {
    title: `🎫 신규 예매 (${tripType})`,
    color: EMBED_COLOR,
    fields,
    footer: { text: footerBits.join(" · ") },
    timestamp: o.createdAt,
  };
}

/* ───────────────────────────── route */

export async function POST(req: Request) {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    // No webhook configured (e.g. local dev) — return success quietly
    // so the client's fire-and-forget call doesn't see a 5xx.
    return NextResponse.json({ ok: true, skipped: "no DISCORD_WEBHOOK_URL" });
  }
  let body: { orderId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → handled by the required-id check below */
  }
  const id = (body.orderId ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "orderId required" },
      { status: 400 },
    );
  }
  const order = await loadOrderById(id);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "order not found" },
      { status: 404 },
    );
  }
  const embed = buildEmbed(order);
  const sent = await notifyDiscord({
    username: "Korail Booking",
    embeds: [embed],
  });
  return NextResponse.json({ ok: sent });
}

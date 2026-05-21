"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadOrders, updateOrder } from "../../../lib/storage";
import { fmtTime, fmtDateTime, durationMinutes } from "../../../lib/format";
import { fmtDateDots, durationL, krwL } from "../../../lib/format-i18n";
import { useI18n, stationLabel, type Lang } from "../../../lib/i18n";
import { countryLabel } from "../../../lib/countries";
import { summarizeFares } from "../../../lib/fareCalc";
import { TrainLogo } from "../../../components/TrainLogo";
import type {
  Order,
  PayMethod,
  Reservation,
  SeatPref,
  SeatType,
  TrainSchedule,
} from "../../../lib/types";

type StatusKey = "pending" | "confirmed" | "ticketed" | "cancelled";

function rsvStatus(r: Reservation | undefined): StatusKey {
  if (!r) return "cancelled";
  if (r.cancelled) return "cancelled";
  if (r.ticketed) return "ticketed";
  if (r.confirmed) return "confirmed";
  return "pending";
}

/** Whole-order status used to decide whether to show the cancellation
 *  section. "cancelled" only when EVERY leg is cancelled. */
function orderStatus(o: Order): StatusKey {
  const out = rsvStatus(o.reservation);
  const inn =
    o.tripType === "roundtrip" ? rsvStatus(o.inboundReservation) : null;
  if (out === "cancelled" && (inn === null || inn === "cancelled")) {
    return "cancelled";
  }
  if (out === "ticketed" && (inn === null || inn === "ticketed")) {
    return "ticketed";
  }
  if (out === "confirmed" && (inn === null || inn === "confirmed")) {
    return "confirmed";
  }
  return "pending";
}

const SEAT_PREF_KEY: Record<SeatPref, string> = {
  none: "ord.seatPref.none",
  window: "ord.seatPref.window",
  aisle: "ord.seatPref.aisle",
};

const PAY_METHOD_KEY: Record<PayMethod, string> = {
  card: "bk.payMethod.card",
  paypal: "bk.payMethod.paypal",
};

/** Expand a Korail seat range ("11A" → "11B") into the individual seat
 *  strings. Falls back gracefully when the range can't be parsed or when
 *  no end seat is provided. */
function expandSeats(
  seatNo: string | undefined,
  seatNoEnd: string | undefined,
  totalCount: number,
): string[] {
  if (!seatNo) return [];
  if (!seatNoEnd || seatNoEnd === seatNo) {
    // Single declared seat — just that one slot.
    return [seatNo];
  }
  const m1 = seatNo.match(/^(\d+)([A-Za-z])$/);
  const m2 = seatNoEnd.match(/^(\d+)([A-Za-z])$/);
  if (!m1 || !m2) return [seatNo, seatNoEnd];
  const row1 = m1[1];
  const col1 = m1[2].toUpperCase().charCodeAt(0);
  const row2 = m2[1];
  const col2 = m2[2].toUpperCase().charCodeAt(0);
  // Same row → simple A..B/C/D enumeration.
  if (row1 === row2) {
    const out: string[] = [];
    for (let c = col1; c <= col2 && out.length < totalCount + 8; c++) {
      out.push(`${row1}${String.fromCharCode(c)}`);
    }
    return out;
  }
  // Different rows — return the endpoints; caller pads/truncates.
  return [seatNo, seatNoEnd];
}

/** Generate per-passenger labels for seated pax types (toddlers excluded
 *  since they ride without a dedicated seat). */
function seatedPaxLabels(
  order: Order,
  t: (k: string, p?: Record<string, string | number>) => string,
): { label: string; isSeated: boolean }[] {
  const b = order.paxBreakdown ?? {
    adults: order.passengerCount,
    children: 0,
    toddlers: 0,
    seniors: 0,
  };
  const out: { label: string; isSeated: boolean }[] = [];
  for (let i = 1; i <= (b.adults ?? 0); i++)
    out.push({ label: `${t("pax.adult")}${i}`, isSeated: true });
  for (let i = 1; i <= (b.children ?? 0); i++)
    out.push({ label: `${t("pax.child")}${i}`, isSeated: true });
  for (let i = 1; i <= (b.seniors ?? 0); i++)
    out.push({ label: `${t("pax.senior")}${i}`, isSeated: true });
  for (let i = 1; i <= (b.toddlers ?? 0); i++)
    out.push({ label: `${t("pax.toddler")}${i}`, isSeated: false });
  if (out.length === 0)
    out.push({ label: t("pax.adult"), isSeated: true });
  return out;
}

/** ISO timestamp → "YYYY.MM.DD HH:mm" for display. */
function fmtAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { t, lang } = useI18n();

  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [cancelling, setCancelling] = useState<"out" | "in" | null>(null);

  useEffect(() => {
    loadOrders()
      .then((rows) => setOrder(rows.find((o) => o.id === id) ?? null))
      .catch(() => setOrder(null));
  }, [id]);

  const fareSummary = useMemo(() => {
    if (!order) return null;
    return summarizeFares(
      order.outbound,
      order.seatType,
      order.tripType === "roundtrip" ? order.inbound ?? null : null,
      order.inboundSeatType ?? order.seatType,
      order.passengerCount,
      order.paxBreakdown ?? null,
    );
  }, [order]);

  /** Tracking-only per-pax cancel: just append the index to
   *  cancelledPaxIndexes. Caller is responsible for deciding whether
   *  this is the "last" pax — that branch goes through cancelLeg. */
  async function cancelPaxLocal(leg: "out" | "in", paxIdx: number) {
    if (!order) return;
    const src = leg === "out" ? order.reservation : order.inboundReservation;
    if (!src) return;
    const prev = src.cancelledPaxIndexes ?? [];
    if (prev.includes(paxIdx)) return;
    const next: Reservation = {
      ...src,
      cancelledPaxIndexes: [...prev, paxIdx],
    };
    const patch: Partial<Order> = {};
    if (leg === "out") patch.reservation = next;
    else patch.inboundReservation = next;
    const updated = await updateOrder(order.id, patch);
    setOrder(updated ?? { ...order, ...patch });
  }

  /** Undo a tracking-only cancel. No KORAIL side-effect. */
  async function restorePax(leg: "out" | "in", paxIdx: number) {
    if (!order) return;
    const src = leg === "out" ? order.reservation : order.inboundReservation;
    if (!src) return;
    const prev = src.cancelledPaxIndexes ?? [];
    if (!prev.includes(paxIdx)) return;
    const next: Reservation = {
      ...src,
      cancelledPaxIndexes: prev.filter((i) => i !== paxIdx),
    };
    const patch: Partial<Order> = {};
    if (leg === "out") patch.reservation = next;
    else patch.inboundReservation = next;
    const updated = await updateOrder(order.id, patch);
    setOrder(updated ?? { ...order, ...patch });
  }

  /** Last-pax branch: explicit confirm + real KORAIL cancel. On failure
   *  we leave both the cancelledPaxIndexes and reservation.cancelled
   *  flag untouched so the user can retry. */
  async function cancelPaxLast(leg: "out" | "in", paxIdx: number) {
    if (!order) return;
    const rsv = leg === "out" ? order.reservation : order.inboundReservation;
    if (!rsv || rsv.mode !== "live" || !rsv.rsvId || rsv.cancelled) return;
    if (!confirm(t("bk.pax.lastCancelConfirm"))) return;
    setCancelling(leg);
    try {
      const res = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvId: rsv.rsvId }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; stage?: string };
      if (!res.ok || !j.ok) {
        alert(t("bk.cancelFail", { m: j.error ?? j.stage ?? `HTTP ${res.status}` }));
        return;
      }
      const flagged: Reservation = {
        ...rsv,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
        cancelledPaxIndexes: [
          ...new Set([...(rsv.cancelledPaxIndexes ?? []), paxIdx]),
        ],
      };
      const patch: Partial<Order> = {};
      if (leg === "out") patch.reservation = flagged;
      else patch.inboundReservation = flagged;
      const updated = await updateOrder(order.id, patch);
      setOrder(updated ?? { ...order, ...patch });
      alert(t("bk.cancelDone"));
    } catch (e) {
      alert(t("bk.cancelFail", { m: (e as Error).message }));
    } finally {
      setCancelling(null);
    }
  }

  async function cancelLeg(leg: "out" | "in") {
    if (!order) return;
    const rsv = leg === "out" ? order.reservation : order.inboundReservation;
    if (!rsv || rsv.mode !== "live" || !rsv.rsvId || rsv.cancelled) return;
    if (!confirm(t("bk.cancelConfirm"))) return;
    setCancelling(leg);
    try {
      const res = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvId: rsv.rsvId }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; stage?: string };
      if (!res.ok || !j.ok) {
        alert(t("bk.cancelFail", { m: j.error ?? j.stage ?? `HTTP ${res.status}` }));
        return;
      }
      const flagged: Reservation = {
        ...rsv,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
      };
      const patch: Partial<Order> = {};
      if (leg === "out") patch.reservation = flagged;
      else patch.inboundReservation = flagged;
      const next = await updateOrder(order.id, patch);
      setOrder(next ?? { ...order, ...patch });
      alert(t("bk.cancelDone"));
    } catch (e) {
      alert(t("bk.cancelFail", { m: (e as Error).message }));
    } finally {
      setCancelling(null);
    }
  }

  const header = (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
      <div className="mx-4 sm:mx-6 lg:mx-[470px] flex items-center py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("back")}
          className="h-10 w-10 grid place-items-center text-slate-800 -ml-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-slate-900">
          {t("bk.detail.title")}
        </h1>
        <span className="w-10" />
      </div>
    </div>
  );

  if (order === undefined) {
    return (
      <div className="bg-slate-50 min-h-full">
        {header}
        <div className="mx-4 sm:mx-6 lg:mx-[470px] py-16 text-center text-sm text-slate-400">
          {t("common.loading")}
        </div>
      </div>
    );
  }
  if (order === null) {
    return (
      <div className="bg-slate-50 min-h-full">
        {header}
        <div className="mx-4 sm:mx-6 lg:mx-[470px] py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {t("bk.notFound", { id })}
          </div>
          <Link href="/bookings" className="inline-block mt-4 text-sky-700 text-sm">
            ← {t("bk.title")}
          </Link>
        </div>
      </div>
    );
  }

  const ostatus = orderStatus(order);
  const booker = order.passengers[0];
  const outStatus = rsvStatus(order.reservation);
  const inStatus =
    order.tripType === "roundtrip"
      ? rsvStatus(order.inboundReservation)
      : null;
  // Sum row totals for the payment summary section.
  const totalRegular =
    fareSummary?.rows.reduce((s, r) => s + r.regular, 0) ?? 0;
  const totalDiscount =
    fareSummary?.rows.reduce((s, r) => s + r.discount, 0) ?? 0;
  const totalNetPay =
    fareSummary?.rows.reduce((s, r) => s + r.netPay, 0) ?? 0;
  const totalFee = fareSummary?.rows.reduce((s, r) => s + r.fee, 0) ?? 0;
  const grandTotal = fareSummary?.total ?? order.totalPrice;
  // 취소수수료 = 10% of grand total (ceil to 100원).
  const cancelFee = Math.ceil((grandTotal * 0.1) / 100) * 100;

  return (
    <div className="bg-slate-50 min-h-full">
      {header}
      <div className="mx-4 sm:mx-6 lg:mx-[470px] py-4 pb-10 space-y-2">
        {/* Per-passenger labels used by the seat-assignment rows inside
            each leg block. Toddlers carry isSeated=false. */}
        {(() => null)()}
        {/* ── 1. 여정 (Itinerary) — list-style LegBlocks. */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <h2 className="font-semibold px-5 pt-4 text-slate-800">
            {t("bk.section.itinerary")}
          </h2>
          <LegBlock
            leg="out"
            label={t("ord.legOut")}
            status={outStatus}
            train={order.outbound}
            rsv={order.reservation}
            lang={lang}
            t={t}
            cancelling={cancelling === "out"}
            onCancel={() => cancelLeg("out")}
            paxLabels={seatedPaxLabels(order, t)}
            seatType={order.seatType}
            onPaxCancelLocal={(idx) => cancelPaxLocal("out", idx)}
            onPaxCancelLast={(idx) => cancelPaxLast("out", idx)}
            onPaxRestore={(idx) => restorePax("out", idx)}
          />
          {order.tripType === "roundtrip" && order.inbound && inStatus !== null && (
            <>
              <div className="mx-5 border-t border-dashed border-slate-200" />
              <LegBlock
                leg="in"
                label={t("ord.legIn")}
                status={inStatus}
                train={order.inbound}
                rsv={order.inboundReservation}
                lang={lang}
                t={t}
                cancelling={cancelling === "in"}
                onCancel={() => cancelLeg("in")}
                paxLabels={seatedPaxLabels(order, t)}
                seatType={order.inboundSeatType ?? order.seatType}
                onPaxCancelLocal={(idx) => cancelPaxLocal("in", idx)}
                onPaxCancelLast={(idx) => cancelPaxLast("in", idx)}
                onPaxRestore={(idx) => restorePax("in", idx)}
              />
            </>
          )}
        </section>

        {/* ── 2. 인원정보 */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.paxInfo")}</h2>
          <ul className="divide-y divide-slate-100">
            {paxRowsFor(order, t).map((r) => (
              <li
                key={r.label}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="text-slate-600">{r.label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {t("pax.count", { n: r.count })}
                </span>
              </li>
            ))}
            {order.seatPref && (
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-slate-600">{t("ord.seatPref")}</span>
                <span className="font-semibold text-slate-900">
                  {t(SEAT_PREF_KEY[order.seatPref])}
                </span>
              </li>
            )}
          </ul>
        </section>

        {/* ── 3. 예약자 정보 */}
        {booker && (
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold mb-3 text-slate-800">{t("ord.booker")}</h2>
            <ul className="divide-y divide-slate-100">
              <KvRow label={t("ord.name")} value={booker.name} />
              <KvRow label={t("ord.email")} value={booker.email} />
              {booker.countryCode && (
                <KvRow
                  label={t("ord.country")}
                  value={countryLabel(booker.countryCode, lang)}
                />
              )}
            </ul>
          </section>
        )}

        {/* ── 4. 결제정보 */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.payInfo")}</h2>
          <div className="space-y-1.5 text-sm">
            <KvLine
              label={t("bk.pay.method")}
              value={
                order.payMethod
                  ? t(PAY_METHOD_KEY[order.payMethod])
                  : "—"
              }
            />
            <KvLine
              label={t("bk.pay.at")}
              value={fmtAt(order.createdAt) ?? "—"}
            />
            <div className="pt-1 mt-1 border-t border-slate-100" />
            <KvLine
              label={t("ord.fare.regular")}
              value={krwL(totalRegular, lang)}
            />
            <KvLine
              label={t("ord.fare.discount")}
              value={
                totalDiscount > 0
                  ? `-${krwL(totalDiscount, lang)}`
                  : krwL(0, lang)
              }
            />
            <KvLine
              label={t("ord.fare.netPay")}
              value={krwL(totalNetPay, lang)}
            />
            <KvLine label={t("ord.fare.fee")} value={krwL(totalFee, lang)} />
            <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">
                {t("ord.total")}
              </span>
              <span className="text-base font-bold text-sky-700 tabular-nums">
                {krwL(grandTotal, lang)}
              </span>
            </div>
          </div>
        </section>

        {/* ── 5. 취소내역 (only when the whole order is cancelled) */}
        {ostatus === "cancelled" && (
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold mb-3 text-slate-800">
              {t("bk.section.cancellation")}
            </h2>
            <div className="space-y-1.5 text-sm">
              <KvLine
                label={t("bk.pay.method")}
                value={
                  order.payMethod
                    ? t(PAY_METHOD_KEY[order.payMethod])
                    : "—"
                }
              />
              <KvLine
                label={t("bk.cancel.at")}
                value={
                  fmtAt(
                    order.reservation?.cancelledAt ??
                      order.inboundReservation?.cancelledAt,
                  ) ?? "—"
                }
              />
              <div className="pt-1 mt-1 border-t border-slate-100" />
              <KvLine
                label={t("ord.fare.regular")}
                value={krwL(totalRegular, lang)}
              />
              <KvLine
                label={t("ord.fare.discount")}
                value={
                  totalDiscount > 0
                    ? `-${krwL(totalDiscount, lang)}`
                    : krwL(0, lang)
                }
              />
              <KvLine
                label={t("ord.fare.netPay")}
                value={krwL(totalNetPay, lang)}
              />
              <KvLine label={t("ord.fare.fee")} value={krwL(totalFee, lang)} />
              <KvLine label={t("bk.payAmount")} value={krwL(grandTotal, lang)} />
              <KvLine
                label={t("bk.cancelFee")}
                value={`-${krwL(cancelFee, lang)}`}
              />
              {/* 환불 합계 — mirrors the 결제정보 section's bold sky line. */}
              <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {t("bk.cancelAmount")}
                </span>
                <span className="text-base font-bold text-sky-700 tabular-nums">
                  {krwL(Math.max(0, grandTotal - cancelFee), lang)}
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────── shared bits */

function paxRowsFor(
  order: Order,
  t: (k: string, p?: Record<string, string | number>) => string,
): { label: string; count: number }[] {
  const b = order.paxBreakdown;
  const rows: { label: string; count: number }[] = [];
  if (!b) {
    rows.push({ label: t("pax.adult"), count: order.passengerCount });
    return rows;
  }
  if (b.adults) rows.push({ label: t("pax.adult"), count: b.adults });
  if (b.children) rows.push({ label: t("pax.child"), count: b.children });
  if (b.toddlers) rows.push({ label: t("pax.toddler"), count: b.toddlers });
  if (b.seniors) rows.push({ label: t("pax.senior"), count: b.seniors });
  if (rows.length === 0) {
    rows.push({ label: t("pax.adult"), count: order.passengerCount });
  }
  return rows;
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between py-2.5 text-sm gap-3">
      <span className="text-slate-600 shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 break-all text-right">
        {value}
      </span>
    </li>
  );
}

function KvLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800 tabular-nums">{value}</span>
    </div>
  );
}

function StatusText({
  status,
  t,
}: {
  status: StatusKey;
  t: (k: string) => string;
}) {
  // Color scheme per spec:
  //   pending   → green
  //   confirmed → blue
  //   cancelled → red
  //   ticketed  → violet (unchanged — not in spec)
  const cls =
    status === "ticketed"
      ? "text-violet-700"
      : status === "confirmed"
        ? "text-sky-600"
        : status === "pending"
          ? "text-emerald-600"
          : "text-red-600";
  const label =
    status === "ticketed"
      ? t("bk.status.ticketed")
      : status === "confirmed"
        ? t("bk.status.confirmed")
        : status === "pending"
          ? t("bk.status.pending")
          : t("bk.status.cancelled");
  return <span className={`text-xs font-semibold ${cls}`}>{label}</span>;
}

/** Same layout as the list card's LegBlock, with an optional in-block
 *  cancel button for active legs. No footer (총인원/금액 lives in the
 *  결제정보 section). */
function LegBlock({
  leg,
  label,
  status,
  train,
  rsv,
  lang,
  t,
  cancelling,
  onCancel,
  paxLabels,
  seatType,
  onPaxCancelLocal,
  onPaxCancelLast,
  onPaxRestore,
}: {
  leg: "out" | "in";
  label: string;
  status: StatusKey;
  train: TrainSchedule;
  rsv: Reservation | undefined;
  lang: Lang;
  t: (k: string, p?: Record<string, string | number>) => string;
  cancelling: boolean;
  onCancel: () => void;
  /** All passengers on this order. Toddlers carry isSeated=false so we
   *  can render an em-dash instead of pretending they have a seat. */
  paxLabels: { label: string; isSeated: boolean }[];
  /** Seat class picked at checkout for this leg (standard / first). */
  seatType: SeatType;
  /** DB-only cancel for a non-last pax. */
  onPaxCancelLocal: (paxIdx: number) => void;
  /** Real KORAIL PNR cancel — triggered only on the last active pax. */
  onPaxCancelLast: (paxIdx: number) => void;
  /** Restore a tracking-only cancelled pax. */
  onPaxRestore: (paxIdx: number) => void;
}) {
  const mins = durationMinutes(train.depPlandTime, train.arrPlandTime);
  const dim = status === "cancelled";
  const muted = (cls: string) => (dim ? "text-slate-400" : cls);
  // After ticketing the seat is locked in on Korail's side; cancellation
  // must go through their refund flow rather than our in-app cancel API.
  const showCancel =
    (status === "pending" || status === "confirmed") &&
    !!rsv &&
    rsv.mode === "live" &&
    !!rsv.rsvId;
  // Detail page intentionally keeps cancelled legs on the white card
  // background — only the text/logo dim, no slate-100 shade like the list.
  return (
    <div className="px-5 py-4" data-leg={leg}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs font-bold rounded px-2 py-0.5 leading-tight border ${
            dim
              ? "text-slate-400 bg-slate-100 border-slate-200"
              : "text-sky-700 bg-sky-50 border-sky-100"
          }`}
        >
          {label}
        </span>
        <span className="text-slate-300">·</span>
        <StatusText status={status} t={t} />
        {rsv?.rsvId && (
          <>
            <span className="text-slate-300">·</span>
            <span className={`text-xs font-semibold tabular-nums ${muted("text-slate-600")}`}>
              {rsv.rsvId}
            </span>
          </>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 pt-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <TrainLogo name={train.trainGradeName} dim={dim} />
          <span className={`text-sm font-semibold ${muted("text-slate-500")}`}>
            {Number(train.trainNo) || train.trainNo}
          </span>
          <span
            className={`self-center inline-flex items-center h-5 px-2 text-[11px] font-bold rounded-full border ${
              dim
                ? "bg-slate-100 text-slate-400 border-slate-200"
                : seatType === "first"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
            }`}
          >
            {seatType === "first" ? t("sr.first") : t("sr.standard")}
          </span>
        </div>
        <span className={`text-sm tabular-nums shrink-0 ${muted("text-slate-500")}`}>
          {fmtDateDots(train.depPlandTime)}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-3">
        <span
          className={`text-base font-bold tabular-nums leading-none whitespace-nowrap ${muted(
            "text-slate-900",
          )}`}
        >
          {fmtTime(train.depPlandTime)}
        </span>
        <span className="h-px flex-1 bg-slate-200" aria-hidden />
        <span className={`text-xs whitespace-nowrap ${muted("text-slate-400")}`}>
          {durationL(mins, lang)}
        </span>
        <span className="h-px flex-1 bg-slate-200" aria-hidden />
        <span
          className={`text-base font-bold tabular-nums leading-none whitespace-nowrap ${muted(
            "text-slate-900",
          )}`}
        >
          {fmtTime(train.arrPlandTime)}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className={`text-sm whitespace-nowrap ${muted("text-slate-600")}`}>
          {stationLabel(train.depPlaceName, lang)}
        </span>
        <span className={`text-sm whitespace-nowrap ${muted("text-slate-600")}`}>
          {stationLabel(train.arrPlaceName, lang)}
        </span>
      </div>

      {/* Per-passenger 호차/좌석 assignments (only once ticketed).
       *
       * Preferred path: `rsv.seats` is the full per-passenger array from
       * Korail's `tk_seat_info` (filled by our patched sync). Fall back
       * to expanding a `seatNo`..`seatNoEnd` range for legacy rows that
       * predate the seats-array migration. */}
      {status === "ticketed" && (rsv?.seats?.length || (rsv?.carNo && rsv?.seatNo)) && (
        <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          {(() => {
            const seatedCount = paxLabels.filter((p) => p.isSeated).length;
            const seatList: { carNo: string; seatNo: string }[] =
              rsv!.seats && rsv!.seats.length > 0
                ? rsv!.seats
                : expandSeats(rsv!.seatNo, rsv!.seatNoEnd, seatedCount).map(
                    (s) => ({ carNo: rsv!.carNo ?? "", seatNo: s }),
                  );
            const fmtCar = (car: string) =>
              lang === "ko"
                ? `${Number(car) || car}호`
                : `Car ${Number(car) || car}`;
            let seatIdx = 0;
            return paxLabels.map((p) => {
              const seat = p.isSeated ? seatList[seatIdx++] : null;
              return (
                <li
                  key={p.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-600">{p.label}</span>
                  <span className="font-semibold text-violet-700 tabular-nums">
                    {seat ? `${fmtCar(seat.carNo)} ${seat.seatNo}` : "—"}
                  </span>
                </li>
              );
            });
          })()}
        </ul>
      )}

      {/* Per-passenger 예매 관리 — only meaningful for multi-seat
       *  bookings still in pending/confirmed state. KORAIL itself only
       *  cancels at PNR granularity, so non-last cancels are stored as
       *  tracking-only flags (DB) and only the last active pax triggers
       *  the real KORAIL cancel via onPaxCancelLast. */}
      {(() => {
        const isManageable =
          (status === "pending" || status === "confirmed") &&
          !!rsv?.rsvId &&
          !rsv.cancelled;
        const seatedIndexes = paxLabels
          .map((p, i) => (p.isSeated ? i : -1))
          .filter((i) => i >= 0);
        const seatedCount = seatedIndexes.length;
        if (!isManageable || seatedCount < 2) return null;
        const cancelledSet = new Set(rsv!.cancelledPaxIndexes ?? []);
        const activeSeated = seatedIndexes.filter((i) => !cancelledSet.has(i));
        return (
          <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
            {paxLabels.map((p, idx) => {
              const isCancelled = cancelledSet.has(idx);
              const isLast =
                p.isSeated && !isCancelled && activeSeated.length === 1 && activeSeated[0] === idx;
              return (
                <li
                  key={`mgmt-${p.label}-${idx}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span
                    className={
                      isCancelled
                        ? "text-slate-400 line-through"
                        : "text-slate-700"
                    }
                  >
                    {p.label}
                  </span>
                  {!p.isSeated ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : isCancelled ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-red-600">
                        {t("bk.pax.cancelled")}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPaxRestore(idx)}
                        disabled={cancelling}
                        className="h-7 px-2 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {t("bk.pax.restore")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        isLast ? onPaxCancelLast(idx) : onPaxCancelLocal(idx)
                      }
                      disabled={cancelling}
                      className="h-7 px-2 rounded-md border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t("bk.pax.cancel")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        );
      })()}

      {/* Single-seat bookings keep the original "예매 취소" button —
       *  per-pax controls would be redundant for one passenger. */}
      {showCancel &&
        paxLabels.filter((p) => p.isSeated).length < 2 && (
          <div className="pt-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="h-9 px-4 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition"
            >
              {cancelling ? t("bk.cancelling") : t("bk.cancel")}
            </button>
          </div>
        )}
      {/* keep fmtDateTime referenced to silence unused-import warnings
          when 결제일시 is the only timestamp displayed. */}
      <input
        type="hidden"
        data-paid-at={rsv?.reservedAt ? fmtDateTime(_isoToPlandTime(rsv.reservedAt)) : ""}
      />
    </div>
  );
}

/** ISO timestamp → YYYYMMDDHHmm so we can reuse fmtDateTime. */
function _isoToPlandTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

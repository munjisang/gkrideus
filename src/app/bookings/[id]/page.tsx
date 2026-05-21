"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadOrders, updateOrder } from "../../../lib/storage";
import { fmtDateTime } from "../../../lib/format";
import { krwL } from "../../../lib/format-i18n";
import { useI18n, type Lang } from "../../../lib/i18n";
import { countryLabel } from "../../../lib/countries";
import { summarizeFares } from "../../../lib/fareCalc";
import LegSummary from "../../../components/LegSummary";
import type { Order, Reservation, SeatPref } from "../../../lib/types";

type StatusKey = "live" | "dry" | "cancelled";

function statusOf(o: Order): StatusKey {
  const r = o.reservation;
  if (!r) return "cancelled";
  if (r.cancelled) return "cancelled";
  if (r.mode === "live" && !!r.rsvId) return "live";
  if (r.mode === "dry") return "dry";
  return "cancelled";
}

const SEAT_PREF_KEY: Record<SeatPref, string> = {
  none: "ord.seatPref.none",
  window: "ord.seatPref.window",
  aisle: "ord.seatPref.aisle",
};

/** Next 16 wraps dynamic route params in a Promise. */
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
      .then((rows) => {
        const found = rows.find((o) => o.id === id);
        setOrder(found ?? null);
      })
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
      // Flag the leg as cancelled but keep rsvId/deadline for history.
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

  // ── Render shells: header is the same for every state.
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
          <Link
            href="/bookings"
            className="inline-block mt-4 text-sky-700 text-sm"
          >
            ← {t("bk.title")}
          </Link>
        </div>
      </div>
    );
  }

  const status = statusOf(order);
  const booker = order.passengers[0];
  const outRsv = order.reservation;
  const inRsv = order.inboundReservation;

  return (
    <div className="bg-slate-50 min-h-full">
      {header}
      <div className="mx-4 sm:mx-6 lg:mx-[470px] py-4 pb-10 space-y-2">
        {/* 1. Reservation info */}
        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("bk.rsvInfo")}</h2>
          <RsvBlock
            leg="out"
            label={t("ord.legOut")}
            status={status}
            rsv={outRsv}
            t={t}
            lang={lang}
            cancelling={cancelling === "out"}
            onCancel={() => cancelLeg("out")}
          />
          {order.tripType === "roundtrip" && (
            <>
              <div className="my-3 border-t border-dashed border-slate-200" />
              <RsvBlock
                leg="in"
                label={t("ord.legIn")}
                status={
                  inRsv?.mode === "live" && inRsv.rsvId
                    ? "live"
                    : inRsv?.mode === "dry"
                      ? "dry"
                      : "cancelled"
                }
                rsv={inRsv}
                t={t}
                lang={lang}
                cancelling={cancelling === "in"}
                onCancel={() => cancelLeg("in")}
              />
            </>
          )}
        </section>

        {/* 2. Selected trains */}
        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.selectedTrain")}</h2>
          <LegSummary label={t("ord.legOut")} train={order.outbound} lang={lang} />
          <div className="mt-2 flex items-center justify-end text-xs text-slate-500">
            {order.seatType === "first" ? t("sr.first") : t("sr.standard")}
          </div>
          {order.tripType === "roundtrip" && order.inbound && (
            <>
              <div className="my-4 border-t border-dashed border-slate-200" />
              <LegSummary label={t("ord.legIn")} train={order.inbound} lang={lang} />
              <div className="mt-2 flex items-center justify-end text-xs text-slate-500">
                {(order.inboundSeatType ?? order.seatType) === "first"
                  ? t("sr.first")
                  : t("sr.standard")}
              </div>
            </>
          )}
        </section>

        {/* 3. Passengers */}
        <section className="bg-white border border-slate-200 p-5">
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

        {/* 4. Booker info */}
        {booker && (
          <section className="bg-white border border-slate-200 p-5">
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

        {/* 5. Payment summary — sums of the per-pax fare blocks. */}
        {fareSummary && (
          <section className="bg-white border border-slate-200 p-5">
            <h2 className="font-semibold mb-3 text-slate-800">{t("ord.payInfo")}</h2>
            <div className="space-y-1.5 text-sm">
              <KvLine
                label={t("ord.fare.regular")}
                value={krwL(
                  fareSummary.rows.reduce((s, r) => s + r.regular, 0),
                  lang,
                )}
              />
              <KvLine
                label={t("ord.fare.discount")}
                value={(() => {
                  const d = fareSummary.rows.reduce((s, r) => s + r.discount, 0);
                  return d > 0 ? `-${krwL(d, lang)}` : krwL(0, lang);
                })()}
              />
              <KvLine
                label={t("ord.fare.netPay")}
                value={krwL(
                  fareSummary.rows.reduce((s, r) => s + r.netPay, 0),
                  lang,
                )}
              />
              <KvLine
                label={t("ord.fare.fee")}
                value={krwL(
                  fareSummary.rows.reduce((s, r) => s + r.fee, 0),
                  lang,
                )}
              />
              <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {t("ord.total")}
                </span>
                <span className="text-base font-bold text-sky-700 tabular-nums">
                  {krwL(fareSummary.total, lang)}
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

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

function RsvBlock({
  leg,
  label,
  status,
  rsv,
  t,
  lang,
  cancelling,
  onCancel,
}: {
  leg: "out" | "in";
  label: string;
  status: StatusKey;
  rsv: Reservation | undefined;
  t: (k: string, p?: Record<string, string | number>) => string;
  lang: Lang;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const cls =
    status === "live"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : status === "dry"
        ? "bg-slate-100 text-slate-600 border-slate-200"
        : "bg-slate-100 text-slate-400 border-slate-200";
  const statusText =
    status === "live"
      ? t("bk.status.live")
      : status === "dry"
        ? t("bk.status.dry")
        : t("bk.status.cancelled");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded px-2 py-0.5">
          {label}
        </span>
        <span
          className={`inline-flex items-center h-6 px-2 text-[11px] font-bold rounded-full border ${cls}`}
        >
          {statusText}
        </span>
      </div>
      {rsv && (
        <ul className="text-sm space-y-1">
          {rsv.rsvId && (
            <li className="flex items-center justify-between">
              <span className="text-slate-600">{t("bk.rsvId")}</span>
              <span
                className={`font-semibold tabular-nums ${
                  status === "cancelled" ? "text-slate-400" : "text-slate-900"
                }`}
              >
                {rsv.rsvId}
              </span>
            </li>
          )}
          {rsv.deadline && status !== "cancelled" && (
            <li className="flex items-center justify-between">
              <span className="text-slate-600">{t("bk.deadline")}</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {rsv.deadline}
              </span>
            </li>
          )}
          {rsv.reservedAt && (
            <li className="flex items-center justify-between">
              <span className="text-slate-600">{t("bk.bookedAt")}</span>
              <span
                className={`font-semibold tabular-nums ${
                  status === "cancelled" ? "text-slate-400" : "text-slate-900"
                }`}
              >
                {fmtDateTime(toPlandTime(rsv.reservedAt))}
              </span>
            </li>
          )}
        </ul>
      )}
      {status === "live" && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="h-9 px-4 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition"
        >
          {cancelling ? t("bk.cancelling") : t("bk.cancel")}
        </button>
      )}
      {/* explicit leg index keeps React happy when both legs render in roundtrip */}
      <input type="hidden" data-leg={leg} />
      {/* lang reserved for future locale-sensitive timestamps */}
      <input type="hidden" data-lang={lang} />
    </div>
  );
}

/** ISO timestamp → YYYYMMDDHHmm string so we can reuse fmtDateTime. */
function toPlandTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadOrders } from "../../lib/storage";
import { fmtTime } from "../../lib/format";
import { fmtDateDots, krwL } from "../../lib/format-i18n";
import { useI18n, stationLabel, type Lang } from "../../lib/i18n";
import { TrainLogo } from "../../components/TrainLogo";
import type { Order, Reservation, TrainSchedule } from "../../lib/types";

type StatusKey = "live" | "dry" | "cancelled";

function statusOf(o: Order): StatusKey {
  const live = o.reservation?.mode === "live" && !!o.reservation.rsvId;
  if (live) return "live";
  if (o.reservation?.mode === "dry") return "dry";
  return "cancelled";
}

export default function BookingsListPage() {
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    loadOrders()
      .then((rows) => {
        // Newest first.
        rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setOrders(rows);
      })
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="bg-slate-50 min-h-full">
      {/* Page header — back arrow + title */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="mx-4 sm:mx-6 lg:mx-[470px] flex items-center py-3">
          <Link
            href="/"
            className="h-10 w-10 grid place-items-center text-slate-800 -ml-1"
            aria-label={t("back")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="flex-1 text-center text-base font-bold text-slate-900">
            {t("bk.title")}
          </h1>
          <span className="w-10" />
        </div>
      </div>

      <div className="mx-4 sm:mx-6 lg:mx-[470px] py-4 pb-10 space-y-2">
        {orders == null ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {t("common.loading")}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          orders.map((o) => (
            <BookingCard key={o.id} order={o} lang={lang} t={t} />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: (k: string) => string }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <svg
        className="w-20 h-20 text-slate-300"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="10" y="14" width="44" height="38" rx="4" />
        <path d="M10 26h44" />
        <path d="M20 14V8M44 14V8" />
        <circle cx="22" cy="38" r="1.5" fill="currentColor" />
        <circle cx="32" cy="38" r="1.5" fill="currentColor" />
        <circle cx="42" cy="38" r="1.5" fill="currentColor" />
      </svg>
      <p className="mt-4 text-sm text-slate-500">{t("bk.empty")}</p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
      >
        {t("bk.empty.cta")}
      </Link>
    </div>
  );
}

function BookingCard({
  order,
  lang,
  t,
}: {
  order: Order;
  lang: Lang;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const status = statusOf(order);
  return (
    <Link
      href={`/bookings/${encodeURIComponent(order.id)}`}
      className="block bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-400 transition"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <StatusBadge status={status} t={t} />
        <span className="text-xs text-slate-400 tabular-nums">
          {fmtDateDots(order.outbound.depPlandTime)}
        </span>
      </div>

      <LegRow leg="out" train={order.outbound} lang={lang} t={t} />
      {order.tripType === "roundtrip" && order.inbound && (
        <div className="mt-1">
          <LegRow leg="in" train={order.inbound} lang={lang} t={t} />
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-end">
        <span className="text-xs text-slate-500 tabular-nums">
          {t("bk.totalShort", { m: krwL(order.totalPrice, lang) })}
        </span>
      </div>
    </Link>
  );
}

/** One-line train: [tag] logo no · dep_t arr_t · dep_st → arr_st */
function LegRow({
  leg,
  train,
  lang,
  t,
}: {
  leg: "out" | "in";
  train: TrainSchedule;
  lang: Lang;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-700">
      <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded px-1.5 py-0.5 leading-tight shrink-0">
        {leg === "out" ? t("ord.legOut") : t("ord.legIn")}
      </span>
      <TrainLogo name={train.trainGradeName} />
      <span className="text-xs font-semibold text-slate-500 shrink-0">
        {Number(train.trainNo) || train.trainNo}
      </span>
      <span className="ml-auto tabular-nums whitespace-nowrap text-slate-900">
        {fmtTime(train.depPlandTime)}
        <span className="mx-1 text-slate-300">→</span>
        {fmtTime(train.arrPlandTime)}
      </span>
      <span className="text-xs text-slate-500 whitespace-nowrap">
        · {stationLabel(train.depPlaceName, lang)} → {stationLabel(train.arrPlaceName, lang)}
      </span>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: StatusKey;
  t: (k: string) => string;
}) {
  const cls =
    status === "live"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : status === "dry"
        ? "bg-slate-100 text-slate-600 border-slate-200"
        : "bg-slate-100 text-slate-400 border-slate-200";
  return (
    <span
      className={`inline-flex items-center h-6 px-2 text-[11px] font-bold rounded-full border ${cls}`}
    >
      {status === "live"
        ? t("bk.status.live")
        : status === "dry"
          ? t("bk.status.dry")
          : t("bk.status.cancelled")}
    </span>
  );
}

// Re-export for the LegRow's discriminant — keep narrow types co-located.
export type { Reservation };

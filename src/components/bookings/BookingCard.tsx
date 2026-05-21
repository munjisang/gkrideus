"use client";

/**
 * Shared booking card used in both the user-facing /bookings list and
 * the admin "예매내역" tab. Visual layout is identical across the two;
 * the caller decides what happens on click:
 *
 *   • `onClick` omitted   → card is a `<Link>` to /bookings/[id]
 *                            (default user-facing behaviour).
 *   • `onClick` function  → card is a `<button>` invoking that handler
 *                            (used by admin to open a popup).
 *   • `onClick === null`  → card is a plain inert `<div>` (for embedding
 *                            inside a popup body without nested clicks).
 */
import Link from "next/link";
import { durationMinutes, fmtTime } from "../../lib/format";
import { durationL, fmtDateDots, krwL } from "../../lib/format-i18n";
import { stationLabel, type Lang } from "../../lib/i18n";
import { TrainLogo } from "../TrainLogo";
import type {
  Order,
  Reservation,
  TrainSchedule,
} from "../../lib/types";

export type StatusKey = "pending" | "confirmed" | "ticketed" | "cancelled";

export function rsvStatus(r: Reservation | undefined): StatusKey {
  if (!r) return "cancelled";
  if (r.cancelled) return "cancelled";
  if (r.ticketed) return "ticketed";
  if (r.confirmed) return "confirmed";
  return "pending";
}

type Props = {
  order: Order;
  lang: Lang;
  t: (k: string, p?: Record<string, string | number>) => string;
  /** See file header for the three modes. */
  onClick?: (() => void) | null;
};

export default function BookingCard({ order, lang, t, onClick }: Props) {
  const outStatus = rsvStatus(order.reservation);
  const inStatus =
    order.tripType === "roundtrip" ? rsvStatus(order.inboundReservation) : null;
  const wholeCancelled =
    outStatus === "cancelled" &&
    (inStatus === null || inStatus === "cancelled");

  const baseClass = `block w-full text-left rounded-xl border transition ${
    wholeCancelled
      ? "bg-slate-100 border-slate-200"
      : "bg-white border-slate-200 hover:border-slate-400"
  }`;
  const inertClass = `block w-full rounded-xl border ${
    wholeCancelled ? "bg-slate-100 border-slate-200" : "bg-white border-slate-200"
  }`;

  const Inner = (
    <>
      <LegBlock
        leg="out"
        label={t("ord.legOut")}
        status={outStatus}
        train={order.outbound}
        rsv={order.reservation}
        lang={lang}
        t={t}
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
          />
        </>
      )}

      <div className="border-t border-slate-200" />
      <div className="px-5 py-3 flex items-center justify-between">
        <span
          className={`text-xs ${
            wholeCancelled ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {t("bk.legPax", { n: order.passengerCount })}
        </span>
        <span
          className={`text-sm font-bold tabular-nums ${
            wholeCancelled ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {krwL(order.totalPrice, lang)}
        </span>
      </div>
    </>
  );

  if (onClick === null) {
    return <div className={inertClass}>{Inner}</div>;
  }
  if (typeof onClick === "function") {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {Inner}
      </button>
    );
  }
  return (
    <Link
      href={`/bookings/${encodeURIComponent(order.id)}`}
      className={baseClass}
    >
      {Inner}
    </Link>
  );
}

/* ──────────────────────────────────────────── Inner pieces */

function LegBlock({
  leg,
  label,
  status,
  train,
  rsv,
  lang,
  t,
}: {
  leg: "out" | "in";
  label: string;
  status: StatusKey;
  train: TrainSchedule;
  rsv: Reservation | undefined;
  lang: Lang;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const mins = durationMinutes(train.depPlandTime, train.arrPlandTime);
  const dim = status === "cancelled";
  const muted = (cls: string) => (dim ? "text-slate-400" : cls);
  return (
    <div
      className={`px-5 py-4 ${dim ? "bg-slate-100/60" : ""}`}
      data-leg={leg}
    >
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
            <span
              className={`text-xs font-semibold tabular-nums ${muted(
                "text-slate-600",
              )}`}
            >
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
        </div>
        <span
          className={`text-sm tabular-nums shrink-0 ${muted("text-slate-500")}`}
        >
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
        <span
          className={`text-xs whitespace-nowrap ${muted("text-slate-400")}`}
        >
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
        <span
          className={`text-sm whitespace-nowrap ${muted("text-slate-600")}`}
        >
          {stationLabel(train.depPlaceName, lang)}
        </span>
        <span
          className={`text-sm whitespace-nowrap ${muted("text-slate-600")}`}
        >
          {stationLabel(train.arrPlaceName, lang)}
        </span>
      </div>
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

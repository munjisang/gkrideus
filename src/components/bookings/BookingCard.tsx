"use client";

/**
 * Shared booking card used in both the user-facing /bookings list and
 * the admin "예매내역" tab. The visual layout is identical; admin gets
 * an optional row of actions (예매하기/확정/취소/삭제) plus failure
 * details rendered just under the standard footer.
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

/** Admin-only controls. When this prop is omitted, the card renders
 *  exactly the user-facing version. */
export type AdminActions = {
  busy?: boolean;
  hasLiveReservation: boolean;
  hasUnconfirmedLeg: boolean;
  isExpired: boolean;
  /** Top-of-action banner shown when the last live attempt failed. */
  failureMessage?: string;
  onBook: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

type Props = {
  order: Order;
  lang: Lang;
  t: (k: string, p?: Record<string, string | number>) => string;
  /** When omitted, card is fully user-facing. */
  adminActions?: AdminActions;
};

export default function BookingCard({ order, lang, t, adminActions }: Props) {
  const outStatus = rsvStatus(order.reservation);
  const inStatus =
    order.tripType === "roundtrip" ? rsvStatus(order.inboundReservation) : null;
  const wholeCancelled =
    outStatus === "cancelled" &&
    (inStatus === null || inStatus === "cancelled");

  // Admin variant: card becomes a div (so action buttons inside can click
  // without bubbling into a Link); the "view detail" affordance moves to
  // a small text link in the footer.
  const cardClass = `block rounded-xl border transition ${
    wholeCancelled
      ? "bg-slate-100 border-slate-200"
      : "bg-white border-slate-200 hover:border-slate-400"
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

  if (adminActions) {
    return (
      <div className={cardClass}>
        {Inner}
        <AdminActionsBar
          order={order}
          actions={adminActions}
        />
      </div>
    );
  }
  return (
    <Link
      href={`/bookings/${encodeURIComponent(order.id)}`}
      className={cardClass}
    >
      {Inner}
    </Link>
  );
}

/* ──────────────────────────────────────────── Admin actions */

function AdminActionsBar({
  order,
  actions,
}: {
  order: Order;
  actions: AdminActions;
}) {
  return (
    <div className="border-t border-slate-100">
      {actions.failureMessage && (
        <div className="px-4 py-2 text-[12px] text-red-700 bg-red-50 border-b border-red-100 break-words whitespace-pre-line">
          {actions.failureMessage}
        </div>
      )}
      {actions.hasUnconfirmedLeg && (
        <button
          type="button"
          onClick={actions.onConfirm}
          disabled={actions.busy}
          className="w-full h-10 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 transition"
        >
          확정
        </button>
      )}
      <div className="grid grid-cols-3 border-t border-slate-100">
        {actions.hasLiveReservation ? (
          <button
            type="button"
            onClick={actions.onCancel}
            disabled={actions.busy}
            className="h-11 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border-r border-slate-100 transition disabled:opacity-60"
          >
            {actions.busy ? "처리중…" : "예매취소"}
          </button>
        ) : actions.isExpired ? (
          <button
            disabled
            className="h-11 text-sm font-medium text-slate-400 bg-slate-50 border-r border-slate-100 cursor-not-allowed"
          >
            기한만료
          </button>
        ) : (
          <button
            type="button"
            onClick={actions.onBook}
            disabled={actions.busy}
            className="h-11 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border-r border-slate-100 transition disabled:opacity-60"
          >
            {actions.busy ? "예매중…" : "예매하기"}
          </button>
        )}
        <Link
          href={`/bookings/${encodeURIComponent(order.id)}`}
          className="h-11 grid place-items-center text-sm text-slate-600 border-r border-slate-100 hover:bg-slate-50"
        >
          상세
        </Link>
        <button
          type="button"
          onClick={actions.onDelete}
          disabled={actions.busy}
          className="h-11 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </div>
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

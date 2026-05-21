"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadOrders, updateOrder } from "../../lib/storage";
import { fmtTime, durationMinutes } from "../../lib/format";
import { fmtDateDots, durationL, krwL } from "../../lib/format-i18n";
import { useI18n, stationLabel, type Lang } from "../../lib/i18n";
import { TrainLogo } from "../../components/TrainLogo";
import type { Order, Reservation, TrainSchedule } from "../../lib/types";

type StatusKey = "live" | "dry" | "cancelled";

function rsvStatus(r: Reservation | undefined): StatusKey {
  if (!r) return "cancelled";
  if (r.cancelled) return "cancelled";
  if (r.mode === "live" && r.rsvId) return "live";
  if (r.mode === "dry") return "dry";
  return "cancelled";
}

export default function BookingsListPage() {
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const initialSyncRef = useRef(false);

  /** Pull orders from storage and re-sort newest-first. */
  async function refresh() {
    try {
      const rows = await loadOrders();
      rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setOrders(rows);
      return rows;
    } catch {
      setOrders([]);
      return [];
    }
  }

  /**
   * Ask the server which live reservations Korail still recognises; clear
   * any that have disappeared (expired / cancelled / paid-out). Mirrors
   * the admin sync logic but runs silently from the user view.
   */
  async function syncReservations(currentOrders: Order[]) {
    const live: { orderId: string; leg: "out" | "in"; rsvId: string }[] = [];
    for (const o of currentOrders) {
      const r1 = o.reservation;
      const r2 = o.inboundReservation;
      if (r1?.mode === "live" && r1.rsvId && !r1.cancelled)
        live.push({ orderId: o.id, leg: "out", rsvId: r1.rsvId });
      if (r2?.mode === "live" && r2.rsvId && !r2.cancelled)
        live.push({ orderId: o.id, leg: "in", rsvId: r2.rsvId });
    }
    if (live.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/booking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvIds: live.map((x) => x.rsvId) }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        cancelled?: string[];
      };
      if (!j.ok) return;
      const cancelled = new Set(j.cancelled ?? []);
      if (cancelled.size === 0) return;
      // Mark each disappeared leg as cancelled — keep rsvId/deadline for history.
      const nowIso = new Date().toISOString();
      const orderById = new Map(currentOrders.map((o) => [o.id, o] as const));
      const patches = new Map<string, Partial<Order>>();
      for (const e of live) {
        if (!cancelled.has(e.rsvId)) continue;
        const order = orderById.get(e.orderId);
        if (!order) continue;
        const src = e.leg === "out" ? order.reservation : order.inboundReservation;
        if (!src) continue;
        const flagged: Reservation = {
          ...src,
          cancelled: true,
          cancelledAt: src.cancelledAt ?? nowIso,
        };
        const cur = patches.get(e.orderId) ?? {};
        if (e.leg === "out") cur.reservation = flagged;
        else cur.inboundReservation = flagged;
        patches.set(e.orderId, cur);
      }
      for (const [id, p] of patches) await updateOrder(id, p);
      // Refresh local state so the new status renders.
      await refresh();
    } catch {
      /* silent — sync is best-effort UX */
    } finally {
      setSyncing(false);
    }
  }

  // Initial load + one-shot sync on first render.
  useEffect(() => {
    (async () => {
      const rows = await refresh();
      if (initialSyncRef.current) return;
      initialSyncRef.current = true;
      await syncReservations(rows);
    })();
    // Reload list when storage changes in another tab.
    function onStorage(e: StorageEvent) {
      if (e.key === "korail.orders") void refresh();
    }
    // Reload + re-sync when the user comes back to the tab.
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const rows = await refresh();
        await syncReservations(rows);
      })();
    }
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-slate-50 min-h-full">
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
            {syncing && (
              <span className="ml-2 text-[11px] font-normal text-slate-400">
                {t("common.loading")}
              </span>
            )}
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
          orders.map((o) => <BookingCard key={o.id} order={o} lang={lang} t={t} />)
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
  const outStatus = rsvStatus(order.reservation);
  const inStatus =
    order.tripType === "roundtrip"
      ? rsvStatus(order.inboundReservation)
      : null;
  const wholeCancelled =
    outStatus === "cancelled" &&
    (inStatus === null || inStatus === "cancelled");
  return (
    <Link
      href={`/bookings/${encodeURIComponent(order.id)}`}
      className={`block rounded-xl border transition ${
        wholeCancelled
          ? "bg-slate-100 border-slate-200 hover:border-slate-300"
          : "bg-white border-slate-200 hover:border-slate-400"
      }`}
    >
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

      {/* Card-level footer: 총인원 + 결제금액 (once per order). */}
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
    </Link>
  );
}

/** Single-leg block matching the spec layout (header / train / times /
 *  stations). The card-level footer renders 총인원 + 결제금액 once. */
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
      {/* Row 1: badge · status · rsvId (rsvId shown whenever we have one,
          even after cancellation, so users can reference past bookings) */}
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

      {/* Row 2: logo + train no ─── date */}
      <div className="flex items-baseline justify-between gap-2 pt-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <TrainLogo name={train.trainGradeName} dim={dim} />
          <span className={`text-sm font-semibold ${muted("text-slate-500")}`}>
            {Number(train.trainNo) || train.trainNo}
          </span>
        </div>
        <span className={`text-sm tabular-nums shrink-0 ${muted("text-slate-500")}`}>
          {fmtDateDots(train.depPlandTime)}
        </span>
      </div>

      {/* Row 3: dep_time ─── duration ─── arr_time */}
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

      {/* Row 4: dep_station ······· arr_station */}
      <div className="flex items-center justify-between pt-1">
        <span className={`text-sm whitespace-nowrap ${muted("text-slate-600")}`}>
          {stationLabel(train.depPlaceName, lang)}
        </span>
        <span className={`text-sm whitespace-nowrap ${muted("text-slate-600")}`}>
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
    status === "live"
      ? "text-sky-700"
      : status === "dry"
        ? "text-slate-600"
        : "text-slate-400";
  return (
    <span className={`text-xs font-semibold ${cls}`}>
      {status === "live"
        ? t("bk.status.live")
        : status === "dry"
          ? t("bk.status.dry")
          : t("bk.status.cancelled")}
    </span>
  );
}

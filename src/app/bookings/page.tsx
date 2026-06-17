"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadOrders, updateOrder } from "../../lib/storage";
import { useI18n } from "../../lib/i18n";
import BookingCard, { rsvStatus } from "../../components/bookings/BookingCard";
import type { Order, Reservation } from "../../lib/types";

type StatusGroup = "reserved" | "waiting" | "canceled";
type TransportKind = "ktx" | "srt" | "intercity" | "express" | "ferry";

/** Map an order's outbound train/bus grade to a transport-filter key. */
function transportOf(order: Order): TransportKind | null {
  const g = order.outbound.trainGradeName || "";
  if (g.startsWith("KTX")) return "ktx";
  if (g === "SRT") return "srt";
  if (g.includes("고속버스")) return "express";
  if (g.includes("시외버스")) return "intercity";
  if (g.includes("페리") || g.includes("Ferry")) return "ferry";
  return null;
}

/** Collapse the per-leg reservation status into one of three filter groups. */
function statusGroupOf(order: Order): StatusGroup {
  const out = rsvStatus(order.reservation);
  const inb =
    order.tripType === "roundtrip"
      ? rsvStatus(order.inboundReservation)
      : null;
  const cancelled =
    out === "cancelled" && (inb === null || inb === "cancelled");
  if (cancelled) return "canceled";
  if (out === "ticketed" || out === "confirmed") return "reserved";
  return "waiting";
}

const STATUS_OPTS: { key: StatusGroup; tkey: string }[] = [
  { key: "reserved", tkey: "bk.status.reserved" },
  { key: "waiting", tkey: "bk.status.waiting" },
  { key: "canceled", tkey: "bk.status.canceled" },
];
const TRANSPORT_OPTS: { key: TransportKind; tkey: string }[] = [
  { key: "ktx", tkey: "bk.transport.ktx" },
  { key: "srt", tkey: "bk.transport.srt" },
  { key: "intercity", tkey: "bk.transport.intercity" },
  { key: "express", tkey: "bk.transport.express" },
  { key: "ferry", tkey: "bk.transport.ferry" },
];

export default function BookingsListPage() {
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const initialSyncRef = useRef(false);
  const [statusSel, setStatusSel] = useState<Set<StatusGroup>>(new Set());
  const [transportSel, setTransportSel] = useState<Set<TransportKind>>(new Set());

  const filteredOrders = useMemo(() => {
    if (!orders) return null;
    return orders.filter((o) => {
      if (statusSel.size > 0 && !statusSel.has(statusGroupOf(o))) return false;
      if (transportSel.size > 0) {
        const tk = transportOf(o);
        if (!tk || !transportSel.has(tk)) return false;
      }
      return true;
    });
  }, [orders, statusSel, transportSel]);

  function toggle<T>(set: Set<T>, key: T): Set<T> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

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
   * Ask the server which live reservations Korail still recognises;
   * mark any that disappeared as cancelled (and any matched against a
   * fresh ticket as ticketed, with carNo/seatNo populated). Mirrors the
   * admin sync logic but runs silently from the user view.
   */
  async function syncReservations(currentOrders: Order[]) {
    const live: { orderId: string; leg: "out" | "in"; rsvId: string }[] = [];
    const matchers: {
      rsvId: string;
      trainNo: string;
      depDate: string;
      depTime: string;
      service: "korail" | "srt";
    }[] = [];
    const serviceOf = (gradeName: string): "korail" | "srt" =>
      gradeName.toUpperCase().startsWith("SRT") ? "srt" : "korail";
    for (const o of currentOrders) {
      const r1 = o.reservation;
      const r2 = o.inboundReservation;
      if (r1?.mode === "live" && r1.rsvId && !r1.cancelled) {
        live.push({ orderId: o.id, leg: "out", rsvId: r1.rsvId });
        matchers.push({
          rsvId: r1.rsvId,
          trainNo: o.outbound.trainNo,
          depDate: o.outbound.depPlandTime.slice(0, 8),
          depTime: o.outbound.depPlandTime.slice(8, 12),
          service: serviceOf(o.outbound.trainGradeName),
        });
      }
      if (r2?.mode === "live" && r2.rsvId && !r2.cancelled && o.inbound) {
        live.push({ orderId: o.id, leg: "in", rsvId: r2.rsvId });
        matchers.push({
          rsvId: r2.rsvId,
          trainNo: o.inbound.trainNo,
          depDate: o.inbound.depPlandTime.slice(0, 8),
          depTime: o.inbound.depPlandTime.slice(8, 12),
          service: serviceOf(o.inbound.trainGradeName),
        });
      }
    }
    if (live.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/booking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvIds: live.map((x) => x.rsvId), matchers }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        cancelled?: string[];
        ticketed?: {
          rsvId: string;
          carNo: string | null;
          seatNo: string | null;
          seatNoEnd: string | null;
          seats?: { carNo: string; seatNo: string }[];
        }[];
      };
      if (!j.ok) return;
      const cancelled = new Set(j.cancelled ?? []);
      const ticketedById = new Map(
        (j.ticketed ?? []).map((x) => [x.rsvId, x] as const),
      );
      if (cancelled.size === 0 && ticketedById.size === 0) return;
      const nowIso = new Date().toISOString();
      const orderById = new Map(currentOrders.map((o) => [o.id, o] as const));
      const patches = new Map<string, Partial<Order>>();
      for (const e of live) {
        const order = orderById.get(e.orderId);
        if (!order) continue;
        const src =
          e.leg === "out" ? order.reservation : order.inboundReservation;
        if (!src) continue;
        let flagged: Reservation | null = null;
        const tk = ticketedById.get(e.rsvId);
        if (tk) {
          flagged = {
            ...src,
            ticketed: true,
            ticketedAt: src.ticketedAt ?? nowIso,
            carNo: tk.carNo ?? undefined,
            seatNo: tk.seatNo ?? undefined,
            seatNoEnd: tk.seatNoEnd ?? undefined,
            seats: tk.seats && tk.seats.length > 0 ? tk.seats : undefined,
          };
        } else if (cancelled.has(e.rsvId)) {
          flagged = {
            ...src,
            cancelled: true,
            cancelledAt: src.cancelledAt ?? nowIso,
          };
        }
        if (!flagged) continue;
        const cur = patches.get(e.orderId) ?? {};
        if (e.leg === "out") cur.reservation = flagged;
        else cur.inboundReservation = flagged;
        patches.set(e.orderId, cur);
      }
      for (const [id, p] of patches) await updateOrder(id, p);
      // Fire-and-forget ticketed email per newly ticketed leg.
      // Endpoint is idempotent via Reservation.notifiedTicketedAt.
      for (const e of live) {
        const tk = ticketedById.get(e.rsvId);
        if (!tk) continue;
        void fetch("/api/notify/ticketed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: e.orderId, leg: e.leg }),
          keepalive: true,
        }).catch(() => {
          /* silent — notifications are best-effort */
        });
      }
      await refresh();
    } catch {
      /* silent — sync is best-effort UX */
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      const rows = await refresh();
      if (initialSyncRef.current) return;
      initialSyncRef.current = true;
      await syncReservations(rows);
    })();
    function onStorage(e: StorageEvent) {
      if (e.key === "korail.orders") void refresh();
    }
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
    <div className="bg-white min-h-full">
      {/* Sticky header — back + title (matches the search header) */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl backdrop-saturate-150 border-b border-hairline">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 flex items-center py-3">
          <Link
            href="/"
            className="h-10 w-10 grid place-items-center text-ink -ml-1 active:scale-95 transition"
            aria-label={t("back")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="flex-1 text-center text-base font-bold tracking-tight text-ink">
            {t("bk.title")}
          </h1>
          <span className="w-10" />
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 pt-8 pb-10 lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 lg:items-start">
        {/* Left filter panel */}
        <aside className="lg:sticky lg:top-[90px] space-y-4 mb-4 lg:mb-0">
          <div className="card-apple overflow-hidden">
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <div className="flex items-center gap-1.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-action" aria-hidden>
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                <h3 className="text-sm font-bold tracking-tight text-ink">
                  {t("sr.searchFilter")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusSel(new Set());
                  setTransportSel(new Set());
                }}
                className="text-xs font-semibold text-ink-faint transition-colors hover:text-action"
              >
                {t("sr.reset")}
              </button>
            </div>

            {/* Status */}
            <div className="border-b border-divider px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("bk.statusFilter")}
              </h4>
              <div className="space-y-1.5">
                {STATUS_OPTS.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer select-none items-center gap-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={statusSel.has(opt.key)}
                      onChange={() => setStatusSel((s) => toggle(s, opt.key))}
                      className="h-4 w-4 rounded accent-action"
                    />
                    <span className="text-sm font-medium text-ink">
                      {t(opt.tkey)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Transport */}
            <div className="px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("bk.transportFilter")}
              </h4>
              <div className="space-y-1.5">
                {TRANSPORT_OPTS.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer select-none items-center gap-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={transportSel.has(opt.key)}
                      onChange={() => setTransportSel((s) => toggle(s, opt.key))}
                      className="h-4 w-4 rounded accent-action"
                    />
                    <span className="text-sm font-medium text-ink">
                      {t(opt.tkey)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Right column: booking list */}
        <div className="min-w-0">
          {syncing && (
            <div className="mb-3 text-[12px] text-ink-faint">{t("common.loading")}</div>
          )}

          {orders == null ? (
            <div className="py-16 text-center text-sm text-ink-faint">
              {t("common.loading")}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState t={t} />
          ) : filteredOrders && filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-sm text-ink-soft">
              {t("sr.none")}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders?.map((o) => (
                <BookingCard key={o.id} order={o} lang={lang} t={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: (k: string) => string }) {
  return (
    <div className="py-24 flex flex-col items-center text-center">
      <svg
        className="w-20 h-20 text-ink-faint/50"
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
      <p className="mt-5 text-ink-faint">{t("bk.empty")}</p>
      <Link href="/" className="btn-action mt-6">
        {t("bk.empty.cta")}
      </Link>
    </div>
  );
}

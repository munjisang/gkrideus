"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  clearOrders,
  deleteOrder,
  loadOrders,
  updateOrder,
} from "../../lib/storage";
import { fmtDate, fmtDateTime, fmtKRW, fmtTime } from "../../lib/format";
import type { Order, Reservation, TrainSchedule } from "../../lib/types";

type BookingResult = {
  ok: boolean;
  stage?: string;
  error?: string;
  mode?: "live" | "dry";
  train?: Record<string, unknown>;
  reservation?: Record<string, unknown>;
  effectiveLive?: boolean;
  liveAllowed?: boolean;
  requestedLive?: boolean;
  candidates?: unknown[];
  serverReply?: unknown;
};

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultBy, setResultBy] = useState<Record<string, BookingResult>>({});
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const initialSyncRef = useRef(false);

  function refresh() {
    loadOrders()
      .then((rows) => setOrders(rows))
      .catch((e: Error) => {
        console.warn("loadOrders failed:", e.message);
        setOrders([]);
      });
  }

  /**
   * Reconcile our DB with Korail: for every live reservation we know about,
   * ask the server which IDs Korail still has. Any that have disappeared
   * (cancelled in app, expired, paid+confirmed-out, etc.) get cleared here.
   */
  async function syncReservations(opts: { silent?: boolean } = {}) {
    const all = await loadOrders();
    const ids: { orderId: string; leg: "out" | "in"; rsvId: string }[] = [];
    for (const o of all) {
      if (o.reservation?.mode === "live" && o.reservation.rsvId)
        ids.push({ orderId: o.id, leg: "out", rsvId: o.reservation.rsvId });
      if (o.inboundReservation?.mode === "live" && o.inboundReservation.rsvId)
        ids.push({ orderId: o.id, leg: "in", rsvId: o.inboundReservation.rsvId });
    }
    if (ids.length === 0) {
      setLastSyncAt(new Date().toISOString());
      setSyncError(null);
      return;
    }
    if (!opts.silent) setSyncing(true);
    try {
      const res = await fetch("/api/booking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvIds: ids.map((x) => x.rsvId) }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        cancelled?: string[];
        active?: string[];
        error?: string;
        stage?: string;
      };
      if (!j.ok) {
        setSyncError(`${j.stage ?? "오류"}: ${j.error ?? "동기화 실패"}`);
        return;
      }
      const cancelled = new Set(j.cancelled ?? []);
      if (cancelled.size === 0) {
        setSyncError(null);
        setLastSyncAt(new Date().toISOString());
        return;
      }
      // Group cleared legs by order.
      const patches = new Map<string, Partial<Order>>();
      for (const entry of ids) {
        if (!cancelled.has(entry.rsvId)) continue;
        const cur = patches.get(entry.orderId) ?? {};
        if (entry.leg === "out") cur.reservation = undefined;
        else cur.inboundReservation = undefined;
        patches.set(entry.orderId, cur);
      }
      for (const [id, p] of patches) {
        await updateOrder(id, p);
      }
      setSyncError(null);
      setLastSyncAt(new Date().toISOString());
      refresh();
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      if (!opts.silent) setSyncing(false);
    }
  }

  useEffect(() => {
    refresh();
    function onStorage(e: StorageEvent) {
      if (e.key === "korail.orders") refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-sync once after first load — quietly clears stale 'live' badges.
  useEffect(() => {
    if (initialSyncRef.current) return;
    if (!orders) return;
    initialSyncRef.current = true;
    void syncReservations({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  async function onDelete(id: string) {
    if (!confirm(`주문 ${id}을(를) 삭제할까요?`)) return;
    await deleteOrder(id);
    refresh();
  }

  async function onClear() {
    if (!confirm("모든 주문 내역을 삭제할까요? (되돌릴 수 없음)")) return;
    await clearOrders();
    refresh();
  }

  /** Build the POST body for one leg of an order. */
  function legPayload(order: Order, t: Order["outbound"], seat: Order["seatType"]) {
    return {
      depName: t.depPlaceName,
      arrName: t.arrPlaceName,
      date: t.depPlandTime.slice(0, 8),
      time: t.depPlandTime.slice(8, 12),
      trainNo: t.trainNo,
      passengers: order.passengerCount,
      paxBreakdown: order.paxBreakdown ?? null,
      seatType: seat,
      // Safe mode removed — always request a real reservation. The server
      // still gates the actual call behind KORAIL_RESERVE_LIVE.
      live: true,
    };
  }

  function buildReservation(j: BookingResult): Reservation | null {
    if (!j.ok) return null;
    if (j.mode === "live" && j.reservation) {
      const r = j.reservation as Record<string, unknown>;
      return {
        rsvId: String(r.rsv_id ?? r.rsv_no ?? ""),
        reservedAt: new Date().toISOString(),
        deadline:
          r.buy_limit_date && r.buy_limit_time
            ? `${r.buy_limit_date} ${r.buy_limit_time}`
            : undefined,
        totalPrice: typeof r.price === "number" ? r.price : undefined,
        mode: "live",
        raw: r,
      };
    }
    if (j.mode === "dry") {
      return {
        rsvId: "(dry-run)",
        reservedAt: new Date().toISOString(),
        mode: "dry",
        raw: j.train,
      };
    }
    return null;
  }

  async function callReserve(payload: object): Promise<BookingResult> {
    try {
      const res = await fetch("/api/booking/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return (await res.json()) as BookingResult;
    } catch (e) {
      return { ok: false, error: (e as Error).message, stage: "network" };
    }
  }

  async function callCancel(rsvId: string): Promise<BookingResult> {
    try {
      const res = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvId }),
      });
      return (await res.json()) as BookingResult;
    } catch (e) {
      return { ok: false, error: (e as Error).message, stage: "network" };
    }
  }

  function describeFailure(j: BookingResult, legLabel: string): string {
    const stage = j.stage ?? "오류";
    const msg = j.error ?? "알 수 없는 오류";
    return `[${legLabel}] ${stage} 단계 실패\n${msg}`;
  }

  async function onBook(order: Order) {
    if (busyId) return; // guard against double-click / concurrent bookings
    const summary =
      order.tripType === "roundtrip" && order.inbound
        ? `${order.outbound.depPlaceName} → ${order.outbound.arrPlaceName} (가는편)\n${order.inbound.depPlaceName} → ${order.inbound.arrPlaceName} (오는편)`
        : `${order.outbound.depPlaceName} → ${order.outbound.arrPlaceName}`;
    const ok = confirm(
      `[실 예약]\n\n${summary}\n${order.passengerCount}명\n\n마스터 코레일 계정으로 실제 좌석을 점유합니다. 결제 기한이 카운트다운 됩니다.\n진행할까요?`,
    );
    if (!ok) return;
    setBusyId(order.id);
    try {
      // ── Outbound leg
      const outRes = await callReserve(
        legPayload(order, order.outbound, order.seatType),
      );
      setResultBy((m) => ({ ...m, [order.id]: outRes }));

      if (!outRes.ok) {
        alert(describeFailure(outRes, "가는 편"));
        return;
      }
      const outRsv = buildReservation(outRes);
      if (!outRsv) {
        alert("가는 편 예약 응답을 해석할 수 없습니다.");
        return;
      }

      // For oneway → done.
      if (order.tripType !== "roundtrip" || !order.inbound) {
        await updateOrder(order.id, { reservation: outRsv });
        refresh();
        return;
      }

      // ── Inbound leg
      const inSeat = order.inboundSeatType ?? order.seatType;
      const inRes = await callReserve(legPayload(order, order.inbound, inSeat));

      if (!inRes.ok) {
        // 2nd leg failed — roll back the 1st leg if it was a live reservation.
        const rolledBackMsg =
          outRsv.mode === "live"
            ? `\n\n가는 편(${outRsv.rsvId}) 예약은 자동 취소를 시도합니다.`
            : "";
        setResultBy((m) => ({ ...m, [order.id]: inRes }));
        if (outRsv.mode === "live" && outRsv.rsvId) {
          const rb = await callCancel(outRsv.rsvId);
          if (!rb.ok) {
            alert(
              describeFailure(inRes, "오는 편") +
                rolledBackMsg +
                `\n\n⚠ 가는 편 자동 취소도 실패: ${rb.stage ?? ""} ${rb.error ?? ""}\n코레일 앱에서 직접 취소해주세요.`,
            );
            // Don't save anything; user must clean up manually.
            return;
          }
        }
        alert(describeFailure(inRes, "오는 편") + rolledBackMsg);
        return;
      }

      const inRsv = buildReservation(inRes);
      if (!inRsv) {
        alert("오는 편 예약 응답을 해석할 수 없습니다.");
        return;
      }

      // Both legs OK — persist both reservations.
      await updateOrder(order.id, {
        reservation: outRsv,
        inboundReservation: inRsv,
      });
      // Also keep the latest result for the badge — show outbound result.
      setResultBy((m) => ({ ...m, [order.id]: outRes }));
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(order: Order) {
    const outRsv = order.reservation;
    const inRsv = order.inboundReservation;
    const outLive = outRsv?.mode === "live" && !!outRsv.rsvId;
    const inLive = inRsv?.mode === "live" && !!inRsv.rsvId;

    if (!outLive && !inLive) return;

    const summary =
      inLive && outLive
        ? `가는 편 ${outRsv!.rsvId} + 오는 편 ${inRsv!.rsvId}`
        : outLive
          ? `가는 편 ${outRsv!.rsvId}`
          : `오는 편 ${inRsv!.rsvId}`;

    if (
      !confirm(
        `예약을 취소합니다.\n\n${order.outbound.depPlaceName} → ${order.outbound.arrPlaceName}\n${summary}\n\n취소된 좌석은 즉시 다른 사람이 잡을 수 있게 됩니다.\n진행할까요?`,
      )
    )
      return;

    setBusyId(order.id);
    try {
      const failures: string[] = [];

      if (outLive) {
        const j = await callCancel(outRsv!.rsvId);
        setResultBy((m) => ({ ...m, [order.id]: j }));
        if (j.ok) {
          await updateOrder(order.id, { reservation: undefined });
        } else {
          failures.push(describeFailure(j, "가는 편 취소"));
        }
      }

      if (inLive) {
        const j = await callCancel(inRsv!.rsvId);
        setResultBy((m) => ({ ...m, [order.id]: j }));
        if (j.ok) {
          await updateOrder(order.id, { inboundReservation: undefined });
        } else {
          failures.push(describeFailure(j, "오는 편 취소"));
        }
      }

      refresh();
      if (failures.length > 0) {
        alert(failures.join("\n\n"));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-10">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          주문 <span className="font-semibold text-slate-700">{orders?.length ?? 0}</span>건
          {lastSyncAt && (
            <span className="ml-2 text-xs text-slate-400">
              · 최근 동기화 {fmtTime(toPlandTime(lastSyncAt))}
            </span>
          )}
          {syncError && (
            <span className="ml-2 text-xs text-red-600">· 동기화 오류: {syncError}</span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => syncReservations()}
            disabled={syncing}
            className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
          >
            {syncing ? "동기화 중…" : "코레일 동기화"}
          </button>
          <button
            onClick={refresh}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
        <span className="text-base">🚨</span>
        <span className="font-medium">
          실 예약 모드 — [예매하기] 클릭 시 실제 좌석이 점유됩니다.
        </span>
      </div>

      {orders === null && (
        <div className="py-16 text-center text-slate-500 text-sm">불러오는 중…</div>
      )}

      {orders && orders.length === 0 && (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center">
          <p className="text-sm text-slate-500 mb-4">아직 주문 내역이 없습니다.</p>
          <Link
            href="/"
            className="inline-block h-10 px-4 rounded-lg bg-slate-900 text-white text-sm leading-10"
          >
            예매 페이지로 이동
          </Link>
        </div>
      )}

      <ul className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {orders?.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            busy={busyId === o.id}
            result={resultBy[o.id]}
            onToggle={() => setOpenId(o.id)}
            onBook={() => onBook(o)}
            onCancel={() => onCancel(o)}
            onDelete={() => onDelete(o.id)}
          />
        ))}
      </ul>

      {orders && orders.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={onClear}
            className="text-xs text-red-500 hover:text-red-700"
          >
            모든 주문 삭제
          </button>
        </div>
      )}

      <DetailModal
        order={openId ? (orders?.find((o) => o.id === openId) ?? null) : null}
        result={openId ? resultBy[openId] : undefined}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function DetailModal({
  order,
  result,
  onClose,
}: {
  order: Order | null;
  result?: BookingResult;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!order) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [order, onClose]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-t-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <div className="text-[11px] text-slate-400 font-mono">{order.id}</div>
            <h2 className="text-base font-bold text-slate-900">주문 상세</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 grid place-items-center text-slate-500 hover:text-slate-900 -mr-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <OrderDetail order={order} result={result} />
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  busy,
  result,
  onToggle,
  onBook,
  onCancel,
  onDelete,
}: {
  order: Order;
  busy: boolean;
  result?: BookingResult;
  onToggle: () => void;
  onBook: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const hasLiveReservation =
    (order.reservation?.mode === "live" && !!order.reservation.rsvId) ||
    (order.inboundReservation?.mode === "live" && !!order.inboundReservation.rsvId);
  const hasAnyReservation = !!order.reservation || !!order.inboundReservation;
  // Unreserved order whose departure date has already passed → expired.
  const todayYmd = (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  })();
  const isExpired =
    !hasAnyReservation && order.outbound.depPlandTime.slice(0, 8) < todayYmd;
  const showFailure = !!result && result.ok === false;
  return (
    <li className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Top row */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                order.tripType === "roundtrip"
                  ? "bg-violet-50 text-violet-700 border border-violet-100"
                  : "bg-sky-50 text-sky-700 border border-sky-100"
              }`}
            >
              {order.tripType === "roundtrip" ? "왕복" : "편도"}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{order.id}</span>
          </div>
          <ReservationBadge order={order} result={result} expired={isExpired} />
        </div>

        <div className="flex items-center gap-2 text-base font-bold text-slate-900">
          <span>{order.outbound.depPlaceName}</span>
          <span className="text-slate-300">→</span>
          <span>{order.outbound.arrPlaceName}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {fmtDate(order.outbound.depPlandTime.slice(0, 8))}{" "}
          {fmtTime(order.outbound.depPlandTime)} →{" "}
          {fmtTime(order.outbound.arrPlandTime)} · #{order.outbound.trainNo}
        </div>

        <div className="flex items-center justify-between mt-3 text-sm">
          <div className="text-slate-500">
            {order.passengers[0]?.name ?? "-"}
            {order.passengerCount > 1 && ` 외 ${order.passengerCount - 1}명`}
            <span className="mx-1.5 text-slate-300">·</span>
            {order.tripType === "roundtrip" && order.inboundSeatType
              ? `가 ${order.seatType === "first" ? "특실" : "일반실"} · 오 ${order.inboundSeatType === "first" ? "특실" : "일반실"}`
              : order.seatType === "first"
                ? "특실"
                : "일반실"}
          </div>
          <div className="font-bold text-slate-900 tabular-nums">
            {fmtKRW(order.totalPrice)}
          </div>
        </div>
      </div>

      {/* Failure banner — visible until the user takes another action */}
      {showFailure && (
        <div className="mx-4 mb-4 -mt-1 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">
              예매 실패 · {result?.stage ?? "오류"}
            </span>
            {result?.effectiveLive === false && result?.requestedLive ? (
              <span className="text-[10px] text-amber-700">
                서버 LIVE OFF — dry-run 처리됨
              </span>
            ) : null}
          </div>
          <div className="text-[12px] text-red-700 mt-1 break-words whitespace-pre-line">
            {result?.error ?? "알 수 없는 오류"}
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="grid grid-cols-3 border-t border-slate-100">
        {hasLiveReservation ? (
          <button
            disabled={busy}
            onClick={onCancel}
            className="h-11 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border-r border-slate-100 transition disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {busy && <Spinner />}
            {busy ? "처리중…" : "예매취소"}
          </button>
        ) : isExpired ? (
          <button
            disabled
            className="h-11 text-sm font-medium text-slate-400 bg-slate-50 border-r border-slate-100 cursor-not-allowed"
          >
            기한만료
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={onBook}
            className="h-11 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border-r border-slate-100 transition disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {busy && <Spinner />}
            {busy ? "예매중…" : "예매하기"}
          </button>
        )}
        <button
          onClick={onToggle}
          className="h-11 text-sm text-slate-600 border-r border-slate-100 hover:bg-slate-50"
        >
          상세
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="h-11 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReservationBadge({
  order,
  result,
  expired,
}: {
  order: Order;
  result?: BookingResult;
  expired?: boolean;
}) {
  const out = order.reservation;
  const inb = order.inboundReservation;
  const outLive = out?.mode === "live";
  const inLive = inb?.mode === "live";
  const isRT = order.tripType === "roundtrip";

  if (expired && !out && !inb) {
    return (
      <span className="inline-flex text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
        기한만료
      </span>
    );
  }

  if (outLive || inLive) {
    const bothLive = isRT && outLive && inLive;
    const partial = isRT && (outLive !== inLive);
    return (
      <div className="text-right space-y-0.5">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${
            bothLive || (!isRT && outLive)
              ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
              : "text-amber-700 bg-amber-50 border border-amber-200"
          }`}
        >
          {bothLive
            ? "● 왕복 예약 완료"
            : !isRT && outLive
              ? "● 예약 완료"
              : partial
                ? outLive
                  ? "● 가는편만 예약됨"
                  : "● 오는편만 예약됨"
                : "● 예약 완료"}
        </span>
        {outLive && out?.deadline && (
          <div className="text-[10px] text-amber-700">
            {isRT ? "가는편 기한: " : "기한: "}
            {out.deadline}
          </div>
        )}
        {inLive && inb?.deadline && (
          <div className="text-[10px] text-amber-700">오는편 기한: {inb.deadline}</div>
        )}
      </div>
    );
  }

  if (out?.mode === "dry" || inb?.mode === "dry") {
    return (
      <span className="inline-flex text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
        ◌ dry-run
      </span>
    );
  }

  if (result && !result.ok) {
    return (
      <span
        title={result.error}
        className="inline-flex text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"
      >
        ✗ {result.stage ?? "오류"}
      </span>
    );
  }
  return null;
}

function OrderDetail({
  order,
  result,
}: {
  order: Order;
  result?: BookingResult;
}) {
  return (
    <div className="bg-slate-50/70 border-t border-slate-100 p-4 space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold text-slate-500">여정 상세</div>
          <div className="text-[11px] font-semibold text-slate-700">
            예약 인원 {order.passengerCount}명
            {order.paxBreakdown && (
              <span className="ml-1 font-normal text-slate-400">
                (
                {[
                  order.paxBreakdown.adults ? `어른 ${order.paxBreakdown.adults}` : "",
                  order.paxBreakdown.children
                    ? `어린이 ${order.paxBreakdown.children}`
                    : "",
                  order.paxBreakdown.toddlers
                    ? `유아 ${order.paxBreakdown.toddlers}`
                    : "",
                  order.paxBreakdown.seniors
                    ? `경로 ${order.paxBreakdown.seniors}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                )
              </span>
            )}
          </div>
        </div>
        <Leg label="가는 편" t={order.outbound} />
        {order.inbound && (
          <>
            <div className="my-2 border-t border-dashed border-slate-200" />
            <Leg label="오는 편" t={order.inbound} />
          </>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-semibold text-slate-500 mb-2">탑승객</div>
        <ul className="divide-y divide-slate-100">
          {order.passengers.map((p, i) => (
            <li key={i} className="py-2 text-sm">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 break-all">
                {p.email}
                {(p.countryCode || p.phone) && (
                  <>
                    <br />
                    {p.countryCode} {p.phone}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="text-[10px] text-slate-400">
        주문 시각: {fmtDateTime(toPlandTime(order.createdAt))}
      </div>

      {(order.reservation || order.inboundReservation) && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-500 mb-1">예약 현황</div>
          {order.reservation && (
            <ResRow label="가는 편" r={order.reservation} />
          )}
          {order.inboundReservation && (
            <ResRow label="오는 편" r={order.inboundReservation} />
          )}
        </div>
      )}

      {result && !result.ok && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="text-[11px] font-semibold text-red-700 mb-1">
            마지막 실행 실패 · {result.stage ?? "오류"}
          </div>
          <div className="text-xs text-red-700 whitespace-pre-line break-words">
            {result.error}
          </div>
        </div>
      )}

      {(order.reservation || order.inboundReservation || result) && (
        <details className="bg-white border border-slate-200 rounded-xl p-3">
          <summary className="text-[11px] font-semibold text-slate-500 cursor-pointer">
            raw JSON
          </summary>
          <pre className="text-[10px] font-mono bg-slate-50 border border-slate-100 rounded p-2 overflow-auto max-h-48 mt-2">
{JSON.stringify(
  {
    reservation: order.reservation,
    inboundReservation: order.inboundReservation,
    lastResult: result,
  },
  null,
  2,
)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ResRow({ label, r }: { label: string; r: Reservation }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div>
        <div className="text-slate-500">{label}</div>
        <div className="font-mono text-slate-800 mt-0.5">{r.rsvId || "(없음)"}</div>
      </div>
      <div className="text-right">
        <div
          className={`inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 ${
            r.mode === "live"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          {r.mode === "live" ? "● 예약 완료" : "◌ dry-run"}
        </div>
        {r.deadline && (
          <div className="text-[10px] text-amber-700 mt-1">기한: {r.deadline}</div>
        )}
      </div>
    </div>
  );
}

function Leg({ label, t }: { label: string; t: TrainSchedule }) {
  return (
    <div className="text-sm">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold tabular-nums">{fmtTime(t.depPlandTime)}</div>
          <div className="text-[11px] text-slate-500">{t.depPlaceName}</div>
        </div>
        <div className="text-[11px] text-slate-400 text-center">
          {t.trainGradeName}
          <br />
          #{t.trainNo}
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{fmtTime(t.arrPlandTime)}</div>
          <div className="text-[11px] text-slate-500">{t.arrPlaceName}</div>
        </div>
      </div>
      <div className="text-[11px] text-slate-400 mt-1">{fmtDate(t.depPlandTime.slice(0, 8))}</div>
    </div>
  );
}

function toPlandTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

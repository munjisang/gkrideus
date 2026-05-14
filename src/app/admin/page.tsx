"use client";

import { useEffect, useState } from "react";
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
  const [live, setLive] = useState(false);

  function refresh() {
    loadOrders()
      .then((rows) => setOrders(rows))
      .catch((e: Error) => {
        console.warn("loadOrders failed:", e.message);
        setOrders([]);
      });
  }

  useEffect(() => {
    refresh();
    function onStorage(e: StorageEvent) {
      if (e.key === "korail.orders") refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  async function onBook(order: Order) {
    if (live) {
      const ok = confirm(
        `[실 예약 LIVE]\n\n${order.outbound.depPlaceName} → ${order.outbound.arrPlaceName}\n${fmtTime(order.outbound.depPlandTime)} 출발, ${order.passengerCount}명, ${order.seatType === "first" ? "특실" : "일반실"}\n\n마스터 코레일 계정으로 실제 좌석을 점유합니다. 결제 기한이 카운트다운 됩니다.\n진행할까요?`,
      );
      if (!ok) return;
    }
    setBusyId(order.id);
    try {
      const t = order.outbound;
      const res = await fetch("/api/booking/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depName: t.depPlaceName,
          arrName: t.arrPlaceName,
          date: t.depPlandTime.slice(0, 8),
          time: t.depPlandTime.slice(8, 12),
          trainNo: t.trainNo,
          passengers: order.passengerCount,
          seatType: order.seatType,
          live,
        }),
      });
      const j: BookingResult = await res.json();
      setResultBy((m) => ({ ...m, [order.id]: j }));

      if (j.ok && j.mode === "live" && j.reservation) {
        const r = j.reservation as Record<string, unknown>;
        const rsv: Reservation = {
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
        await updateOrder(order.id, { reservation: rsv });
        refresh();
      } else if (j.ok && j.mode === "dry") {
        const rsv: Reservation = {
          rsvId: "(dry-run)",
          reservedAt: new Date().toISOString(),
          mode: "dry",
          raw: j.train,
        };
        await updateOrder(order.id, { reservation: rsv });
        refresh();
      }
    } catch (e) {
      setResultBy((m) => ({
        ...m,
        [order.id]: { ok: false, error: (e as Error).message },
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(order: Order) {
    if (!order.reservation || order.reservation.mode !== "live") return;
    const rsvId = order.reservation.rsvId;
    if (!rsvId) {
      alert("예약번호를 찾을 수 없습니다.");
      return;
    }
    if (
      !confirm(
        `예약을 취소합니다.\n\n${order.outbound.depPlaceName} → ${order.outbound.arrPlaceName}\n예약번호: ${rsvId}\n\n취소된 좌석은 즉시 다른 사람이 잡을 수 있게 됩니다.\n진행할까요?`,
      )
    )
      return;

    setBusyId(order.id);
    try {
      const res = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvId }),
      });
      const j: BookingResult = await res.json();
      setResultBy((m) => ({ ...m, [order.id]: j }));
      if (j.ok) {
        await updateOrder(order.id, { reservation: undefined });
        refresh();
      }
    } catch (e) {
      setResultBy((m) => ({
        ...m,
        [order.id]: { ok: false, error: (e as Error).message },
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-10">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          이 브라우저에 저장된 주문 <span className="font-semibold text-slate-700">{orders?.length ?? 0}</span>건
        </p>
        <button
          onClick={refresh}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          새로고침
        </button>
      </div>

      <label
        className={`flex items-center justify-between mb-5 px-4 py-3 rounded-xl border text-sm cursor-pointer select-none transition ${
          live
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="text-base">{live ? "🚨" : "🛡"}</span>
          <span className="font-medium">
            {live ? "실 예약 모드 (LIVE)" : "안전 모드 (dry-run)"}
          </span>
        </span>
        <input
          type="checkbox"
          checked={live}
          onChange={(e) => setLive(e.target.checked)}
          className="accent-red-600 scale-110"
        />
      </label>

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
            live={live}
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
  live,
  result,
  onToggle,
  onBook,
  onCancel,
  onDelete,
}: {
  order: Order;
  busy: boolean;
  live: boolean;
  result?: BookingResult;
  onToggle: () => void;
  onBook: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const hasLiveReservation =
    order.reservation?.mode === "live" && !!order.reservation.rsvId;
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
          <ReservationBadge order={order} result={result} />
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

      {/* Action row */}
      <div className="grid grid-cols-3 border-t border-slate-100">
        {hasLiveReservation ? (
          <button
            disabled={busy}
            onClick={onCancel}
            className="h-11 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border-r border-slate-100 transition disabled:opacity-50"
          >
            {busy ? "처리중…" : "예매취소"}
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={onBook}
            className={`h-11 text-sm font-medium border-r border-slate-100 transition disabled:opacity-50 ${
              live
                ? "text-red-700 bg-red-50 hover:bg-red-100"
                : "text-sky-700 hover:bg-sky-50"
            }`}
          >
            {busy ? "처리중…" : live ? "🚨 예매" : "예매하기"}
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
          className="h-11 text-sm text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function ReservationBadge({
  order,
  result,
}: {
  order: Order;
  result?: BookingResult;
}) {
  if (order.reservation) {
    const r = order.reservation;
    if (r.mode === "live") {
      return (
        <div className="text-right">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            ● 예약 완료
          </span>
          {r.deadline && (
            <div className="text-[10px] text-amber-700 mt-0.5">기한: {r.deadline}</div>
          )}
        </div>
      );
    }
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
        <div className="text-[11px] font-semibold text-slate-500 mb-2">여정 상세</div>
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
                <br />
                {p.countryCode} {p.phone}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="text-[10px] text-slate-400">
        주문 시각: {fmtDateTime(toPlandTime(order.createdAt))}
      </div>

      {(order.reservation || result) && (
        <details className="bg-white border border-slate-200 rounded-xl p-3">
          <summary className="text-[11px] font-semibold text-slate-500 cursor-pointer">
            예약 raw JSON
          </summary>
          <pre className="text-[10px] font-mono bg-slate-50 border border-slate-100 rounded p-2 overflow-auto max-h-48 mt-2">
{JSON.stringify(result ?? order.reservation, null, 2)}
          </pre>
        </details>
      )}
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

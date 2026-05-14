"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadOrders } from "../../../lib/storage";
import { fmtDateTime, fmtKRW, fmtTime, fmtDate } from "../../../lib/format";
import type { Order } from "../../../lib/types";

export default function CompleteView() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    loadOrders()
      .then((all) => setOrder(all.find((o) => o.id === id) ?? null))
      .catch(() => setOrder(null));
  }, [id]);

  if (order === undefined) {
    return <div className="mx-auto max-w-md px-4 py-8 text-slate-500">불러오는 중…</div>;
  }
  if (order === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          주문을 찾을 수 없습니다. (ID: {id || "(없음)"})
        </div>
        <Link href="/" className="inline-block mt-4 text-sky-700 text-sm">
          ← 처음으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white grid place-items-center mx-auto text-xl">
          ✓
        </div>
        <h1 className="text-lg font-bold mt-3">예매가 완료되었습니다</h1>
        <p className="text-slate-500 text-xs mt-1">예매 번호 · {order.id}</p>
      </div>

      <div className="bg-white border border-slate-200 p-5 space-y-3">
        <Row k="결제 금액" v={<span className="text-sky-700 font-bold">{fmtKRW(order.totalPrice)}</span>} />
        <Row
          k="좌석 등급"
          v={
            order.tripType === "roundtrip" && order.inboundSeatType
              ? `가는 편 ${order.seatType === "first" ? "특실" : "일반실"} · 오는 편 ${
                  order.inboundSeatType === "first" ? "특실" : "일반실"
                }`
              : order.seatType === "first"
                ? "특실"
                : "일반실"
          }
        />
        <Row k="여정" v={order.tripType === "roundtrip" ? "왕복" : "편도"} />
        <Row k="예매 시각" v={fmtDateTime(toPlandTime(order.createdAt))} />
        <Row k="가는 편"
          v={
            <span>
              {fmtDate(order.outbound.depPlandTime.slice(0, 8))}{" "}
              {fmtTime(order.outbound.depPlandTime)} {order.outbound.depPlaceName} →{" "}
              {fmtTime(order.outbound.arrPlandTime)} {order.outbound.arrPlaceName} (#{order.outbound.trainNo})
            </span>
          }
        />
        {order.inbound && (
          <Row k="오는 편"
            v={
              <span>
                {fmtDate(order.inbound.depPlandTime.slice(0, 8))}{" "}
                {fmtTime(order.inbound.depPlandTime)} {order.inbound.depPlaceName} →{" "}
                {fmtTime(order.inbound.arrPlandTime)} {order.inbound.arrPlaceName} (#{order.inbound.trainNo})
              </span>
            }
          />
        )}
        <Row k="탑승객"
          v={
            <ul className="space-y-1">
              {order.passengers.map((p, i) => (
                <li key={i} className="text-sm">
                  {p.name} · {p.email} · {p.countryCode} {p.phone}
                </li>
              ))}
            </ul>
          }
        />
      </div>

      <div className="mt-6">
        <Link
          href="/"
          className="block h-12 border border-slate-200 bg-white grid place-items-center text-slate-700 hover:border-sky-300"
        >
          처음으로
        </Link>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-24 text-sm text-slate-500 shrink-0">{k}</div>
      <div className="flex-1 text-sm text-slate-800">{v}</div>
    </div>
  );
}

function toPlandTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

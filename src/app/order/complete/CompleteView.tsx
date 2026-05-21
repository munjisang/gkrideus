"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadOrders } from "../../../lib/storage";
import { fmtDateTime, fmtTime, fmtDate } from "../../../lib/format";
import { useI18n, stationLabel, type Lang } from "../../../lib/i18n";
import type { Order } from "../../../lib/types";

function krwL(n: number, lang: Lang): string {
  return lang === "ko"
    ? `${n.toLocaleString("ko-KR")}원`
    : `₩${n.toLocaleString("en-US")}`;
}

export default function CompleteView() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const { t, lang } = useI18n();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    loadOrders()
      .then((all) => setOrder(all.find((o) => o.id === id) ?? null))
      .catch(() => setOrder(null));
  }, [id]);

  if (order === undefined) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-slate-500">
        {t("common.loading")}
      </div>
    );
  }
  if (order === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {t("cp.notFound", { id: id || "-" })}
        </div>
        <Link href="/" className="inline-block mt-4 text-sky-700 text-sm">
          ← {t("ord.toHome")}
        </Link>
      </div>
    );
  }

  const seatName = (s: "standard" | "first") =>
    s === "first" ? t("sr.first") : t("sr.standard");

  const seatValue =
    order.tripType === "roundtrip" && order.inboundSeatType
      ? `${t("ord.legOut")} ${seatName(order.seatType)} · ${t("ord.legIn")} ${seatName(
          order.inboundSeatType,
        )}`
      : seatName(order.seatType);

  const legText = (leg: NonNullable<Order["inbound"]>) =>
    `${fmtDate(leg.depPlandTime.slice(0, 8))} ${fmtTime(leg.depPlandTime)} ${stationLabel(
      leg.depPlaceName,
      lang,
    )} → ${fmtTime(leg.arrPlandTime)} ${stationLabel(leg.arrPlaceName, lang)} (#${leg.trainNo})`;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white grid place-items-center mx-auto text-xl">
          ✓
        </div>
        <h1 className="text-lg font-bold mt-3">{t("cp.done")}</h1>
        <p className="text-slate-500 text-xs mt-1">
          {t("cp.bookingNo")} · {order.id}
        </p>
      </div>

      <div className="bg-white border border-slate-200 p-5 space-y-3">
        <Row
          k={t("cp.amount")}
          v={
            <span className="text-sky-700 font-bold">
              {krwL(order.totalPrice, lang)}
            </span>
          }
        />
        <Row k={t("cp.seat")} v={seatValue} />
        <Row
          k={t("cp.trip")}
          v={order.tripType === "roundtrip" ? t("home.roundtrip") : t("home.oneway")}
        />
        <Row k={t("cp.bookedAt")} v={fmtDateTime(toPlandTime(order.createdAt))} />
        <Row k={t("ord.legOut")} v={<span>{legText(order.outbound)}</span>} />
        {order.inbound && (
          <Row k={t("ord.legIn")} v={<span>{legText(order.inbound)}</span>} />
        )}
        <Row
          k={t("cp.pax")}
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

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link
          href="/"
          className="h-12 border border-slate-200 bg-white grid place-items-center text-slate-700 hover:border-sky-300"
        >
          {t("ord.toHome")}
        </Link>
        <Link
          href="/bookings"
          className="h-12 bg-slate-900 hover:bg-slate-800 grid place-items-center text-white font-semibold transition"
        >
          {t("ord.toBookings")}
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

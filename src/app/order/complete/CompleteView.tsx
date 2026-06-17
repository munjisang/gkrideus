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
      <div className="min-h-screen bg-parchment">
        <CompleteHeader title={t("cp.done")} />
        <div className="mx-auto max-w-2xl px-4 sm:px-8 lg:px-12 py-8 text-ink-faint">
          {t("common.loading")}
        </div>
      </div>
    );
  }
  if (order === null) {
    return (
      <div className="min-h-screen bg-parchment">
        <CompleteHeader title={t("cp.done")} />
        <div className="mx-auto max-w-2xl px-4 sm:px-8 lg:px-12 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {t("cp.notFound", { id: id || "-" })}
          </div>
          <Link href="/" className="link-action inline-block mt-4 text-sm">
            ← {t("ord.toHome")}
          </Link>
        </div>
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
    <div className="min-h-screen bg-parchment">
      <CompleteHeader title={t("cp.done")} />
      <div className="mx-auto max-w-2xl px-4 sm:px-8 lg:px-12 py-8">
      <div className="text-center mb-7">
        <div className="w-14 h-14 rounded-full bg-emerald-500 text-white grid place-items-center mx-auto text-2xl">
          ✓
        </div>
        <h1 className="text-xl font-bold tracking-tight text-ink mt-4">{t("cp.done")}</h1>
        <p className="text-ink-soft text-sm mt-2">{t("cp.bookingNo")}</p>
        <p className="text-2xl font-bold tracking-tight text-ink tabular-nums mt-1">
          {order.id}
        </p>
      </div>

      <div className="card-apple p-5 space-y-3">
        <Row
          k={t("cp.amount")}
          v={
            <span className="text-ink font-semibold">
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
                  {p.name} · {p.email}
                  {p.countryCode ? ` · ${p.countryCode}` : ""}
                </li>
              ))}
            </ul>
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link
          href="/"
          className="btn-ghost h-12 grid place-items-center"
        >
          {t("ord.toHome")}
        </Link>
        <Link
          href="/bookings"
          className="btn-action h-12 grid place-items-center"
        >
          {t("ord.toBookings")}
        </Link>
      </div>
      </div>
    </div>
  );
}

/** Frosted top header matching the rest of the app: title + home link. */
function CompleteHeader({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="frosted sticky top-0 z-10 border-b border-hairline">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 flex items-center py-3">
        <span className="h-10 w-10 -ml-1" aria-hidden />
        <h1 className="flex-1 text-center text-base font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <Link
          href="/"
          aria-label={t("home")}
          className="h-10 w-10 grid place-items-center text-ink -mr-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-8 9 8" />
            <path d="M5 9v12h14V9" />
            <path d="M10 21v-7h4v7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-24 text-sm text-ink-soft shrink-0">{k}</div>
      <div className="flex-1 text-sm text-ink">{v}</div>
    </div>
  );
}

function toPlandTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

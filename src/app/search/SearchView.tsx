"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtTime, fmtDuration, fmtKRW, durationMinutes } from "../../lib/format";
import SearchLoading from "../../components/SearchLoading";
import type { TrainSchedule, TripType } from "../../lib/types";

type ApiResponse =
  | {
      ok: true;
      source: "tago" | "mock";
      reason?: string;
      from: { id: string; name: string };
      to: { id: string; name: string };
      date: string;
      trains: TrainSchedule[];
    }
  | { ok: false; error: string };

type FilterKey = "all" | "KTX" | "SRT" | "새마을" | "무궁화" | "ITX-청춘";
const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "KTX", label: "KTX" },
  { key: "SRT", label: "SRT" },
  { key: "새마을", label: "새마을" },
  { key: "무궁화", label: "무궁화" },
  { key: "ITX-청춘", label: "ITX-청춘" },
];

const FIRST_CLASS_MULT = 1.4;

function encodeTrain(t: TrainSchedule): string {
  return encodeURIComponent(JSON.stringify(t));
}

function matchesFilter(t: TrainSchedule, f: FilterKey): boolean {
  if (f === "all") return true;
  const name = t.trainGradeName || "";
  if (f === "KTX") return name.startsWith("KTX"); // KTX, KTX-산천, KTX-이음, KTX-청룡 …
  if (f === "SRT") return name === "SRT";
  if (f === "새마을") return name.includes("새마을");
  if (f === "무궁화") return name.includes("무궁화");
  if (f === "ITX-청춘") return name === "ITX-청춘";
  return false;
}

export default function SearchView() {
  const router = useRouter();
  const sp = useSearchParams();

  const tripType = (sp.get("tripType") ?? "oneway") as TripType;
  const passengers = Number(sp.get("passengers") ?? "1");
  const leg = (sp.get("leg") ?? "outbound") as "outbound" | "inbound";
  const outboundParam = sp.get("outbound");

  // Outbound leg uses ?from/?to; inbound flips them.
  const fromId = leg === "outbound" ? (sp.get("from") ?? "") : (sp.get("to") ?? "");
  const toId = leg === "outbound" ? (sp.get("to") ?? "") : (sp.get("from") ?? "");
  const date = leg === "outbound" ? (sp.get("date") ?? "") : (sp.get("returnDate") ?? "");
  const hourParam = leg === "outbound" ? sp.get("hour") : sp.get("returnHour");
  const startHour = Number.isFinite(Number(hourParam)) ? Number(hourParam) : 0;
  // Names from query so we can show loading screen text instantly.
  const fromNameParam = leg === "outbound" ? (sp.get("fromName") ?? "") : (sp.get("toName") ?? "");
  const toNameParam = leg === "outbound" ? (sp.get("toName") ?? "") : (sp.get("fromName") ?? "");

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const tabsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active filter tab to the left of its track.
  useEffect(() => {
    const wrap = tabsRef.current;
    if (!wrap) return;
    const active = wrap.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (!active) return;
    const target = active.offsetLeft - 16; // tiny breathing room from left edge
    wrap.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [filter]);

  useEffect(() => {
    if (!fromId || !toId || !date) {
      setLoading(false);
      setData({ ok: false, error: "검색 조건이 부족합니다." });
      return;
    }
    setLoading(true);
    fetch(`/api/trains?from=${fromId}&to=${toId}&date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: ApiResponse) => setData(j))
      .catch((e: Error) => setData({ ok: false, error: e.message }))
      .finally(() => setLoading(false));
  }, [fromId, toId, date]);

  const fromName = data?.ok ? data.from.name : fromNameParam || fromId;
  const toName = data?.ok ? data.to.name : toNameParam || toId;

  const filtered = useMemo(() => {
    if (!data?.ok) return [];
    return data.trains.filter((t) => {
      if (!matchesFilter(t, filter)) return false;
      // depPlandTime is YYYYMMDDHHmm — slice 8-10 is the hour.
      const depHour = Number(t.depPlandTime.slice(8, 10));
      return depHour >= startHour;
    });
  }, [data, filter, startHour]);

  function onPick(t: TrainSchedule) {
    if (tripType === "roundtrip" && leg === "outbound") {
      const next = new URLSearchParams(sp.toString());
      next.set("leg", "inbound");
      next.set("outbound", encodeTrain(t));
      router.push(`/search?${next.toString()}`);
      return;
    }
    const params = new URLSearchParams({
      tripType,
      passengers: String(passengers),
      // Seat type defaults to standard; users adjust on the order page.
      seatType: sp.get("seatType") ?? "standard",
    });
    // Carry passenger breakdown forward so the order page can render
    // accurate 인원정보 (성인 / 어린이 / 유아 / 경로).
    for (const key of ["adults", "children", "toddlers", "seniors"] as const) {
      const v = sp.get(key);
      if (v) params.set(key, v);
    }
    if (tripType === "roundtrip") {
      params.set("outbound", outboundParam ?? "");
      params.set("inbound", encodeTrain(t));
    } else {
      params.set("outbound", encodeTrain(t));
    }
    router.push(`/order?${params.toString()}`);
  }

  if (loading) {
    return <SearchLoading from={fromName || "출발"} to={toName || "도착"} />;
  }

  return (
    <div className="bg-slate-50 min-h-full">
      {/* Sticky top header (within main, below the global header) */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="mx-4 sm:mx-6 lg:mx-[470px] flex items-center py-3">
          <Link
            href="/"
            className="h-10 w-10 grid place-items-center text-slate-800 -ml-1"
            aria-label="뒤로"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="flex-1 text-center text-base font-bold text-slate-900">
            {fromName}역 <span className="mx-0.5 text-slate-400">→</span> {toName}역
          </h1>
          <span className="w-10" />
        </div>
        {/* Filter tabs */}
        <div
          ref={tabsRef}
          className="mx-4 sm:mx-6 lg:mx-[470px] flex gap-2 overflow-x-auto no-scrollbar pb-3 scroll-smooth"
        >
          {FILTER_TABS.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                data-active={active}
                onClick={() => setFilter(t.key)}
                className={`shrink-0 text-[15px] px-4 pb-2 -mb-2 transition ${
                  active
                    ? "text-slate-900 font-bold border-b-2 border-slate-900"
                    : "text-slate-400 font-medium border-b-2 border-transparent"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="mx-4 sm:mx-6 lg:mx-[470px] py-3 pb-10 space-y-2">
        {tripType === "roundtrip" && leg === "inbound" && outboundParam && (
          <OutboundRecap
            outboundJson={outboundParam}
            onChange={() => {
              const next = new URLSearchParams(sp.toString());
              next.delete("leg");
              next.delete("outbound");
              router.push(`/search?${next.toString()}`);
            }}
          />
        )}

        {data && !data.ok && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {data.error}
          </div>
        )}

        {data?.ok && data.source === "mock" && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs">
            ⚠ 실시간 TAGO 응답을 받지 못해 데모용 모의 시간표를 표시합니다.
            {data.reason ? ` (${data.reason})` : ""}
          </div>
        )}

        {data?.ok && filtered.length === 0 && (
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
              <rect x="14" y="10" width="36" height="38" rx="6" />
              <path d="M14 28h36" />
              <path d="M22 10v6M42 10v6" />
              <path d="M22 48l-3 6M42 48l3 6" />
              <circle cx="24" cy="38" r="1.6" fill="currentColor" />
              <circle cx="40" cy="38" r="1.6" fill="currentColor" />
            </svg>
            <p className="mt-4 text-sm text-slate-500">예매할 수 있는 열차가 없습니다.</p>
          </div>
        )}

        {filtered.map((t, idx) => (
          <TrainCard
            key={`${t.trainGradeName}-${t.trainNo}-${t.depPlandTime}-${idx}`}
            t={t}
            onPick={() => onPick(t)}
          />
        ))}
      </div>
    </div>
  );
}

function TrainCard({
  t,
  onPick,
}: {
  t: TrainSchedule;
  onPick: () => void;
}) {
  const mins = durationMinutes(t.depPlandTime, t.arrPlandTime);
  const standardPrice = t.adultCharge;
  const firstPrice = Math.round((t.adultCharge * FIRST_CLASS_MULT) / 100) * 100;
  return (
    <button
      type="button"
      onClick={onPick}
      className="block w-full text-left bg-white border border-slate-200 p-4 hover:border-slate-400 transition"
    >
      <div className="flex items-center gap-2 mb-3">
        <GradeBadge name={t.trainGradeName} />
        <span className="text-sky-600 text-sm font-semibold">{Number(t.trainNo) || t.trainNo}</span>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xl font-bold tabular-nums text-slate-900 leading-tight whitespace-nowrap">
            {fmtTime(t.depPlandTime)}
            <span className="text-slate-300 mx-1.5 text-xl">→</span>
            {fmtTime(t.arrPlandTime)}
          </div>
          <div className="text-xs text-slate-500 mt-1">{fmtDuration(mins)}</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <PriceBox label="일반실" price={standardPrice} />
          <PriceBox label="특실" price={firstPrice} />
        </div>
      </div>
    </button>
  );
}

function GradeBadge({ name }: { name: string }) {
  // Different color hints per family
  const cls =
    name.startsWith("KTX-산천")
      ? "bg-sky-700"
      : name.startsWith("KTX-이음")
        ? "bg-sky-700"
        : name.startsWith("KTX-청룡")
          ? "bg-indigo-700"
          : name.startsWith("KTX")
            ? "bg-sky-600"
            : name === "SRT"
              ? "bg-fuchsia-700"
              : name.includes("새마을")
                ? "bg-emerald-700"
                : name.includes("무궁화")
                  ? "bg-rose-600"
                  : "bg-slate-700";
  return (
    <span className={`inline-block ${cls} text-white text-[11px] font-bold px-2 py-1 rounded-md leading-none`}>
      {name}
    </span>
  );
}

function PriceBox({
  label,
  price,
  soldOut,
}: {
  label: string;
  price: number;
  soldOut?: boolean;
}) {
  return (
    <span
      className={`inline-flex flex-col items-center justify-center w-[80px] h-12 rounded-sm border leading-tight px-1 ${
        soldOut
          ? "border-slate-200 bg-white text-slate-300"
          : "border-slate-200 bg-white"
      }`}
    >
      <span className="text-[11px] text-slate-500">{label}</span>
      {soldOut ? (
        <span className="text-[13px] font-bold text-red-500 mt-0.5">매진</span>
      ) : (
        <span className="text-[13px] font-bold text-slate-900 tabular-nums mt-0.5 whitespace-nowrap">
          ₩{price.toLocaleString("ko-KR")}
        </span>
      )}
    </span>
  );
}

function OutboundRecap({
  outboundJson,
  onChange,
}: {
  outboundJson: string;
  onChange: () => void;
}) {
  try {
    const t = JSON.parse(decodeURIComponent(outboundJson)) as TrainSchedule;
    return (
      <div className="pb-2">
        <button
          type="button"
          onClick={onChange}
          className="inline-flex items-center gap-2 text-sm bg-sky-50 border border-sky-100 text-sky-800 rounded-full px-3 py-1.5 hover:bg-sky-100 transition"
        >
          <span className="font-semibold">가는 편</span>
          <span>
            {t.depPlaceName} {fmtTime(t.depPlandTime)} → {t.arrPlaceName} {fmtTime(t.arrPlandTime)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    );
  } catch {
    return null;
  }
}

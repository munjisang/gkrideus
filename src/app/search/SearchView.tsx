"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtTime, durationMinutes } from "../../lib/format";
import SearchLoading from "../../components/SearchLoading";
import DatePickerSheet, { type DateHour } from "../../components/DatePickerSheet";
import PassengersSheet, { type Passengers } from "../../components/PassengersSheet";
import { TrainLogo } from "../../components/TrainLogo";
import { useI18n, stationLabel, type Lang } from "../../lib/i18n";
import type { TrainSchedule, TripType } from "../../lib/types";

function durationL(min: number, lang: Lang): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (lang === "ko") return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function krwL(n: number, lang: Lang): string {
  return lang === "ko"
    ? `${n.toLocaleString("ko-KR")}원`
    : `₩${n.toLocaleString("en-US")}`;
}

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

type FilterKey = "all" | "KTX" | "SRT";
const FILTER_TABS: { key: FilterKey; tkey: string }[] = [
  { key: "all", tkey: "sr.filter.all" },
  { key: "KTX", tkey: "sr.filter.ktx" },
  { key: "SRT", tkey: "sr.filter.srt" },
];

const FIRST_CLASS_MULT = 1.4;

function encodeTrain(t: TrainSchedule): string {
  return encodeURIComponent(JSON.stringify(t));
}

function matchesFilter(t: TrainSchedule, f: FilterKey): boolean {
  if (f === "all") return true;
  const name = t.trainGradeName || "";
  if (f === "KTX") return name.startsWith("KTX"); // KTX, KTX-산천, KTX-이음, KTX-청룡
  if (f === "SRT") return name === "SRT";
  return false;
}

export default function SearchView() {
  const router = useRouter();
  const sp = useSearchParams();
  const { t, lang } = useI18n();

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
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [paxSheetOpen, setPaxSheetOpen] = useState(false);

  // Booking window matches the home page (D+2 ~ D+30).
  const { minBookDate, maxBookDate } = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const minD = new Date();
    minD.setDate(minD.getDate() + 2);
    const maxD = new Date();
    maxD.setDate(maxD.getDate() + 30);
    return { minBookDate: fmt(minD), maxBookDate: fmt(maxD) };
  }, []);

  // YYYYMMDD → YYYY-MM-DD for the date picker.
  const currentDateHour: DateHour | null = useMemo(() => {
    if (!date || date.length < 8) return null;
    return {
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      hour: startHour,
    };
  }, [date, startHour]);

  const currentPax: Passengers = useMemo(
    () => ({
      adults: Number(sp.get("adults") ?? sp.get("passengers") ?? "1") || 1,
      children: Number(sp.get("children") ?? "0") || 0,
      toddlers: Number(sp.get("toddlers") ?? "0") || 0,
      seniors: Number(sp.get("seniors") ?? "0") || 0,
    }),
    [sp],
  );

  /** Map keyed by zero-stripped train_no. */
  type SeatAvail = {
    generalSeat: string;
    specialSeat: string;
    /** "Y"|"N" — whole-train reservability. "N" means every class is closed. */
    reservePossible: string;
    /** Korail-side fare for the 일반실, parsed from reservePossibleName.
     *  Often matches TAGO; lower when a discount applies. */
    generalPrice: number | null;
    /** Promo tag, e.g. "5%적립" or "25%할인". null if none. */
    promo: string | null;
  };
  const [availability, setAvailability] = useState<Map<string, SeatAvail>>(
    () => new Map(),
  );

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
      setData({ ok: false, error: t("sr.searchAgain") });
      return;
    }
    setLoading(true);
    setAvailability(new Map());
    // Primary fetch: TAGO (fast, has pricing).
    fetch(`/api/trains?from=${fromId}&to=${toId}&date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: ApiResponse) => setData(j))
      .catch((e: Error) => setData({ ok: false, error: e.message }))
      .finally(() => setLoading(false));

    // Secondary fetch: Korail seat availability — non-blocking, may take
    // a few seconds on cold start, may fail entirely if Korail is blocked.
    // We just enrich silently when it arrives.
    const fromName = fromNameParam || "";
    const toName = toNameParam || "";
    if (fromName && toName) {
      fetch("/api/booking/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depName: fromName,
          arrName: toName,
          date,
          time: "000000",
        }),
      })
        .then((r) => r.json())
        .then(
          (j: {
            ok: boolean;
            trains?: {
              trainNo: string;
              generalSeat: string;
              specialSeat: string;
              reservePossible?: string;
              reservePossibleName?: string;
            }[];
          }) => {
            if (!j.ok || !j.trains) return;
            const m = new Map<string, SeatAvail>();
            for (const x of j.trains) {
              const key = String(x.trainNo).replace(/^0+/, "") || "0";
              const reservable = (x.reservePossible ?? "").toUpperCase() === "Y";
              // Korail keeps showing a fare in reservePossibleName even when
              // sold out — only trust it for promo display when reservable.
              const { price, promo } = reservable
                ? parsePromo(x.reservePossibleName ?? "")
                : { price: null, promo: null };
              m.set(key, {
                generalSeat: x.generalSeat,
                specialSeat: x.specialSeat,
                reservePossible: x.reservePossible ?? "",
                generalPrice: price,
                promo,
              });
            }
            setAvailability(m);
          },
        )
        .catch(() => {
          /* silent — availability is optional UX */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Merge the live Korail standard-class price (when known) into the
   *  schedule so the order page can show the discount breakdown. */
  function withLivePrice(tr: TrainSchedule): TrainSchedule {
    const key = String(tr.trainNo).replace(/^0+/, "") || "0";
    const live = availability.get(key)?.generalPrice;
    if (live != null && live > 0 && live < tr.adultCharge) {
      return { ...tr, discountedCharge: live };
    }
    return tr;
  }

  function onPick(t: TrainSchedule) {
    const enriched = withLivePrice(t);
    if (tripType === "roundtrip" && leg === "outbound") {
      const next = new URLSearchParams(sp.toString());
      next.set("leg", "inbound");
      next.set("outbound", encodeTrain(enriched));
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
      params.set("inbound", encodeTrain(enriched));
    } else {
      params.set("outbound", encodeTrain(enriched));
    }
    router.push(`/order?${params.toString()}`);
  }

  const fromLabel = stationLabel(fromName, lang);
  const toLabel = stationLabel(toName, lang);

  if (loading) {
    return (
      <SearchLoading
        from={fromLabel || t("home.dep")}
        to={toLabel || t("home.arr")}
      />
    );
  }

  return (
    <div className="bg-slate-50 min-h-full">
      {/* Sticky top header (within main, below the global header) */}
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
            {fromLabel}
            {t("sp.stationSuffix")}
            <span className="mx-0.5 text-slate-400">→</span>
            {toLabel}
            {t("sp.stationSuffix")}
          </h1>
          <span className="w-10" />
        </div>
        {/* Filter tabs */}
        <div
          ref={tabsRef}
          className="mx-4 sm:mx-6 lg:mx-[470px] flex gap-2 overflow-x-auto no-scrollbar pb-3 scroll-smooth"
        >
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                data-active={active}
                onClick={() => setFilter(tab.key)}
                className={`shrink-0 text-[15px] px-4 pb-2 -mb-2 transition ${
                  active
                    ? "text-slate-900 font-bold border-b-2 border-slate-900"
                    : "text-slate-400 font-medium border-b-2 border-transparent"
                }`}
              >
                {t(tab.tkey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Round-trip recap: show the picked outbound train above the
          date/passenger pills when the user is on the inbound leg. */}
      {tripType === "roundtrip" && leg === "inbound" && outboundParam && (
        <div className="mx-4 sm:mx-6 lg:mx-[470px] pt-3">
          <OutboundRecap
            outboundJson={outboundParam}
            onChange={() => {
              const next = new URLSearchParams(sp.toString());
              next.delete("leg");
              next.delete("outbound");
              router.push(`/search?${next.toString()}`);
            }}
          />
        </div>
      )}

      {/* Filter pills: date+hour and passenger count */}
      <div className="mx-4 sm:mx-6 lg:mx-[470px] pt-3 pb-1 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDateSheetOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-slate-300 transition"
        >
          <span className="tabular-nums">
            {currentDateHour ? fmtDateHourPill(currentDateHour, t) : t("home.pickDate")}
          </span>
          <svg
            className="text-slate-400"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setPaxSheetOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-slate-300 transition"
        >
          <span className="tabular-nums">
            {t("sr.totalPax", { n: totalPax(currentPax) })}
          </span>
          <svg
            className="text-slate-400"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="mx-4 sm:mx-6 lg:mx-[470px] py-3 pb-10 space-y-2">
        {data && !data.ok && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {data.error}
          </div>
        )}

        {data?.ok && data.source === "mock" && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs">
            ⚠ {t("sr.mockWarn")}
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
            <p className="mt-4 text-sm text-slate-500">{t("sr.none")}</p>
          </div>
        )}

        {filtered.map((tr, idx) => {
          const key = String(tr.trainNo).replace(/^0+/, "") || "0";
          const avail = availability.get(key);
          return (
            <TrainCard
              key={`${tr.trainGradeName}-${tr.trainNo}-${tr.depPlandTime}-${idx}`}
              train={tr}
              lang={lang}
              t={t}
              standardSoldOut={isSoldOut(avail?.generalSeat, avail?.reservePossible)}
              firstSoldOut={isSoldOut(avail?.specialSeat, avail?.reservePossible)}
              firstUnavailable={isClassUnavailable(avail?.specialSeat)}
              standardLivePrice={avail?.generalPrice ?? null}
              onPick={() => onPick(tr)}
            />
          );
        })}
      </div>

      <DatePickerSheet
        open={dateSheetOpen}
        title={leg === "inbound" ? t("dp.titleRet") : t("dp.titleDep")}
        value={currentDateHour}
        minDate={minBookDate}
        maxDate={maxBookDate}
        onClose={() => setDateSheetOpen(false)}
        onPick={(v) => {
          const next = new URLSearchParams(sp.toString());
          // Outbound leg owns ?date/?hour; inbound leg owns ?returnDate/?returnHour.
          if (leg === "inbound") {
            next.set("returnDate", v.date.replace(/-/g, ""));
            next.set("returnHour", String(v.hour));
          } else {
            next.set("date", v.date.replace(/-/g, ""));
            next.set("hour", String(v.hour));
          }
          setDateSheetOpen(false);
          router.replace(`/search?${next.toString()}`);
        }}
      />

      <PassengersSheet
        open={paxSheetOpen}
        value={currentPax}
        onClose={() => setPaxSheetOpen(false)}
        onPick={(v) => {
          const next = new URLSearchParams(sp.toString());
          next.set("adults", String(v.adults));
          next.set("children", String(v.children));
          next.set("toddlers", String(v.toddlers));
          next.set("seniors", String(v.seniors));
          next.set(
            "passengers",
            String(v.adults + v.children + v.toddlers + v.seniors),
          );
          setPaxSheetOpen(false);
          router.replace(`/search?${next.toString()}`);
        }}
      />
    </div>
  );
}

function totalPax(p: Passengers): number {
  return p.adults + p.children + p.toddlers + p.seniors;
}

/** "2026.05.29 · 00시 이후" — matches the home-page format. */
function fmtDateHourPill(
  v: DateHour,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  const [y, m, d] = v.date.split("-");
  return `${y}.${m}.${d} · ${t("home.afterHour", { h: String(v.hour).padStart(2, "0") })}`;
}

/** Per-class sold-out detection. Korail's per-class codes observed in the
 *  wild: "11"=예약가능, "12"/"13"=매진/예약불가, "14"=예약대기, "00"=해당
 *  클래스 없음. Combined with the train-wide `reservePossible` flag — when
 *  it's "N" the whole train is closed regardless of per-class code.
 *  Unknown / "11" → assume available. */
function isSoldOut(
  code: string | undefined,
  reservePossible: string | undefined,
): boolean {
  if ((reservePossible ?? "").toUpperCase() === "N") return true;
  return code === "12" || code === "13";
}
function isClassUnavailable(code: string | undefined): boolean {
  return code === "00";
}

/** Parse Korail's reservePossibleName like "59,800원\n5%적립" or
 *  "44,800원 25%할인" into a numeric price + a short promo tag. */
function parsePromo(text: string): {
  price: number | null;
  promo: string | null;
} {
  if (!text) return { price: null, promo: null };
  const priceMatch = text.match(/([\d,]+)\s*원/);
  const price = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;
  // any "NN% 할인" or "NN% 적립" anywhere in the string
  const promoMatch = text.match(/(\d+\s*%\s*(?:할인|적립))/);
  const promo = promoMatch ? promoMatch[1].replace(/\s+/g, "") : null;
  return { price, promo };
}

function TrainCard({
  train,
  lang,
  t,
  standardSoldOut,
  firstSoldOut,
  firstUnavailable,
  standardLivePrice,
  onPick,
}: {
  train: TrainSchedule;
  lang: Lang;
  t: (k: string) => string;
  standardSoldOut: boolean;
  firstSoldOut: boolean;
  firstUnavailable: boolean;
  standardLivePrice: number | null;
  onPick: () => void;
}) {
  const mins = durationMinutes(train.depPlandTime, train.arrPlandTime);
  const tagoStd = train.adultCharge;
  const standardPrice = standardLivePrice ?? tagoStd;
  // Korail's search endpoint only returns a live price for 일반실. For 특실
  // we infer the discount by reusing the standard-class discount ratio
  // (live/TAGO) — matches how Korail applies promo % uniformly across
  // classes on letskorail.com.
  const firstRegular =
    Math.round((train.adultCharge * FIRST_CLASS_MULT) / 100) * 100;
  const firstPrice =
    standardLivePrice != null && tagoStd > 0
      ? Math.round(
          (train.adultCharge * FIRST_CLASS_MULT * (standardLivePrice / tagoStd)) /
            100,
        ) * 100
      : firstRegular;
  // Whole train unbookable when standard is sold out AND special is either
  // sold out or doesn't exist on this rolling stock.
  const wholeBlocked = standardSoldOut && (firstSoldOut || firstUnavailable);
  // Dimmed-card states for text/logo when the whole train is unbookable.
  const dim = wholeBlocked;
  const muted = (cls: string) => (dim ? "text-slate-400" : cls);
  return (
    <button
      type="button"
      onClick={wholeBlocked ? undefined : onPick}
      disabled={wholeBlocked}
      className={`block w-full text-left rounded-xl border transition ${
        wholeBlocked
          ? "bg-slate-100 border-slate-200 cursor-not-allowed"
          : "bg-white border-slate-200 hover:border-slate-400"
      }`}
    >
      {/* Header: logo + train number */}
      <div className="flex items-baseline gap-1 px-5 pt-4">
        <TrainLogo name={train.trainGradeName} dim={dim} />
        <span className={`text-sm font-semibold ${muted("text-slate-500")}`}>
          {Number(train.trainNo) || train.trainNo}
        </span>
      </div>

      {/* Times + duration row (time on top, station name below) */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-4">
        <div className="flex flex-col items-start min-w-0">
          <span
            className={`text-base font-bold tabular-nums leading-none whitespace-nowrap ${muted(
              "text-slate-900",
            )}`}
          >
            {fmtTime(train.depPlandTime)}
          </span>
          <span
            className={`text-sm mt-1 whitespace-nowrap ${muted("text-slate-600")}`}
          >
            {stationLabel(train.depPlaceName, lang)}
          </span>
        </div>
        <span className="h-px flex-1 bg-slate-200 self-start mt-2.5" aria-hidden />
        <span
          className={`text-xs whitespace-nowrap self-start mt-1 ${muted(
            "text-slate-400",
          )}`}
        >
          {durationL(mins, lang)}
        </span>
        <span className="h-px flex-1 bg-slate-200 self-start mt-2.5" aria-hidden />
        <div className="flex flex-col items-end min-w-0">
          <span
            className={`text-base font-bold tabular-nums leading-none whitespace-nowrap ${muted(
              "text-slate-900",
            )}`}
          >
            {fmtTime(train.arrPlandTime)}
          </span>
          <span
            className={`text-sm mt-1 whitespace-nowrap ${muted("text-slate-600")}`}
          >
            {stationLabel(train.arrPlaceName, lang)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-slate-200" />

      {/* Per-class prices */}
      <div className="grid grid-cols-2 px-5 py-1">
        <SeatColumn
          label={t("sr.standard")}
          price={standardPrice}
          lang={lang}
          soldOut={standardSoldOut}
          dim={dim}
        />
        <div className="border-l border-slate-200">
          <SeatColumn
            label={t("sr.first")}
            price={firstPrice}
            lang={lang}
            soldOut={firstSoldOut}
            unavailable={firstUnavailable}
            dim={dim}
          />
        </div>
      </div>
    </button>
  );
}

function SeatColumn({
  label,
  price,
  lang,
  soldOut,
  unavailable,
  dim,
}: {
  label: string;
  price: number;
  lang: Lang;
  soldOut?: boolean;
  unavailable?: boolean;
  /** Whole-card dim (train fully sold out). */
  dim?: boolean;
}) {
  const labelMuted = soldOut || unavailable || dim;
  return (
    <div className="flex flex-col items-center justify-center py-1">
      <span
        className={`text-xs ${
          labelMuted ? "text-slate-400" : "text-slate-700"
        }`}
      >
        {label}
      </span>
      {unavailable ? (
        <span className="text-base font-bold text-slate-300">—</span>
      ) : soldOut ? (
        <span className="text-base font-bold text-red-500">
          {lang === "ko" ? "매진" : "Sold out"}
        </span>
      ) : (
        <span
          className={`text-base font-bold tabular-nums whitespace-nowrap ${
            dim ? "text-slate-400" : "text-slate-900"
          }`}
        >
          {krwL(price, lang)}
        </span>
      )}
    </div>
  );
}

function OutboundRecap({
  outboundJson,
  onChange,
}: {
  outboundJson: string;
  onChange: () => void;
}) {
  const { t, lang } = useI18n();
  try {
    const tr = JSON.parse(decodeURIComponent(outboundJson)) as TrainSchedule;
    return (
      <button
        type="button"
        onClick={onChange}
        className="w-full flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-50 border border-sky-100 text-sm text-sky-800 hover:bg-sky-100 transition text-left"
      >
        <span className="font-semibold shrink-0">{t("sr.outbound")}</span>
        <span className="flex-1 min-w-0 truncate">
          {stationLabel(tr.depPlaceName, lang)} {fmtTime(tr.depPlandTime)} →{" "}
          {stationLabel(tr.arrPlaceName, lang)} {fmtTime(tr.arrPlandTime)}
        </span>
        <svg
          className="shrink-0"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    );
  } catch {
    return null;
  }
}

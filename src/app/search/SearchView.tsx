"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtTime, durationMinutes } from "../../lib/format";
import SearchLoading from "../../components/SearchLoading";
import DatePickerSheet, { type DateHour } from "../../components/DatePickerSheet";
import PassengersSheet, { type Passengers } from "../../components/PassengersSheet";
import { TrainLogo } from "../../components/TrainLogo";
import { firstClassMult } from "../../lib/fare";
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

const SEAT_CLASS_OPTS: { key: "all" | "standard" | "first"; tkey: string }[] = [
  { key: "all", tkey: "sr.optAll" },
  { key: "standard", tkey: "sr.standard" },
  { key: "first", tkey: "sr.first" },
];

const DEP_PERIOD_OPTS: {
  key: "all" | "morning" | "afternoon" | "evening";
  tkey: string;
}[] = [
  { key: "all", tkey: "sr.optAll" },
  { key: "morning", tkey: "sr.timeMorning" },
  { key: "afternoon", tkey: "sr.timeAfternoon" },
  { key: "evening", tkey: "sr.timeEvening" },
];

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
  const [hideSoldOut, setHideSoldOut] = useState(false);
  const [seatClass, setSeatClass] = useState<"all" | "standard" | "first">("all");
  const [depPeriod, setDepPeriod] = useState<
    "all" | "morning" | "afternoon" | "evening"
  >("all");
  const [sortBy] = useState<"earliest" | "fastest">("earliest");
  const tabsRef = useRef<HTMLDivElement>(null);
  const dateChipRef = useRef<HTMLButtonElement>(null);
  const paxChipRef = useRef<HTMLButtonElement>(null);
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
    // Read as text first so an empty body or non-JSON error page surfaces as a
    // friendly message instead of the raw "Unexpected end of JSON input" string.
    fetch(`/api/trains?from=${fromId}&to=${toId}&date=${date}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        if (!text.trim()) {
          throw new Error(r.ok ? t("sr.serverError") : `HTTP ${r.status}`);
        }
        try {
          return JSON.parse(text) as ApiResponse;
        } catch {
          throw new Error(r.ok ? t("sr.serverError") : `HTTP ${r.status}`);
        }
      })
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
    const list = data.trains.filter((t) => {
      if (!matchesFilter(t, filter)) return false;
      // depPlandTime is YYYYMMDDHHmm — slice 8-10 is the hour.
      const depHour = Number(t.depPlandTime.slice(8, 10));
      if (depHour < startHour) return false;
      // Departure time-of-day band.
      if (depPeriod !== "all") {
        if (depPeriod === "morning" && !(depHour >= 0 && depHour <= 11)) return false;
        if (depPeriod === "afternoon" && !(depHour >= 12 && depHour <= 17)) return false;
        if (depPeriod === "evening" && !(depHour >= 18 && depHour <= 23)) return false;
      }
      // Seat class: "first" keeps only trains whose 특실 exists and isn't sold out.
      if (seatClass === "first") {
        const key = String(t.trainNo).replace(/^0+/, "") || "0";
        const avail = availability.get(key);
        // Only filter when we actually have availability data for this train.
        if (avail) {
          if (isClassUnavailable(avail.specialSeat)) return false;
          if (isSoldOut(avail.specialSeat, avail.reservePossible)) return false;
        }
      }
      // Hide sold-out: drop trains whose every class is sold out / unavailable.
      if (hideSoldOut) {
        const key = String(t.trainNo).replace(/^0+/, "") || "0";
        const avail = availability.get(key);
        if (avail) {
          const stdSold = isSoldOut(avail.generalSeat, avail.reservePossible);
          const fstSold =
            isSoldOut(avail.specialSeat, avail.reservePossible) ||
            isClassUnavailable(avail.specialSeat);
          if (stdSold && fstSold) return false;
        }
      }
      // "standard" / "all" — every train passes.
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === "fastest") {
        return (
          durationMinutes(a.depPlandTime, a.arrPlandTime) -
          durationMinutes(b.depPlandTime, b.arrPlandTime)
        );
      }
      // earliest: depPlandTime is YYYYMMDDHHmm — lexical compare works.
      return a.depPlandTime.localeCompare(b.depPlandTime);
    });
    return list;
  }, [data, filter, startHour, depPeriod, seatClass, hideSoldOut, availability, sortBy]);

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
    <div className="bg-white min-h-full">
      {/* Sticky top header (within main, below the global header) */}
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
            {fromLabel}
            {t("sp.stationSuffix")}
            <span className="mx-0.5 text-ink-faint">→</span>
            {toLabel}
            {t("sp.stationSuffix")}
          </h1>
          <span className="w-10" />
        </div>
        {/* Filter tabs (home-style pill chips) */}
      </div>

      {/* Filter sidebar (desktop) + results — two columns on lg */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 pt-8 pb-3 lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 lg:items-start">
        {/* Left filter panel (desktop only; mobile uses the top pill tabs) */}
        <aside className="lg:sticky lg:top-[90px] space-y-4">
          {/* Unified filter card */}
          <div className="card-apple overflow-hidden">
            {/* Header: title + reset */}
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <div className="flex items-center gap-1.5">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-action"
                  aria-hidden
                >
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                <h3 className="text-sm font-bold tracking-tight text-ink">
                  {t("sr.searchFilter")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setSeatClass("all");
                  setDepPeriod("all");
                  setHideSoldOut(false);
                }}
                className="text-xs font-semibold text-ink-faint transition-colors hover:text-action"
              >
                {t("sr.reset")}
              </button>
            </div>

            {/* Section: date & passengers */}
            <div className="border-b border-divider px-4 py-3 space-y-2">
              <button
                ref={dateChipRef}
                type="button"
                onClick={() => setDateSheetOpen(true)}
                className="w-full inline-flex items-center justify-between gap-1.5 h-10 px-3.5 rounded-lg border border-hairline bg-white text-sm font-semibold text-ink-soft hover:border-action active:scale-[0.99] transition"
              >
                <span className="tabular-nums truncate">
                  {currentDateHour ? fmtDateHourPill(currentDateHour, t) : t("home.pickDate")}
                </span>
                <svg className="text-ink-faint shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <button
                ref={paxChipRef}
                type="button"
                onClick={() => setPaxSheetOpen(true)}
                className="w-full inline-flex items-center justify-between gap-1.5 h-10 px-3.5 rounded-lg border border-hairline bg-white text-sm font-semibold text-ink-soft hover:border-action active:scale-[0.99] transition"
              >
                <span className="tabular-nums truncate">
                  {t("sr.totalPax", { n: totalPax(currentPax) })}
                </span>
                <svg className="text-ink-faint shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {/* Section: hide sold-out toggle */}
            <div className="border-b border-divider px-4 py-3">
              <label className="flex cursor-pointer select-none items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={hideSoldOut}
                  onChange={(e) => setHideSoldOut(e.target.checked)}
                  className="h-4 w-4 rounded accent-action"
                />
                <span className="text-sm font-medium text-ink">
                  {t("sr.hideSoldOut")}
                </span>
              </label>
            </div>

            {/* Section: train type */}
            <div className="border-b border-divider px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("sr.filterTitle")}
              </h4>
              <div className="space-y-1">
                {FILTER_TABS.map((tab) => {
                  const active = filter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilter(tab.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? "bg-action/10 font-semibold text-action"
                          : "font-medium text-ink-soft hover:bg-parchment"
                      }`}
                    >
                      {t(tab.tkey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section: seat class */}
            <div className="border-b border-divider px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("sr.seatClassTitle")}
              </h4>
              <div className="space-y-1">
                {SEAT_CLASS_OPTS.map((opt) => {
                  const active = seatClass === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSeatClass(opt.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? "bg-action/10 font-semibold text-action"
                          : "font-medium text-ink-soft hover:bg-parchment"
                      }`}
                    >
                      {t(opt.tkey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section: departure time */}
            <div className="px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("sr.depTimeTitle")}
              </h4>
              <div className="space-y-1">
                {DEP_PERIOD_OPTS.map((opt) => {
                  const active = depPeriod === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setDepPeriod(opt.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? "bg-action/10 font-semibold text-action"
                          : "font-medium text-ink-soft hover:bg-parchment"
                      }`}
                    >
                      {t(opt.tkey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Right column: leg title + recap + results */}
        <div className="min-w-0">
          {/* Round-trip recap (picked outbound) — pinned to the top */}
          {tripType === "roundtrip" && leg === "inbound" && outboundParam && (
            <div className="pb-3">
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

          {/* Leg heading (가는편 / 오는편) */}
          <h2 className="text-2xl font-bold tracking-tight text-ink">
            {leg === "inbound" ? t("sr.legInbound") : t("sr.legOutbound")}
          </h2>
          <div className="mt-3 border-t border-hairline" />

          {/* Result count */}
          {data?.ok && (
            <div className="pt-3 text-sm font-semibold text-ink-soft">
              {t("sr.resultLabel")}{" "}
              <span className="text-action tabular-nums">
                {t("sr.resultCount", { n: filtered.length })}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="pt-3 pb-10 space-y-2">
        {data && !data.ok && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-card px-4 py-3 text-sm">
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
              className="w-20 h-20 text-ink-faint/50"
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
            <p className="mt-4 text-sm text-ink-soft">{t("sr.none")}</p>
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
        </div>
      </div>

      <DatePickerSheet
        open={dateSheetOpen}
        title={leg === "inbound" ? t("dp.titleRet") : t("dp.titleDep")}
        value={currentDateHour}
        anchorRef={dateChipRef}
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
        anchorRef={paxChipRef}
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
  return `${y}.${m}.${d}`;
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
  // we (1) use a grade-specific multiplier to estimate the regular fare,
  // and (2) re-apply the standard-class discount ratio (live/TAGO) to it.
  // Korail applies promo % uniformly across classes on letskorail.com.
  const mult = firstClassMult(train.trainGradeName);
  const firstRegular = Math.round((train.adultCharge * mult) / 100) * 100;
  const firstPrice =
    standardLivePrice != null && tagoStd > 0
      ? Math.round(
          (train.adultCharge * mult * (standardLivePrice / tagoStd)) / 100,
        ) * 100
      : firstRegular;
  // Whole train unbookable when standard is sold out AND special is either
  // sold out or doesn't exist on this rolling stock.
  const wholeBlocked = standardSoldOut && (firstSoldOut || firstUnavailable);
  // Dimmed-card states for text/logo when the whole train is unbookable.
  const dim = wholeBlocked;
  const muted = (cls: string) => (dim ? "text-ink-faint" : cls);
  return (
    <button
      type="button"
      onClick={wholeBlocked ? undefined : onPick}
      disabled={wholeBlocked}
      style={{ borderLeft: "3px solid #1D4ED8" }}
      className={`block w-full text-left rounded-xl border transition ${
        wholeBlocked
          ? "bg-parchment border-hairline cursor-not-allowed"
          : "bg-white border-hairline hover:border-action active:scale-[0.98]"
      }`}
    >
      {/* Desktop: single balanced horizontal row. Mobile: stacked. */}
      <div className="lg:flex lg:items-stretch">
        {/* Train identity + times + duration */}
        <div className="lg:flex-1 lg:min-w-0">
          {/* Header: logo + train number */}
          <div className="flex items-baseline gap-1 px-5 pt-4">
            <TrainLogo name={train.trainGradeName} dim={dim} />
            <span className={`text-sm font-semibold ${muted("text-ink-soft")}`}>
              {Number(train.trainNo) || train.trainNo}
            </span>
          </div>

          {/* Times + duration row (time on top, station name below) */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-4">
            <div className="flex flex-col items-start min-w-0">
              <span
                className={`text-base font-semibold tabular-nums leading-none whitespace-nowrap ${muted(
                  "text-ink",
                )}`}
              >
                {fmtTime(train.depPlandTime)}
              </span>
              <span
                className={`text-sm mt-1 whitespace-nowrap ${muted("text-ink-soft")}`}
              >
                {stationLabel(train.depPlaceName, lang)}
              </span>
            </div>
            <span className="h-px flex-1 bg-hairline self-start mt-2.5" aria-hidden />
            <span
              className={`text-xs whitespace-nowrap self-start mt-1 ${muted(
                "text-ink-faint",
              )}`}
            >
              {durationL(mins, lang)}
            </span>
            <span className="h-px flex-1 bg-hairline self-start mt-2.5" aria-hidden />
            <div className="flex flex-col items-end min-w-0">
              <span
                className={`text-base font-semibold tabular-nums leading-none whitespace-nowrap ${muted(
                  "text-ink",
                )}`}
              >
                {fmtTime(train.arrPlandTime)}
              </span>
              <span
                className={`text-sm mt-1 whitespace-nowrap ${muted("text-ink-soft")}`}
              >
                {stationLabel(train.arrPlaceName, lang)}
              </span>
            </div>
          </div>
        </div>

        {/* Divider: horizontal on mobile, vertical on desktop */}
        <div className="mx-5 border-t border-divider lg:mx-0 lg:my-4 lg:border-t-0 lg:border-l" />

        {/* Per-class prices */}
        <div className="grid grid-cols-2 px-5 py-1 lg:shrink-0 lg:w-[320px] lg:self-center lg:py-2">
          <SeatColumn
            label={t("sr.standard")}
            price={standardPrice}
            lang={lang}
            soldOut={standardSoldOut}
            dim={dim}
          />
          <div className="border-l border-divider">
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
          labelMuted ? "text-ink-faint" : "text-ink-soft"
        }`}
      >
        {label}
      </span>
      {unavailable ? (
        <span className="text-base font-semibold text-ink-faint/60">—</span>
      ) : soldOut ? (
        <span className="text-base font-semibold text-red-500">
          {lang === "ko" ? "매진" : "Sold out"}
        </span>
      ) : (
        <span
          className={`text-base font-semibold tabular-nums whitespace-nowrap ${
            dim ? "text-ink-faint" : "text-ink"
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
        className="w-full flex items-center gap-2 px-5 py-3 rounded-card bg-action/[0.06] border border-action/15 text-sm text-action hover:bg-action/10 active:scale-[0.98] transition text-left"
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

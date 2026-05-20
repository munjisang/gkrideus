"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtTime, durationMinutes } from "../../lib/format";
import SearchLoading from "../../components/SearchLoading";
import { useI18n, stationLabel, gradeLabel, type Lang } from "../../lib/i18n";
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

type FilterKey = "all" | "KTX" | "SRT" | "새마을" | "무궁화" | "ITX-청춘";
const FILTER_TABS: { key: FilterKey; tkey: string }[] = [
  { key: "all", tkey: "sr.filter.all" },
  { key: "KTX", tkey: "sr.filter.ktx" },
  { key: "SRT", tkey: "sr.filter.srt" },
  { key: "새마을", tkey: "sr.filter.saemaul" },
  { key: "무궁화", tkey: "sr.filter.mugunghwa" },
  { key: "ITX-청춘", tkey: "sr.filter.itx" },
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
              promo={avail?.promo ?? null}
              onPick={() => onPick(tr)}
            />
          );
        })}
      </div>
    </div>
  );
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
  promo,
  onPick,
}: {
  train: TrainSchedule;
  lang: Lang;
  t: (k: string) => string;
  standardSoldOut: boolean;
  firstSoldOut: boolean;
  firstUnavailable: boolean;
  standardLivePrice: number | null;
  promo: string | null;
  onPick: () => void;
}) {
  const mins = durationMinutes(train.depPlandTime, train.arrPlandTime);
  const tagoStd = train.adultCharge;
  const standardPrice = standardLivePrice ?? tagoStd;
  const isDiscounted =
    standardLivePrice !== null && standardLivePrice < tagoStd;
  const firstPrice = Math.round((train.adultCharge * FIRST_CLASS_MULT) / 100) * 100;
  return (
    <button
      type="button"
      onClick={onPick}
      className="block w-full text-left bg-white border border-slate-200 p-4 hover:border-slate-400 transition"
    >
      <div className="flex items-center gap-2 mb-3">
        <GradeBadge name={train.trainGradeName} lang={lang} />
        <span className="text-sky-600 text-sm font-semibold">
          {Number(train.trainNo) || train.trainNo}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xl font-bold tabular-nums text-slate-900 leading-tight whitespace-nowrap">
            {fmtTime(train.depPlandTime)}
            <span className="text-slate-300 mx-1.5 text-xl">→</span>
            {fmtTime(train.arrPlandTime)}
          </div>
          <div className="text-xs text-slate-500 mt-1">{durationL(mins, lang)}</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <PriceBox
            label={t("sr.standard")}
            price={standardPrice}
            originalPrice={isDiscounted ? tagoStd : null}
            promo={promo}
            lang={lang}
            soldOut={standardSoldOut}
          />
          <PriceBox
            label={t("sr.first")}
            price={firstPrice}
            originalPrice={null}
            promo={null}
            lang={lang}
            soldOut={firstSoldOut}
            unavailable={firstUnavailable}
          />
        </div>
      </div>
    </button>
  );
}

function GradeBadge({ name, lang }: { name: string; lang: Lang }) {
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
      {gradeLabel(name, lang)}
    </span>
  );
}

function PriceBox({
  label,
  price,
  originalPrice,
  promo,
  lang,
  soldOut,
  unavailable,
}: {
  label: string;
  price: number;
  originalPrice?: number | null;
  promo?: string | null;
  lang: Lang;
  soldOut?: boolean;
  unavailable?: boolean;
}) {
  const showDiscount = !!originalPrice && originalPrice > price;
  const hasPromo = !!promo;
  return (
    <span
      className={`inline-flex flex-col items-center justify-center w-[88px] ${
        hasPromo ? "h-14" : "h-12"
      } rounded-sm border leading-tight px-1 ${
        soldOut || unavailable
          ? "border-slate-200 bg-white text-slate-300"
          : "border-slate-200 bg-white"
      }`}
    >
      <span className="text-[11px] text-slate-500">{label}</span>
      {unavailable ? (
        <span className="text-[13px] font-bold text-slate-400 mt-0.5">—</span>
      ) : soldOut ? (
        <span className="text-[13px] font-bold text-red-500 mt-0.5">
          {lang === "ko" ? "매진" : "Sold out"}
        </span>
      ) : (
        <>
          <span
            className={`text-[13px] font-bold tabular-nums whitespace-nowrap ${
              showDiscount ? "text-rose-600" : "text-slate-900"
            } mt-0.5`}
          >
            {krwL(price, lang)}
          </span>
          {hasPromo && (
            <span
              className={`text-[9px] font-semibold leading-none mt-0.5 ${
                promo!.includes("할인") ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {promo}
            </span>
          )}
        </>
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
  const { t, lang } = useI18n();
  try {
    const tr = JSON.parse(decodeURIComponent(outboundJson)) as TrainSchedule;
    return (
      <div className="pb-2">
        <button
          type="button"
          onClick={onChange}
          className="inline-flex items-center gap-2 text-sm bg-sky-50 border border-sky-100 text-sky-800 rounded-full px-3 py-1.5 hover:bg-sky-100 transition"
        >
          <span className="font-semibold">{t("sr.outbound")}</span>
          <span>
            {stationLabel(tr.depPlaceName, lang)} {fmtTime(tr.depPlandTime)} →{" "}
            {stationLabel(tr.arrPlaceName, lang)} {fmtTime(tr.arrPlandTime)}
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

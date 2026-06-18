"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  pushRecent,
  pushRecentRoute,
  pushRecentBusRoute,
} from "../../lib/recentStations";
import { useI18n, stationLabel } from "../../lib/i18n";
import StationPicker from "../../components/StationPicker";
import BusCityPicker from "../../components/BusCityPicker";
import DatePickerSheet, { type DateHour } from "../../components/DatePickerSheet";
import PassengersSheet, { type Passengers } from "../../components/PassengersSheet";
import {
  busCityLabel,
  busCityLabelByName,
  busCityById,
  type BusCity,
} from "../../lib/busCities";
import type { TripType } from "../../lib/types";

type Station = { id: string; name: string };
type CityGroup = { cityCode: string; cityName: string; stations: Station[] };
type StationsResponse =
  | { ok: true; count: number; cities: CityGroup[] }
  | { ok: false; error: string };

// Full-bleed hero photograph (station platform). CSS background — not next/image,
// so no remote-domain allowlist needed. bg-tile shows through if it fails to load.
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1506816561089-5cc37b3aa9b0?auto=format&fit=crop&w=1920&q=80";

// Popular routes shown on the home page, by Korean station name. Pairs whose
// stations aren't present in the loaded data are filtered out.
// [departure, arrival, approximate lowest KTX fare (KRW)]
const POPULAR_ROUTES: [string, string, number][] = [
  ["서울", "부산", 59800],
  ["서울", "강릉", 27600],
  ["서울", "동대구", 43500],
  ["서울", "여수EXPO", 47200],
  ["용산", "목포", 52800],
  ["서울", "광주송정", 46800],
  ["서울", "포항", 53700],
  ["서울", "마산", 53300],
  ["서울", "순천", 51500],
  ["서울", "전주", 34400],
  ["서울", "경주", 49000],
  ["서울", "안동", 39900],
];

// Destination imagery for the popular-route cards (verified Unsplash CDN URLs).
const ROUTE_IMAGES: Record<string, string> = {
  부산: "https://images.unsplash.com/photo-1638591751482-1a7d27fcea15?auto=format&fit=crop&w=600&q=70",
  강릉: "https://images.unsplash.com/photo-1684042229029-8a899193a8e4?auto=format&fit=crop&w=600&q=70",
  동대구: "https://images.unsplash.com/photo-1663670889635-0aabebf112ba?auto=format&fit=crop&w=600&q=70",
  "여수EXPO": "https://images.unsplash.com/photo-1651375562199-65caae096ace?auto=format&fit=crop&w=600&q=70",
  목포: "https://images.unsplash.com/photo-1748077228194-e7d5b947287a?auto=format&fit=crop&w=600&q=70",
  광주송정: "https://images.unsplash.com/photo-1593419522318-81b7c346a3e8?auto=format&fit=crop&w=600&q=70",
  포항: "https://images.unsplash.com/photo-1552230479-b7e43d576a7a?auto=format&fit=crop&w=600&q=70",
  마산: "https://images.unsplash.com/photo-1676642223305-20f374b1731f?auto=format&fit=crop&w=600&q=70",
  순천: "https://images.unsplash.com/photo-1584802530491-65fad8b1b92c?auto=format&fit=crop&w=600&q=70",
  전주: "https://images.unsplash.com/photo-1653230676634-eab0cd6c56b1?auto=format&fit=crop&w=600&q=70",
  경주: "https://images.unsplash.com/photo-1717346486980-1944518800fb?auto=format&fit=crop&w=600&q=70",
  안동: "https://images.unsplash.com/photo-1525546137051-73a7b7ba139c?auto=format&fit=crop&w=600&q=70",
  // Aliases for bus-city names that differ from KTX station names.
  대구: "https://images.unsplash.com/photo-1663670889635-0aabebf112ba?auto=format&fit=crop&w=600&q=70",
  광주: "https://images.unsplash.com/photo-1593419522318-81b7c346a3e8?auto=format&fit=crop&w=600&q=70",
  여수: "https://images.unsplash.com/photo-1651375562199-65caae096ace?auto=format&fit=crop&w=600&q=70",
};

// Popular intercity-bus routes by busCity id. [departureId, arrivalId, approx fare KRW]
// Intentionally different origin/destination pairs from the KTX popular routes
// above (which all depart 서울/용산) so the bus list reads as its own set.
const POPULAR_BUS_ROUTES: [string, string, number][] = [
  ["busan", "gyeongju", 5300],
  ["daegu", "gangneung", 28000],
  ["gwangju", "yeosu", 12700],
  ["daejeon", "jeonju", 9600],
  ["incheon", "busan", 28900],
  ["ulsan", "mokpo", 24500],
  ["cheongju", "pohang", 21000],
  ["changwon", "masan", 1800],
  ["daegu", "andong", 11000],
  ["suwon", "suncheon", 25800],
  ["daejeon", "gwangju", 13200],
  ["cheonan", "daegu", 16700],
];

// Imagery for the "train travel information" cards.
const INFO_IMAGES = {
  journeyPlanner:
    "https://images.unsplash.com/photo-1646146301702-a08f77fd75ce?auto=format&fit=crop&w=800&q=70",
  railPass:
    "https://images.unsplash.com/photo-1603270504031-4344a08b28b6?auto=format&fit=crop&w=800&q=70",
  ktxTimes:
    "https://images.unsplash.com/photo-1655309185688-893c7bb57eaf?auto=format&fit=crop&w=800&q=70",
  ktxClasses:
    "https://images.unsplash.com/photo-1669303375352-a71d05fa5342?auto=format&fit=crop&w=800&q=70",
  busExpress:
    "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=70",
  busIntercity:
    "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?auto=format&fit=crop&w=800&q=70",
  busTerminal:
    "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=70",
} as const;

type RouteProduct = {
  mode: "train" | "bus";
  id: string;
  from: Station;
  to: Station;
  price: number;
  img: string;
};

type T = (k: string, p?: Record<string, string | number>) => string;

function fmtDateLabel(v: DateHour | null): string {
  if (!v) return "";
  const [y, m, d] = v.date.split("-");
  return `${y}.${m}.${d}`;
}

function passengersLabel(p: Passengers, t: T): string {
  const parts: string[] = [];
  if (p.adults) parts.push(`${t("pax.adult")} ${p.adults}`);
  if (p.children) parts.push(`${t("pax.child")} ${p.children}`);
  if (p.toddlers) parts.push(`${t("pax.toddler")} ${p.toddlers}`);
  if (p.seniors) parts.push(`${t("pax.senior")} ${p.seniors}`);
  return parts.length ? parts.join(" · ") : t("pax.adultDefault");
}

function totalPassengers(p: Passengers): number {
  return p.adults + p.children + p.toddlers + p.seniors;
}

export default function HomePage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [groups, setGroups] = useState<CityGroup[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const outDateRef = useRef<HTMLButtonElement>(null);
  const inDateRef = useRef<HTMLButtonElement>(null);
  const paxRef = useRef<HTMLButtonElement>(null);

  // Booking window: D+2 ~ D+30 (Korail-style advance booking range).
  const { minBookDate, maxBookDate } = (() => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const min = new Date();
    min.setDate(min.getDate() + 2);
    const max = new Date();
    max.setDate(max.getDate() + 30);
    return { minBookDate: fmt(min), maxBookDate: fmt(max) };
  })();

  const [transport, setTransport] = useState<"train" | "bus" | "ferry">("train");
  const [tripType, setTripType] = useState<TripType>("oneway");
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [outbound, setOutbound] = useState<DateHour | null>(null);
  const [inbound, setInbound] = useState<DateHour | null>(null);
  const [passengers, setPassengers] = useState<Passengers>({
    adults: 1,
    children: 0,
    toddlers: 0,
    seniors: 0,
  });

  const [busFrom, setBusFrom] = useState<BusCity | null>(null);
  const [busTo, setBusTo] = useState<BusCity | null>(null);
  const [busPicker, setBusPicker] = useState<"dep" | "arr" | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"dep" | "arr" | null>(null);
  const [datePicker, setDatePicker] = useState<"outbound" | "inbound" | null>(null);
  const [passengerSheet, setPassengerSheet] = useState(false);

  // Popular-routes section: transport chip + center toast.
  // (The search animation itself lives on the destination /search and /bus
  // pages — we navigate straight there to avoid showing it twice.)
  const [routeFilter, setRouteFilter] = useState<"all" | "train" | "bus">("all");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    fetch("/api/stations", { cache: "force-cache" })
      .then((r) => r.json())
      .then((j: StationsResponse) => {
        if (j.ok) setGroups(j.cities);
      })
      .catch(() => {
        /* silent */
      });
  }, []);

  // Prefill departure date with the earliest bookable day (today + 2).
  // Done in an effect (not initial state) so the client clock is used and
  // there's no SSR/hydration hour mismatch.
  useEffect(() => {
    setOutbound((prev) => prev ?? { date: minBookDate, hour: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function swap() {
    if (transport === "bus") {
      setBusFrom(busTo);
      setBusTo(busFrom);
    } else {
      setFrom(to);
      setTo(from);
    }
  }

  // Resolve popular routes to actual station objects present in the data.
  const popular = useMemo(() => {
    if (!groups) return [];
    const byName = new Map<string, Station>();
    for (const g of groups) for (const s of g.stations) byName.set(s.name, s);
    return POPULAR_ROUTES.map(([a, b, price]) => {
      const f = byName.get(a);
      const tt = byName.get(b);
      return f && tt ? { from: f, to: tt, price } : null;
    }).filter(
      (r): r is { from: Station; to: Station; price: number } => !!r,
    );
  }, [groups]);

  // Train popular routes as unified product cards.
  const trainProducts = useMemo<RouteProduct[]>(
    () =>
      popular.map((r) => ({
        mode: "train" as const,
        id: `train-${r.from.id}-${r.to.id}`,
        from: r.from,
        to: r.to,
        price: r.price,
        img: ROUTE_IMAGES[r.to.name] ?? HERO_IMAGE,
      })),
    [popular],
  );

  // Bus popular routes — static, resolved from busCity ids.
  const busProducts = useMemo<RouteProduct[]>(
    () =>
      POPULAR_BUS_ROUTES.map(([a, b, price]): RouteProduct | null => {
        const f = busCityById(a);
        const tt = busCityById(b);
        if (!f || !tt) return null;
        return {
          mode: "bus",
          id: `bus-${f.id}-${tt.id}`,
          from: { id: f.id, name: f.name },
          to: { id: tt.id, name: tt.name },
          price,
          img: ROUTE_IMAGES[tt.name] ?? HERO_IMAGE,
        };
      }).filter((p): p is RouteProduct => p !== null),
    [],
  );

  const allProducts = useMemo(
    () => [...trainProducts, ...busProducts],
    [trainProducts, busProducts],
  );

  // "전체" shows a random 12. Shuffled client-side (in an effect) to avoid an
  // SSR/hydration mismatch from Math.random during render.
  const [allShuffled, setAllShuffled] = useState<RouteProduct[]>([]);
  useEffect(() => {
    const arr = [...allProducts];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setAllShuffled(arr.slice(0, 12));
  }, [allProducts]);

  const displayedProducts =
    routeFilter === "train"
      ? trainProducts.slice(0, 12)
      : routeFilter === "bus"
        ? busProducts.slice(0, 12)
        : allShuffled.length
          ? allShuffled
          : allProducts.slice(0, 12);

  // One-tap search for a popular route (one-way, using current date/passengers).
  function goPopular(f: Station, tt: Station) {
    const o = outbound ?? { date: minBookDate, hour: new Date().getHours() };
    pushRecent(f);
    pushRecent(tt);
    pushRecentRoute({ from: f, to: tt });
    const params = new URLSearchParams({
      from: f.id,
      fromName: f.name,
      to: tt.id,
      toName: tt.name,
      date: o.date.replace(/-/g, ""),
      hour: String(o.hour),
      passengers: String(totalPassengers(passengers)),
      adults: String(passengers.adults),
      children: String(passengers.children),
      toddlers: String(passengers.toddlers),
      seniors: String(passengers.seniors),
      tripType: "oneway",
    });
    router.push(`/search?${params.toString()}`);
  }

  // Bus product card → intercity bus search (/bus). The /bus page shows the
  // search animation itself while it loads.
  function goBusProduct(fromId: string, toId: string) {
    const f = busCityById(fromId);
    const tt = busCityById(toId);
    if (!f || !tt) return;
    const o = outbound ?? { date: minBookDate, hour: 0 };
    pushRecentBusRoute({
      from: { id: f.id, name: f.name },
      to: { id: tt.id, name: tt.name },
    });
    const params = new URLSearchParams({
      from: f.id,
      to: tt.id,
      date: o.date.replace(/-/g, ""),
    });
    router.push(`/bus?${params.toString()}`);
  }

  const isValid =
    transport === "bus"
      ? !!busFrom && !!busTo && busFrom.id !== busTo.id && !!outbound
      : !!from &&
        !!to &&
        from.id !== to.id &&
        !!outbound &&
        (tripType === "oneway" || !!inbound) &&
        totalPassengers(passengers) >= 1;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Intercity bus flow → /bus
    if (transport === "bus") {
      if (!busFrom || !busTo) {
        setError(t("bus.err.noCities"));
        return;
      }
      if (busFrom.id === busTo.id) {
        setError(t("bus.err.sameCity"));
        return;
      }
      if (!outbound) {
        setError(t("home.err.noDep"));
        return;
      }
      setError(null);
      pushRecentBusRoute({
        from: { id: busFrom.id, name: busFrom.name },
        to: { id: busTo.id, name: busTo.name },
      });
      const params = new URLSearchParams({
        from: busFrom.id,
        to: busTo.id,
        date: outbound.date.replace(/-/g, ""),
      });
      router.push(`/bus?${params.toString()}`);
      return;
    }

    if (!from || !to) {
      setError(t("home.err.noStations"));
      return;
    }
    if (from.id === to.id) {
      setError(t("home.err.sameStation"));
      return;
    }
    if (!outbound) {
      setError(t("home.err.noDep"));
      return;
    }
    if (tripType === "roundtrip" && !inbound) {
      setError(t("home.err.noRet"));
      return;
    }
    if (tripType === "roundtrip" && inbound && inbound.date < outbound.date) {
      setError(t("home.err.retBeforeDep"));
      return;
    }
    if (totalPassengers(passengers) < 1) {
      setError(t("home.err.noPax"));
      return;
    }
    setError(null);
    pushRecent(from);
    pushRecent(to);
    pushRecentRoute({ from, to });
    const params = new URLSearchParams({
      from: from.id,
      fromName: from.name,
      to: to.id,
      toName: to.name,
      date: outbound.date.replace(/-/g, ""),
      hour: String(outbound.hour),
      passengers: String(totalPassengers(passengers)),
      adults: String(passengers.adults),
      children: String(passengers.children),
      toddlers: String(passengers.toddlers),
      seniors: String(passengers.seniors),
      tripType,
    });
    if (tripType === "roundtrip" && inbound) {
      params.set("returnDate", inbound.date.replace(/-/g, ""));
      params.set("returnHour", String(inbound.hour));
    }
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div>
      {/* ───────────────────────────── Hero */}
      <section className="relative isolate overflow-hidden bg-tile">
        {/* Full-bleed photographic background */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/45"
        />

        <div className="relative mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12 pt-12 lg:pt-16 pb-24 lg:pb-32">
          <h1 className="max-w-2xl text-white text-[28px] leading-tight sm:text-4xl lg:text-[44px] font-extrabold tracking-tight mb-7 lg:mb-9">
            {t("home.heroTitle")}
          </h1>

          {/* Transport tabs (Train / Bus / Ferry) — file-tab style sitting on the card */}
          <div className="flex">
            {[
              { key: "train" as const, label: t("nav.trains") },
              { key: "bus" as const, label: t("nav.bus") },
              { key: "ferry" as const, label: t("nav.ferry") },
            ].map((tp) => {
              const active = transport === tp.key;
              return (
                <button
                  key={tp.key}
                  type="button"
                  onClick={() => setTransport(tp.key)}
                  className={`relative rounded-t-2xl px-7 py-3.5 text-[15px] transition-colors ${
                    active
                      ? "bg-white font-bold text-ink"
                      : "bg-parchment font-semibold text-ink-faint hover:bg-pearl hover:text-ink-soft"
                  }`}
                >
                  {tp.label}
                  {active && (
                    <span className="absolute inset-x-6 bottom-2 h-[3px] rounded-full bg-action" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Floating search card */}
          <form
            ref={formRef}
            onSubmit={onSubmit}
            className="overflow-hidden rounded-[22px] rounded-tl-none bg-white shadow-2xl ring-1 ring-black/5"
          >
            {transport === "ferry" && (
              <div className="px-5 py-3 text-sm text-ink-soft bg-parchment">
                {t("home.modeSoon")}
              </div>
            )}

            {/* Trip type tabs (train only) */}
            {transport === "train" && (
              <div className="flex items-center gap-2 px-3 sm:px-4 pt-3">
                {[
                  { v: "oneway", label: t("home.oneway") },
                  { v: "roundtrip", label: t("home.roundtrip") },
                ].map((o) => {
                  const active = tripType === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setTripType(o.v as TripType)}
                      className={`rounded-pill px-4 py-1.5 text-sm font-semibold transition-transform active:scale-95 ${
                        active
                          ? "bg-action text-white"
                          : "bg-parchment text-ink-soft hover:bg-pearl"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}

            {transport === "train" && <div className="mt-1 h-px bg-divider" />}

            {/* Main horizontal row (stacks on mobile) */}
            <div className="flex flex-col lg:flex-row lg:items-stretch divide-y lg:divide-y-0 lg:divide-x divide-divider">
              {/* Stations group — 모바일: 세로 1열(출발 위, 도착 아래) + 사이 구분선 / lg: 가로 */}
              <div className="relative flex flex-col lg:flex-row flex-[2] min-w-0 divide-y lg:divide-y-0 divide-divider">
                <Field
                  label={transport === "bus" ? t("bus.depCity") : t("home.depStation")}
                  filled={transport === "bus" ? !!busFrom : !!from}
                  disabled={transport === "ferry"}
                  onClick={
                    transport === "bus"
                      ? () => setBusPicker("dep")
                      : () => setPicker("dep")
                  }
                  className="pr-12"
                >
                  {transport === "bus"
                    ? busFrom
                      ? busCityLabel(busFrom, lang)
                      : t("bus.depCityPh")
                    : from
                      ? stationLabel(from.name, lang)
                      : t("home.depPlaceholder")}
                </Field>

                <button
                  type="button"
                  onClick={swap}
                  disabled={transport === "ferry"}
                  aria-label={t("home.swap")}
                  className="absolute z-10 top-1/2 right-4 -translate-y-1/2 lg:right-auto lg:left-1/2 lg:-translate-x-1/2 grid h-10 w-10 place-items-center rounded-full border border-hairline bg-white text-action transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 lg:rotate-0">
                    <path d="M3 8h18" />
                    <path d="M17 4l4 4-4 4" />
                    <path d="M21 16H3" />
                    <path d="M7 12l-4 4 4 4" />
                  </svg>
                </button>

                <Field
                  label={transport === "bus" ? t("bus.arrCity") : t("home.arrStation")}
                  filled={transport === "bus" ? !!busTo : !!to}
                  disabled={transport === "ferry"}
                  onClick={
                    transport === "bus"
                      ? () => setBusPicker("arr")
                      : () => setPicker("arr")
                  }
                  className="pr-12 lg:pr-5 lg:pl-12"
                >
                  {transport === "bus"
                    ? busTo
                      ? busCityLabel(busTo, lang)
                      : t("bus.arrCityPh")
                    : to
                      ? stationLabel(to.name, lang)
                      : t("home.arrPlaceholder")}
                </Field>
              </div>

              {/* Dates group */}
              <div
                className={`flex min-w-0 ${
                  tripType === "roundtrip" ? "flex-[2]" : "flex-1"
                }`}
              >
                <Field
                  ref={outDateRef}
                  label={t("home.depDate")}
                  filled={!!outbound}
                  disabled={transport === "ferry"}
                  onClick={() => setDatePicker("outbound")}
                >
                  {outbound ? fmtDateLabel(outbound) : t("home.pickDate")}
                </Field>

                {transport === "train" && tripType === "roundtrip" && (
                  <Field
                    ref={inDateRef}
                    label={t("home.retDate")}
                    filled={!!inbound}
                    onClick={() => setDatePicker("inbound")}
                  >
                    {inbound ? fmtDateLabel(inbound) : t("home.pickDate")}
                  </Field>
                )}
              </div>

              {/* Passengers (train only) */}
              {transport === "train" && (
                <button
                  ref={paxRef}
                  type="button"
                  onClick={() => setPassengerSheet(true)}
                  aria-label={passengersLabel(passengers, t)}
                  className="text-left px-4 sm:px-5 py-3.5 transition hover:bg-parchment active:scale-[0.99] lg:flex-[0.7] lg:min-w-0"
                >
                  <div className="text-[12px] text-ink-faint mb-0.5">{t("home.pax")}</div>
                  <div className="truncate text-[19px] font-semibold text-ink leading-tight">
                    {passengersLabel(passengers, t)}
                  </div>
                </button>
              )}

              {/* Submit */}
              <div className="flex items-center p-3">
                <button
                  type="submit"
                  disabled={!isValid || transport === "ferry"}
                  className="btn-action h-12 w-full lg:w-auto px-6 text-[16px]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  {t("home.search")}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-5 pb-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* White rounded reveal — content surface rises over the hero */}
        <div className="relative -mb-px h-10 lg:h-12 rounded-t-[2.25rem] bg-white" />
      </section>

      {/* Popular routes */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 pt-6 lg:pt-8 pb-16 lg:pb-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
          {t("home.popularTitle")}
        </h2>

        {/* Transport filter chips */}
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { key: "all" as const, label: t("home.filterAll") },
            { key: "train" as const, label: t("nav.trains") },
            { key: "bus" as const, label: t("nav.bus") },
            { key: "ferry" as const, label: t("nav.ferry") },
          ].map((c) => {
            const active = c.key !== "ferry" && routeFilter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  if (c.key === "ferry") {
                    showToast(t("home.ferrySoon"));
                    return;
                  }
                  setRouteFilter(c.key);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-ink text-white"
                    : "bg-parchment text-ink-soft hover:bg-chip/40"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayedProducts.map((p) => {
            const fromLabel =
              p.mode === "bus"
                ? busCityLabelByName(p.from.name, lang)
                : stationLabel(p.from.name, lang);
            const toLabel =
              p.mode === "bus"
                ? busCityLabelByName(p.to.name, lang)
                : stationLabel(p.to.name, lang);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  p.mode === "bus"
                    ? goBusProduct(p.from.id, p.to.id)
                    : goPopular(p.from, p.to)
                }
                className="group overflow-hidden rounded-xl border border-hairline bg-white text-left transition hover:border-action active:scale-[0.99]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-parchment">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.img}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Transport badge (text only) */}
                  <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                    {p.mode === "bus" ? t("nav.bus") : t("nav.trains")}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
                    <span className="truncate">{fromLabel}</span>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-action"
                      aria-hidden
                    >
                      <path d="M5 12h14" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                    <span className="truncate">{toLabel}</span>
                  </div>
                  <div className="mt-1 text-[15px] font-semibold text-action">
                    {t("home.fromPrice", { p: p.price.toLocaleString() })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Train travel information — 모바일 가로 스크롤 / sm+ 그리드 */}
      <section className="pb-16 lg:pb-24">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            {t("home.infoTitle")}
          </h2>
          <div className="mt-8 flex gap-4 overflow-x-auto -mx-4 px-4 pb-2 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible lg:grid-cols-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            {
              img: INFO_IMAGES.journeyPlanner,
              title: t("home.info1.title"),
              desc: t("home.info1.desc"),
            },
            {
              img: INFO_IMAGES.ktxTimes,
              title: t("home.info3.title"),
              desc: t("home.info3.desc"),
            },
            {
              img: INFO_IMAGES.ktxClasses,
              title: t("home.info4.title"),
              desc: t("home.info4.desc"),
            },
            {
              img: INFO_IMAGES.busExpress,
              title: t("home.infoBus1.title"),
              desc: t("home.infoBus1.desc"),
            },
            {
              img: INFO_IMAGES.busIntercity,
              title: t("home.infoBus2.title"),
              desc: t("home.infoBus2.desc"),
            },
            {
              img: INFO_IMAGES.busTerminal,
              title: t("home.infoBus3.title"),
              desc: t("home.infoBus3.desc"),
            },
          ].map((c) => (
            <article
              key={c.title}
              className="group relative h-[420px] w-[80%] shrink-0 overflow-hidden rounded-card bg-tile sm:w-auto sm:shrink"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.img}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
              <div className="relative flex h-full flex-col justify-end p-6">
                <h3 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">
                  {c.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/85">
                  {c.desc}
                </p>
              </div>
            </article>
          ))}
          </div>
        </div>
      </section>

      {/* Why GroundK */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 pb-16 lg:pb-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
          {t("home.whyTitle")}
        </h2>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              title: t("home.why1.title"),
              desc: t("home.why1.desc"),
              icon: (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </>
              ),
            },
            {
              title: t("home.why2.title"),
              desc: t("home.why2.desc"),
              icon: (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18" />
                  <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
                </>
              ),
            },
            {
              title: t("home.why3.title"),
              desc: t("home.why3.desc"),
              icon: (
                <>
                  <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10z" />
                  <circle cx="7.5" cy="7.5" r="1.2" />
                </>
              ),
            },
          ].map((f) => (
            <div key={f.title} className="card-apple p-6">
              <div className="w-11 h-11 rounded-full bg-action/10 text-action grid place-items-center mb-4">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {f.icon}
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Site footer — mirrors /prototype/index.html (RIDEUS) */}
      <footer className="bg-[#1B2027] pt-16 pb-7 text-white/70">
        <div className="mx-auto grid max-w-[1216px] grid-cols-2 gap-x-6 gap-y-7 px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-12">
          {/* Brand */}
          <div>
            <div className="mb-3.5 text-2xl font-extrabold tracking-[0.04em] text-white">
              RIDEUS
            </div>
            <p className="whitespace-pre-line text-[13px] leading-[1.7] text-[#A3A5A8]">
              {t("footer.rdBrandDesc")}
            </p>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-3.5 text-sm font-semibold text-white">
              {t("footer.colCompany")}
            </h3>
            <ul className="grid gap-2">
              {[t("footer.brandStory"), t("footer.careers"), t("footer.press")].map(
                (label) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm">
                    <a
                      href="#"
                      className="text-[#A3A5A8] transition-colors hover:text-white"
                    >
                      {label}
                    </a>
                    <span className="text-[11px] text-white/35">
                      {t("footer.soon")}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="mb-3.5 text-sm font-semibold text-white">
              {t("footer.colSupport")}
            </h3>
            <ul className="grid gap-2">
              <li className="flex items-center gap-2.5 text-sm">
                <a
                  href="#"
                  className="text-[#A3A5A8] transition-colors hover:text-white"
                >
                  {t("footer.helpCenter")}
                </a>
              </li>
              {[t("footer.terms"), t("footer.privacy")].map((label) => (
                <li key={label} className="flex items-center gap-2.5 text-sm">
                  <a
                    href="#"
                    className="text-[#A3A5A8] transition-colors hover:text-white"
                  >
                    {label}
                  </a>
                  <span className="text-[11px] text-white/35">
                    {t("footer.soon")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Partnership */}
          <div>
            <h3 className="mb-3.5 text-sm font-semibold text-white">
              {t("footer.colPartnership")}
            </h3>
            <ul className="grid gap-2">
              <li className="flex items-center gap-2.5 text-sm">
                <a
                  href="#"
                  className="text-[#A3A5A8] transition-colors hover:text-white"
                >
                  {t("footer.becomePartner")}
                </a>
                <a href="#" className="font-semibold text-[#2C51DB]">
                  {t("footer.apply")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-9 max-w-[1216px] px-6">
          <div className="h-px bg-white/30" />
        </div>

        <div className="mx-auto mt-[22px] flex max-w-[1216px] justify-between px-6 text-[11px] text-white/40">
          <span>{t("footer.copyright")}</span>
          <span className="text-white">{t("footer.location")}</span>
        </div>
      </footer>

      <StationPicker
        open={picker !== null}
        groups={groups}
        anchorRef={formRef}
        onClose={() => setPicker(null)}
        onPick={(s) => {
          if (picker === "dep") setFrom(s);
          else if (picker === "arr") setTo(s);
          pushRecent(s);
          setPicker(null);
        }}
        onPickRoute={(f, tt) => {
          setFrom(f);
          setTo(tt);
          pushRecent(f);
          pushRecent(tt);
          setPicker(null);
        }}
      />

      <BusCityPicker
        open={busPicker !== null}
        anchorRef={formRef}
        onClose={() => setBusPicker(null)}
        onPick={(c) => {
          if (busPicker === "dep") setBusFrom(c);
          else if (busPicker === "arr") setBusTo(c);
          setBusPicker(null);
        }}
        onPickRoute={(f, tt) => {
          setBusFrom(f);
          setBusTo(tt);
          setBusPicker(null);
        }}
      />

      <DatePickerSheet
        open={datePicker === "outbound"}
        title={t("dp.titleDep")}
        value={outbound}
        anchorRef={outDateRef}
        minDate={minBookDate}
        maxDate={maxBookDate}
        onClose={() => setDatePicker(null)}
        onPick={(v) => {
          setOutbound(v);
          if (inbound && inbound.date < v.date) setInbound(null);
          setDatePicker(null);
        }}
      />

      <DatePickerSheet
        open={datePicker === "inbound"}
        title={t("dp.titleRet")}
        value={inbound}
        anchorRef={inDateRef}
        minDate={
          outbound?.date && outbound.date > minBookDate ? outbound.date : minBookDate
        }
        maxDate={maxBookDate}
        onClose={() => setDatePicker(null)}
        onPick={(v) => {
          setInbound(v);
          setDatePicker(null);
        }}
      />

      <PassengersSheet
        open={passengerSheet}
        value={passengers}
        anchorRef={paxRef}
        onClose={() => setPassengerSheet(false)}
        onPick={(v) => {
          setPassengers(v);
          setPassengerSheet(false);
        }}
      />

      {/* Center toast (e.g. Ferry coming soon) */}
      {toast && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
          <div className="rounded-2xl bg-ink/90 px-6 py-4 text-center text-[15px] font-semibold text-white shadow-xl backdrop-blur-sm">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/** A single cell in the horizontal search bar: small label over a large value. */
function Field({
  label,
  filled,
  onClick,
  className = "",
  disabled = false,
  children,
  ref,
}: {
  label: string;
  filled: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 min-w-0 text-left px-4 sm:px-5 py-3.5 transition ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-parchment active:scale-[0.99]"
      } ${className}`}
    >
      <div className="text-[12px] text-ink-faint mb-0.5">{label}</div>
      <div
        className={`truncate text-[19px] font-semibold leading-tight ${
          filled ? "text-ink" : "text-ink-faint"
        }`}
      >
        {children}
      </div>
    </button>
  );
}

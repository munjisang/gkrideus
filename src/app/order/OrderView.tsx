"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { COUNTRY_CODES } from "../../lib/countries";
import { fmtTime, durationMinutes } from "../../lib/format";
import { newOrderId, saveOrder } from "../../lib/storage";
import { TrainLogo } from "../../components/TrainLogo";
import { useI18n, stationLabel, type Lang } from "../../lib/i18n";
import type {
  Order,
  Passenger,
  SeatType,
  TrainSchedule,
  TripType,
} from "../../lib/types";

const FIRST_CLASS_MULT = 1.4;

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

function decodeTrain(p: string | null): TrainSchedule | null {
  if (!p) return null;
  try {
    return JSON.parse(decodeURIComponent(p)) as TrainSchedule;
  } catch {
    return null;
  }
}

function emptyPassenger(): Passenger {
  return { name: "", email: "", countryCode: "+82", phone: "" };
}

type PayMethod = "card" | "paypal" | "intlcard" | "toss" | "kakao" | "naver";
const PAY_METHODS: { id: PayMethod; ko: string; en: string }[] = [
  { id: "card", ko: "신용카드", en: "Credit card" },
  { id: "paypal", ko: "Paypal", en: "Paypal" },
  { id: "intlcard", ko: "해외카드", en: "Intl. card" },
  { id: "toss", ko: "토스", en: "Toss" },
  { id: "kakao", ko: "카카오", en: "KakaoPay" },
  { id: "naver", ko: "네이버", en: "NaverPay" },
];

const AGREEMENTS = [
  { id: "fare", tkey: "ord.agree.fare" },
  { id: "tos", tkey: "ord.agree.tos" },
  { id: "privacy", tkey: "ord.agree.privacy" },
] as const;
type AgreementId = (typeof AGREEMENTS)[number]["id"];

export default function OrderView() {
  const router = useRouter();
  const sp = useSearchParams();
  const { t, lang } = useI18n();

  const tripType = (sp.get("tripType") ?? "oneway") as TripType;
  const passengerCount = Math.max(1, Number(sp.get("passengers") ?? "1"));
  // Breakdown carried in URL params from the home page.
  const paxAdults = Math.max(0, Number(sp.get("adults") ?? "0"));
  const paxChildren = Math.max(0, Number(sp.get("children") ?? "0"));
  const paxToddlers = Math.max(0, Number(sp.get("toddlers") ?? "0"));
  const paxSeniors = Math.max(0, Number(sp.get("seniors") ?? "0"));
  // Fallback when no breakdown is provided: treat all as adults.
  const paxRows: { label: string; count: number }[] = (() => {
    const rows: { label: string; count: number }[] = [];
    const sum = paxAdults + paxChildren + paxToddlers + paxSeniors;
    if (sum === 0) {
      rows.push({ label: t("pax.adult"), count: passengerCount });
    } else {
      if (paxAdults) rows.push({ label: t("pax.adult"), count: paxAdults });
      if (paxChildren) rows.push({ label: t("pax.child"), count: paxChildren });
      if (paxToddlers) rows.push({ label: t("pax.toddler"), count: paxToddlers });
      if (paxSeniors) rows.push({ label: t("pax.senior"), count: paxSeniors });
    }
    return rows;
  })();
  const outbound = useMemo(() => decodeTrain(sp.get("outbound")), [sp]);
  const inbound = useMemo(() => decodeTrain(sp.get("inbound")), [sp]);

  const initialSeat = (sp.get("seatType") === "first" ? "first" : "standard") as SeatType;
  const [outboundSeat, setOutboundSeat] = useState<SeatType>(initialSeat);
  const [inboundSeat, setInboundSeat] = useState<SeatType>(initialSeat);
  const [reservant, setReservant] = useState<Passenger>(emptyPassenger);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [agreed, setAgreed] = useState<Record<AgreementId, boolean>>({
    fare: false,
    tos: false,
    privacy: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const legPrice = (tr: TrainSchedule | null, seat: SeatType) =>
    tr ? Math.round((tr.adultCharge * (seat === "first" ? FIRST_CLASS_MULT : 1)) / 100) * 100 : 0;

  const outboundPrice = legPrice(outbound, outboundSeat);
  const inboundPrice = legPrice(inbound, inboundSeat);
  const perPersonPrice = outboundPrice + inboundPrice;
  const totalPrice = perPersonPrice * passengerCount;

  // Per-person breakdown lines: 성인1, 성인2, 어린이1 …
  const breakdownRows: { label: string; price: number }[] = (() => {
    const rows: { label: string; price: number }[] = [];
    for (const r of paxRows) {
      for (let i = 1; i <= r.count; i++) {
        rows.push({ label: `${r.label}${i}`, price: perPersonPrice });
      }
    }
    return rows;
  })();

  const allAgreed = AGREEMENTS.every((a) => agreed[a.id]);

  // Single source of truth for both submit-button enabled state and submit validation.
  const canSubmit =
    !!outbound &&
    (tripType === "oneway" || !!inbound) &&
    !!reservant.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservant.email) &&
    /^[0-9\-\s]{6,15}$/.test(reservant.phone) &&
    payMethod !== null &&
    allAgreed;

  function validate(): string | null {
    if (!outbound) return t("ord.err.legOut");
    if (tripType === "roundtrip" && !inbound) return t("ord.err.legIn");
    if (!reservant.name.trim()) return t("ord.err.name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservant.email))
      return t("ord.err.email");
    if (!/^[0-9\-\s]{6,15}$/.test(reservant.phone)) return t("ord.err.phone");
    if (!payMethod) return t("ord.err.pay");
    if (!allAgreed) return t("ord.err.agree");
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    const order: Order = {
      id: newOrderId(),
      createdAt: new Date().toISOString(),
      tripType,
      outbound: outbound!,
      inbound: tripType === "roundtrip" ? inbound ?? undefined : undefined,
      seatType: outboundSeat,
      inboundSeatType: tripType === "roundtrip" ? inboundSeat : undefined,
      passengerCount,
      paxBreakdown: {
        adults: paxAdults || (paxChildren + paxToddlers + paxSeniors === 0 ? passengerCount : 0),
        children: paxChildren,
        toddlers: paxToddlers,
        seniors: paxSeniors,
      },
      passengers: [reservant],
      totalPrice,
    };
    saveOrder(order)
      .then(() => router.push(`/order/complete?id=${encodeURIComponent(order.id)}`))
      .catch((e: Error) => {
        setSubmitting(false);
        setError(t("ord.err.saveFail", { m: e.message }));
      });
  }

  if (!outbound) {
    return (
      <div>
        <SubHeader title={t("ord.title")} />
        <div className="mx-4 sm:mx-6 lg:mx-[470px] py-6">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {t("ord.noTrain")}
          </div>
          <Link href="/" className="inline-block mt-4 text-sky-700 text-sm">
            ← {t("ord.toHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SubHeader title={t("ord.title")} />
      <div className="mx-4 sm:mx-6 lg:mx-[470px] py-6 pb-32">
        <form id="order-form" onSubmit={onSubmit} className="space-y-2">
        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.selectedTrain")}</h2>
          <LegSummary label={t("ord.legOut")} t={outbound} lang={lang} />
          <SeatPicker
            value={outboundSeat}
            onChange={setOutboundSeat}
            standardPrice={legPrice(outbound, "standard")}
            firstPrice={legPrice(outbound, "first")}
            tt={t}
            lang={lang}
          />
          {tripType === "roundtrip" && inbound && (
            <>
              <div className="my-4 border-t border-dashed border-slate-200" />
              <LegSummary label={t("ord.legIn")} t={inbound} lang={lang} />
              <SeatPicker
                value={inboundSeat}
                onChange={setInboundSeat}
                standardPrice={legPrice(inbound, "standard")}
                firstPrice={legPrice(inbound, "first")}
                tt={t}
                lang={lang}
              />
            </>
          )}
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.paxInfo")}</h2>
          <ul className="divide-y divide-slate-100">
            {paxRows.map((r) => (
              <li
                key={r.label}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="text-slate-600">{r.label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {t("pax.count", { n: r.count })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.payInfo")}</h2>
          <ul className="divide-y divide-slate-100">
            {breakdownRows.map((r, i) => (
              <li
                key={`${r.label}-${i}`}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="text-slate-600">{r.label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {krwL(r.price, lang)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between py-3 mt-1">
              <span className="text-sm font-semibold text-slate-800">{t("ord.total")}</span>
              <span className="text-base font-bold text-sky-700 tabular-nums">
                {krwL(totalPrice, lang)}
              </span>
            </li>
          </ul>
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.booker")}</h2>
          <div className="space-y-3">
            <Field label={t("ord.name")}>
              <input
                value={reservant.name}
                onChange={(e) => setReservant((p) => ({ ...p, name: e.target.value }))}
                placeholder="홍길동"
                className={INPUT}
                required
              />
            </Field>
            <Field label={t("ord.email")}>
              <input
                type="email"
                value={reservant.email}
                onChange={(e) => setReservant((p) => ({ ...p, email: e.target.value }))}
                placeholder="example@mail.com"
                className={INPUT}
                required
              />
            </Field>
            <Field label={t("ord.phone")}>
              <div className="flex gap-2">
                <select
                  value={reservant.countryCode}
                  onChange={(e) =>
                    setReservant((p) => ({ ...p, countryCode: e.target.value }))
                  }
                  className="h-11 px-2 rounded-lg border border-slate-200 bg-white text-sm w-24 shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <input
                  value={reservant.phone}
                  onChange={(e) => setReservant((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="010-1234-5678"
                  className={INPUT}
                  required
                />
              </div>
            </Field>
          </div>
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.payMethod")}</h2>
          <div className="grid grid-cols-3 gap-2">
            {PAY_METHODS.map((m) => {
              const active = payMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPayMethod(m.id)}
                  className={`h-11 rounded-sm border text-sm font-medium transition ${
                    active
                      ? "border-sky-600 bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {lang === "ko" ? m.ko : m.en}
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-sm font-semibold text-slate-800">{t("ord.agreeAll")}</span>
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAgreed({ fare: next, tos: next, privacy: next });
                }}
                className="w-5 h-5 accent-sky-600"
              />
            </label>
            {AGREEMENTS.map((a) => (
              <label
                key={a.id}
                className="flex items-center justify-between cursor-pointer py-1"
              >
                <span className="text-sm text-slate-600">{t(a.tkey)}</span>
                <input
                  type="checkbox"
                  checked={agreed[a.id]}
                  onChange={(e) =>
                    setAgreed((cur) => ({ ...cur, [a.id]: e.target.checked }))
                  }
                  className="w-5 h-5 accent-sky-600"
                />
              </label>
            ))}
          </div>
        </section>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        </form>
      </div>

      {/* Sticky bottom payment bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200">
        <div className="mx-4 sm:mx-6 lg:mx-[470px] py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">{t("ord.totalAmount")}</div>
            <div className="text-lg font-bold text-sky-700 tabular-nums">
              {krwL(totalPrice, lang)}
            </div>
          </div>
          <button
            type="submit"
            form="order-form"
            disabled={!canSubmit || submitting}
            className={`h-12 px-8 rounded-xl font-semibold transition ${
              canSubmit && !submitting
                ? "bg-sky-600 hover:bg-sky-700 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {submitting ? t("ord.paying") : t("ord.pay")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
      <div className="mx-4 sm:mx-6 lg:mx-[470px] flex items-center py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("back")}
          className="h-10 w-10 grid place-items-center text-slate-800 -ml-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-slate-900">
          {title}
        </h1>
        <Link
          href="/"
          aria-label={t("home")}
          className="h-10 w-10 grid place-items-center text-slate-800 -mr-1"
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

function SeatPicker({
  value,
  onChange,
  standardPrice,
  firstPrice,
  tt,
  lang,
}: {
  value: SeatType;
  onChange: (v: SeatType) => void;
  standardPrice: number;
  firstPrice: number;
  tt: (k: string) => string;
  lang: Lang;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 mt-3">
      <SeatChip
        active={value === "standard"}
        onClick={() => onChange("standard")}
        title={tt("sr.standard")}
        price={standardPrice}
        perPerson={tt("ord.perPerson")}
        lang={lang}
      />
      <SeatChip
        active={value === "first"}
        onClick={() => onChange("first")}
        title={tt("sr.first")}
        price={firstPrice}
        perPerson={tt("ord.perPerson")}
        lang={lang}
      />
    </div>
  );
}

function SeatChip({
  active,
  onClick,
  title,
  price,
  perPerson,
  lang,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  price: number;
  perPerson: string;
  lang: Lang;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between px-3 h-12 rounded-sm border text-sm transition ${
        active
          ? "border-sky-600 bg-sky-50 ring-1 ring-sky-200"
          : "border-slate-200 bg-white hover:border-slate-400"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className={`w-4 h-4 shrink-0 rounded-full border-2 grid place-items-center ${
            active ? "border-sky-600" : "border-slate-300"
          }`}
        >
          {active && <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />}
        </span>
        <span
          className={`font-semibold whitespace-nowrap ${
            active ? "text-sky-700" : "text-slate-700"
          }`}
        >
          {title}
        </span>
      </span>
      <span className="text-xs font-semibold tabular-nums text-slate-700 whitespace-nowrap shrink-0">
        {krwL(price, lang)}
        <span className="ml-1 font-normal text-slate-400">{perPerson}</span>
      </span>
    </button>
  );
}

function LegSummary({
  label,
  t: train,
  lang,
}: {
  label: string;
  t: TrainSchedule;
  lang: Lang;
}) {
  const min = durationMinutes(train.depPlandTime, train.arrPlandTime);
  // YYYYMMDD → YYYY.MM.DD (spec uses dots, not dashes).
  const yyyymmdd = train.depPlandTime.slice(0, 8);
  const dateLabel = `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
  return (
    <div>
      {/* Row 1: [leg badge] logo train-no ········ date */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded px-2 py-0.5 leading-tight">
            {label}
          </span>
          <TrainLogo name={train.trainGradeName} />
          <span className="text-sm font-semibold text-slate-500">
            {Number(train.trainNo) || train.trainNo}
          </span>
        </div>
        <span className="text-sm text-slate-500 shrink-0 tabular-nums">
          {dateLabel}
        </span>
      </div>

      {/* Row 2: dep_time + dep_station ─── duration ─── arr_time + arr_station */}
      <div className="flex items-center gap-3 pt-4">
        <div className="flex flex-col items-start min-w-0">
          <span className="text-base font-bold tabular-nums leading-none whitespace-nowrap text-slate-900">
            {fmtTime(train.depPlandTime)}
          </span>
          <span className="text-sm mt-1 whitespace-nowrap text-slate-600">
            {stationLabel(train.depPlaceName, lang)}
          </span>
        </div>
        <span className="h-px flex-1 bg-slate-200 self-start mt-2.5" aria-hidden />
        <span className="text-xs whitespace-nowrap self-start mt-1 text-slate-400">
          {durationL(min, lang)}
        </span>
        <span className="h-px flex-1 bg-slate-200 self-start mt-2.5" aria-hidden />
        <div className="flex flex-col items-end min-w-0">
          <span className="text-base font-bold tabular-nums leading-none whitespace-nowrap text-slate-900">
            {fmtTime(train.arrPlandTime)}
          </span>
          <span className="text-sm mt-1 whitespace-nowrap text-slate-600">
            {stationLabel(train.arrPlaceName, lang)}
          </span>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "h-11 px-3 rounded-lg border border-slate-200 bg-white w-full focus:outline-none focus:ring-2 focus:ring-sky-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

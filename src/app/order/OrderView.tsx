"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { countryLabel } from "../../lib/countries";
import CountryPicker from "../../components/CountryPicker";
import LegSummary from "../../components/LegSummary";
import PaymentLoading from "../../components/PaymentLoading";
import { newOrderId, saveOrder } from "../../lib/storage";
import { durationL, krwL } from "../../lib/format-i18n";
import { legFares, summarizeFares, type PaxType } from "../../lib/fareCalc";
import { useI18n, type Lang } from "../../lib/i18n";
import type {
  Order,
  Passenger,
  Reservation,
  SeatPref,
  SeatType,
  TrainSchedule,
  TripType,
} from "../../lib/types";

/** Response envelope returned by /api/booking/reserve and /api/booking/cancel. */
type BookingResult = {
  ok: boolean;
  stage?: string;
  error?: string;
  mode?: "live" | "dry";
  train?: Record<string, unknown>;
  reservation?: Record<string, unknown>;
};

async function callReserve(payload: object): Promise<BookingResult> {
  try {
    const res = await fetch("/api/booking/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as BookingResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message, stage: "network" };
  }
}

async function callCancel(rsvId: string): Promise<BookingResult> {
  try {
    const res = await fetch("/api/booking/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvId }),
    });
    return (await res.json()) as BookingResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message, stage: "network" };
  }
}

/** Convert /api/booking/reserve's response into the order's Reservation
 *  shape. Returns null for unparseable / error responses. */
function buildReservation(j: BookingResult): Reservation | null {
  if (!j.ok) return null;
  if (j.mode === "live" && j.reservation) {
    const r = j.reservation as Record<string, unknown>;
    return {
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
  }
  if (j.mode === "dry") {
    return {
      rsvId: "(dry-run)",
      reservedAt: new Date().toISOString(),
      mode: "dry",
      raw: j.train,
    };
  }
  return null;
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
  // countryCode stores the ISO-3166 alpha-2 code (e.g. "KR"). Empty
  // string forces the user to pick one — the submit button stays
  // disabled until they do.
  return { name: "", email: "", countryCode: "", phone: "" };
}

type PayMethod = "card" | "paypal";
const PAY_METHODS: { id: PayMethod; ko: string; en: string }[] = [
  { id: "card", ko: "신용카드", en: "Credit card" },
  { id: "paypal", ko: "Paypal", en: "Paypal" },
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
  const [seatPref, setSeatPref] = useState<SeatPref>("none");
  const [reservant, setReservant] = useState<Passenger>(emptyPassenger);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [agreed, setAgreed] = useState<Record<AgreementId, boolean>>({
    fare: false,
    tos: false,
    privacy: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fare summary respects per-passenger-type discounts (어른 100% /
   // 어린이 50% / 유아 0% / 경로 70%). `rows` is one block per seat,
   // ordered: adults → children → toddlers → seniors.
  const fareSummary = summarizeFares(
    outbound,
    outboundSeat,
    tripType === "roundtrip" ? inbound ?? null : null,
    inboundSeat,
    passengerCount,
    {
      adults:
        paxAdults || (paxChildren + paxToddlers + paxSeniors === 0
          ? passengerCount
          : 0),
      children: paxChildren,
      toddlers: paxToddlers,
      seniors: paxSeniors,
    },
  );
  const totalPrice = fareSummary.total;

  // Label per passenger ("성인 1", "어린이 1" …) aligned with fareSummary.rows.
  const PAX_TYPE_KEY: Record<PaxType, string> = {
    adult: "pax.adult",
    child: "pax.child",
    toddler: "pax.toddler",
    senior: "pax.senior",
  };
  const breakdownRows = (() => {
    const counters: Record<PaxType, number> = {
      adult: 0,
      child: 0,
      toddler: 0,
      senior: 0,
    };
    return fareSummary.rows.map((r) => {
      counters[r.type] += 1;
      return { label: `${t(PAX_TYPE_KEY[r.type])}${counters[r.type]}`, fare: r };
    });
  })();

  const allAgreed = AGREEMENTS.every((a) => agreed[a.id]);

  // Single source of truth for both submit-button enabled state and submit validation.
  const canSubmit =
    !!outbound &&
    (tripType === "oneway" || !!inbound) &&
    !!reservant.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservant.email) &&
    !!reservant.countryCode &&
    payMethod !== null &&
    allAgreed;

  function validate(): string | null {
    if (!outbound) return t("ord.err.legOut");
    if (tripType === "roundtrip" && !inbound) return t("ord.err.legIn");
    if (!reservant.name.trim()) return t("ord.err.name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservant.email))
      return t("ord.err.email");
    if (!reservant.countryCode) return t("ord.err.country");
    if (!payMethod) return t("ord.err.pay");
    if (!allAgreed) return t("ord.err.agree");
    return null;
  }

  /** Build the POST body the reserve endpoint expects for a single leg. */
  function legPayload(tr: TrainSchedule, seat: SeatType) {
    return {
      depName: tr.depPlaceName,
      arrName: tr.arrPlaceName,
      date: tr.depPlandTime.slice(0, 8),
      time: tr.depPlandTime.slice(8, 12),
      trainNo: tr.trainNo,
      passengers: passengerCount,
      paxBreakdown: {
        adults:
          paxAdults || (paxChildren + paxToddlers + paxSeniors === 0
            ? passengerCount
            : 0),
        children: paxChildren,
        toddlers: paxToddlers,
        seniors: paxSeniors,
      },
      seatType: seat,
      live: true,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);

    // ── 1. Reserve outbound leg
    const outRes = await callReserve(legPayload(outbound!, outboundSeat));
    if (!outRes.ok) {
      setError(t("ord.err.reserveOut", { m: outRes.error ?? outRes.stage ?? "" }));
      setSubmitting(false);
      return;
    }
    const outRsv = buildReservation(outRes);
    if (!outRsv) {
      setError(t("ord.err.reserveParse"));
      setSubmitting(false);
      return;
    }

    // ── 2. Reserve inbound leg (roundtrip only) with auto-rollback on failure
    let inRsv: Reservation | undefined;
    if (tripType === "roundtrip" && inbound) {
      const inRes = await callReserve(legPayload(inbound, inboundSeat));
      if (!inRes.ok) {
        let suffix = "";
        if (outRsv.mode === "live" && outRsv.rsvId) {
          const rb = await callCancel(outRsv.rsvId);
          suffix = rb.ok
            ? "\n" + t("ord.err.rollbackOk", { id: outRsv.rsvId })
            : "\n" +
              t("ord.err.rollbackFail", {
                id: outRsv.rsvId,
                m: rb.error ?? rb.stage ?? "",
              });
        }
        setError(
          t("ord.err.reserveIn", { m: inRes.error ?? inRes.stage ?? "" }) +
            suffix,
        );
        setSubmitting(false);
        return;
      }
      const parsed = buildReservation(inRes);
      if (!parsed) {
        setError(t("ord.err.reserveParse"));
        setSubmitting(false);
        return;
      }
      inRsv = parsed;
    }

    // ── 3. Save order with reservation(s) attached, then redirect
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
        adults:
          paxAdults || (paxChildren + paxToddlers + paxSeniors === 0
            ? passengerCount
            : 0),
        children: paxChildren,
        toddlers: paxToddlers,
        seniors: paxSeniors,
      },
      passengers: [reservant],
      seatPref,
      totalPrice,
      reservation: outRsv,
      inboundReservation: inRsv,
    };
    try {
      await saveOrder(order);
      router.push(`/order/complete?id=${encodeURIComponent(order.id)}`);
    } catch (err) {
      setError(t("ord.err.saveFail", { m: (err as Error).message }));
      setSubmitting(false);
    }
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
          <LegSummary label={t("ord.legOut")} train={outbound} lang={lang} />
          <SeatPicker
            value={outboundSeat}
            onChange={setOutboundSeat}
            standardPrice={legFares(outbound, "standard").discounted}
            firstPrice={legFares(outbound, "first").discounted}
            tt={t}
            lang={lang}
          />
          {tripType === "roundtrip" && inbound && (
            <>
              <div className="my-4 border-t border-dashed border-slate-200" />
              <LegSummary label={t("ord.legIn")} train={inbound} lang={lang} />
              <SeatPicker
                value={inboundSeat}
                onChange={setInboundSeat}
                standardPrice={legFares(inbound, "standard").discounted}
                firstPrice={legFares(inbound, "first").discounted}
                tt={t}
                lang={lang}
              />
            </>
          )}
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.seatPref")}</h2>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "none", tkey: "ord.seatPref.none" },
                { id: "window", tkey: "ord.seatPref.window" },
                { id: "aisle", tkey: "ord.seatPref.aisle" },
              ] as const
            ).map((opt) => {
              const active = seatPref === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSeatPref(opt.id)}
                  className={`h-11 rounded-sm border text-sm font-medium transition ${
                    active
                      ? "border-sky-600 bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {t(opt.tkey)}
                </button>
              );
            })}
          </div>
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
          <div className="divide-y divide-slate-100">
            {breakdownRows.map((r, i) => (
              <PaxFareBlock
                key={`${r.label}-${i}`}
                label={r.label}
                regular={r.fare.regular}
                discount={r.fare.discount}
                netPay={r.fare.netPay}
                fee={r.fare.fee}
                legTotal={r.fare.legTotal}
                lang={lang}
                tt={t}
              />
            ))}
            <div className="flex items-center justify-between py-3 mt-1">
              <span className="text-sm font-semibold text-slate-800">{t("ord.total")}</span>
              <span className="text-base font-bold text-sky-700 tabular-nums">
                {krwL(totalPrice, lang)}
              </span>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.booker")}</h2>
          <div className="space-y-3">
            <Field label={t("ord.name")}>
              <input
                value={reservant.name}
                onChange={(e) => setReservant((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("ord.namePh")}
                className={INPUT}
                required
              />
            </Field>
            <Field label={t("ord.email")}>
              <input
                type="email"
                value={reservant.email}
                onChange={(e) => setReservant((p) => ({ ...p, email: e.target.value }))}
                placeholder={t("ord.emailPh")}
                className={INPUT}
                required
              />
            </Field>
            <Field label={t("ord.country")}>
              <button
                type="button"
                onClick={() => setCountrySheetOpen(true)}
                className={`${INPUT} flex items-center justify-between text-left`}
              >
                <span
                  className={
                    reservant.countryCode ? "text-slate-900" : "text-slate-400"
                  }
                >
                  {reservant.countryCode
                    ? countryLabel(reservant.countryCode, lang)
                    : t("ord.countryPh")}
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
            </Field>
          </div>
        </section>

        <section className="bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3 text-slate-800">{t("ord.payMethod")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {PAY_METHODS.map((m) => {
              const active = payMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPayMethod(m.id)}
                  className={`h-11 px-3 rounded-sm border text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
                    active
                      ? "border-sky-600 bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <PayMethodIcon id={m.id} />
                  <span>{lang === "ko" ? m.ko : m.en}</span>
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

      <CountryPicker
        open={countrySheetOpen}
        value={reservant.countryCode}
        onClose={() => setCountrySheetOpen(false)}
        onPick={(iso) => {
          setReservant((p) => ({ ...p, countryCode: iso }));
          setCountrySheetOpen(false);
        }}
      />

      {/* Fullscreen Lottie overlay while [결제하기] is in flight. It stays
          mounted through the reserve → save → redirect chain and disappears
          when the navigation to /order/complete unmounts this view. */}
      {submitting && <PaymentLoading />}
    </div>
  );
}

/** Brand icon shown left of the payment-method button label. */
function PayMethodIcon({ id }: { id: "card" | "paypal" }) {
  if (id === "card") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="2" y="5" width="20" height="14" rx="2.5" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    );
  }
  // PayPal — simplified two-leaf monogram in their brand blue.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8.5 19l1.2-7.5h2.6c2.3 0 3.9-1.1 4.3-3.3.4-2.1-.8-3.7-3.4-3.7H8.9c-.4 0-.7.3-.8.7L6.4 17.7c0 .3.2.5.4.5h1.3c.2 0 .3-.1.4-.3z"
        fill="#003087"
      />
      <path
        d="M11 21l1.2-7.5h2.6c2.3 0 3.9-1.1 4.3-3.3.4-2.1-.8-3.7-3.4-3.7h-4.3c-.4 0-.7.3-.8.7L8.9 19.7c0 .3.2.5.4.5h1.3c.2 0 .3-.1.4-.3z"
        fill="#009CDE"
      />
    </svg>
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


/** Per-passenger payment breakdown — 4 lines + a label header.
 *  Matches the spec: 정상운임 / 할인 / 발권수수료(20%) / 총 운임. */
function PaxFareBlock({
  label,
  regular,
  discount,
  netPay,
  fee,
  legTotal,
  lang,
  tt,
}: {
  label: string;
  regular: number;
  discount: number;
  /** 정상운임 − 할인. Shown as a standalone subtotal. */
  netPay: number;
  fee: number;
  legTotal: number;
  lang: Lang;
  tt: (k: string) => string;
}) {
  const Row = ({
    name,
    value,
    bold,
  }: {
    name: string;
    value: string;
    bold?: boolean;
  }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-600">{name}</span>
      <span
        className={`tabular-nums ${
          bold ? "font-bold text-slate-900" : "font-semibold text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
  return (
    <div className="py-3 first:pt-0">
      <div className="text-sm font-semibold text-slate-900 mb-1">{label}</div>
      <Row name={tt("ord.fare.regular")} value={krwL(regular, lang)} />
      <Row
        name={tt("ord.fare.discount")}
        // Negative sign to make it obvious the amount is being deducted.
        value={discount > 0 ? `-${krwL(discount, lang)}` : krwL(0, lang)}
      />
      <Row name={tt("ord.fare.netPay")} value={krwL(netPay, lang)} />
      <Row name={tt("ord.fare.fee")} value={krwL(fee, lang)} />
      <Row name={tt("ord.fare.legTotal")} value={krwL(legTotal, lang)} bold />
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

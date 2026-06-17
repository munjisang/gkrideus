"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { countryLabel } from "../../../lib/countries";
import CountryPicker from "../../../components/CountryPicker";
import PaymentLoading from "../../../components/PaymentLoading";
import BusSeatMap from "../../../components/BusSeatMap";
import BottomSheet from "../../../components/BottomSheet";
import { newOrderId, saveOrder } from "../../../lib/storage";
import { useI18n, type Lang } from "../../../lib/i18n";
import { busCityById, busCityLabel, busGradeLabel } from "../../../lib/busCities";
import type { Order, Passenger, TrainSchedule } from "../../../lib/types";

function krwL(n: number, lang: Lang): string {
  return lang === "ko"
    ? `${n.toLocaleString("ko-KR")}원`
    : `₩${n.toLocaleString("en-US")}`;
}

type PayMethod = "card" | "paypal";
const PAY_METHODS: { id: PayMethod; ko: string; en: string }[] = [
  { id: "card", ko: "신용카드", en: "Credit card" },
  { id: "paypal", ko: "Paypal", en: "Paypal" },
];

/** Generate a pseudo bus reservation number (display-only; no live API). */
function newBusRsvId(): string {
  return `B${Date.now().toString().slice(-10)}`;
}

export default function BusOrderView() {
  const router = useRouter();
  const sp = useSearchParams();
  const { t, lang } = useI18n();

  // ── Bus run carried in via query params ──────────────────────────────
  const express = sp.get("mode") === "express";
  const routeId = sp.get("routeId") ?? "";
  const departTime = sp.get("departTime") ?? ""; // HH:MM
  const operator = sp.get("operator") ?? "";
  const grade = sp.get("grade") ?? "";
  const fare = Math.max(0, Number(sp.get("fare") ?? "0"));
  const date = sp.get("date") ?? ""; // YYYYMMDD
  const fromId = sp.get("from") ?? "";
  const toId = sp.get("to") ?? "";
  const departName = sp.get("departName") ?? "";
  const arriveName = sp.get("arriveName") ?? "";

  const valid = !!routeId && !!departTime && !!date && fare > 0;

  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [seats, setSeats] = useState<number[]>([]);
  const [seatModalOpen, setSeatModalOpen] = useState(false);
  const [reservant, setReservant] = useState<Passenger>({
    name: "",
    email: "",
    countryCode: "",
    phone: "",
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passengerCount = adults + children;
  // Korean intercity/express buses charge children ~50% (rounded to ₩100).
  const childFare = Math.round((fare * 0.5) / 100) * 100;
  const totalPrice = adults * fare + children * childFare;

  // Trim seat selection if the passenger count drops below it.
  useEffect(() => {
    setSeats((cur) => (cur.length > passengerCount ? cur.slice(0, passengerCount) : cur));
  }, [passengerCount]);

  const dateLabel = useMemo(() => {
    if (date.length < 8) return date;
    return `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`;
  }, [date]);

  const fromLabel = busCityLabel(busCityById(fromId), lang) || departName;
  const toLabel = busCityLabel(busCityById(toId), lang) || arriveName;
  const gradeLabel = busGradeLabel(grade, lang);

  const canSubmit =
    valid &&
    passengerCount >= 1 &&
    seats.length === passengerCount &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservant.email) &&
    !!reservant.countryCode &&
    payMethod !== null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return setError(t("ord.noTrain"));
    if (passengerCount < 1) return setError(t("home.err.noPax"));
    if (seats.length !== passengerCount)
      return setError(t("bus.seatHint", { n: passengerCount }));
    if (!firstName.trim() || !lastName.trim()) return setError(t("ord.err.name"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservant.email))
      return setError(t("ord.err.email"));
    if (!reservant.countryCode) return setError(t("ord.err.country"));
    if (!payMethod) return setError(t("ord.err.pay"));
    setError(null);
    setSubmitting(true);

    // Synthesize a TrainSchedule-shaped leg so the bus order rides the
    // existing Order/storage/bookings pipeline unchanged.
    const hhmm = departTime.replace(":", "").padEnd(4, "0").slice(0, 4);
    const depPlandTime = `${date}${hhmm}`;
    const leg: TrainSchedule = {
      trainNo: routeId,
      trainGradeCode: "BUS",
      trainGradeName: express ? "고속버스" : "시외버스",
      depPlaceId: fromId,
      depPlaceName: departName,
      arrPlaceId: toId,
      arrPlaceName: arriveName,
      depPlandTime,
      arrPlandTime: depPlandTime, // bus search has no arrival time
      adultCharge: fare,
    };

    const seatLabel = seats.map((s) => `${s}`).join(", ");
    const order: Order = {
      id: newOrderId(),
      createdAt: new Date().toISOString(),
      tripType: "oneway",
      outbound: leg,
      seatType: "standard",
      passengerCount,
      paxBreakdown: { adults, children, toddlers: 0, seniors: 0 },
      passengers: [
        {
          ...reservant,
          name:
            lang === "ko"
              ? `${lastName}${firstName}`
              : `${firstName} ${lastName}`.trim(),
        },
      ],
      payMethod,
      totalPrice,
      reservation: {
        rsvId: newBusRsvId(),
        reservedAt: new Date().toISOString(),
        totalPrice,
        seatLabel,
        seats: seats.map((s) => ({ carNo: "", seatNo: String(s) })),
        mode: "dry",
      },
    };

    try {
      await saveOrder(order);
      void fetch("/api/notify/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
        keepalive: true,
      }).catch(() => {
        /* best-effort */
      });
      router.push(`/order/complete?id=${encodeURIComponent(order.id)}`);
    } catch (err) {
      setError(t("ord.err.saveFail", { m: (err as Error).message }));
      setSubmitting(false);
    }
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-white">
        <SubHeader title={t("ord.title")} />
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 py-6">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {t("ord.noTrain")}
          </div>
          <Link href="/" className="link-action inline-block mt-4 text-sm">
            ← {t("ord.toHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <SubHeader title={t("ord.title")} />
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 py-6 pb-10">
        <form
          onSubmit={onSubmit}
          className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start"
        >
          {/* ── Left column */}
          <div className="space-y-3">
            {/* Selected bus */}
            <section className="card-apple p-5">
              <h2 className="font-semibold tracking-tight mb-3 text-ink">
                {t("bus.selected")}
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                    express
                      ? "bg-action/10 text-action"
                      : "bg-parchment text-ink-soft"
                  }`}
                >
                  {express ? t("bus.express") : t("bus.intercity")}
                </span>
                <span className="text-2xl font-bold tabular-nums text-ink">
                  {departTime}
                </span>
                <span className="text-sm tabular-nums text-ink-faint ml-auto">
                  {dateLabel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {grade && (
                  <span className="rounded-pill bg-parchment px-2 py-0.5 text-xs font-semibold text-ink-soft">
                    {gradeLabel}
                  </span>
                )}
                <span className="text-sm text-ink-soft">{operator}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <span>{fromLabel}</span>
                <span className="text-ink-faint">→</span>
                <span>{toLabel}</span>
              </div>
            </section>

            {/* Passenger count: adult + child */}
            <section className="card-apple p-5">
              <h2 className="font-semibold tracking-tight mb-1 text-ink">
                {t("ord.paxInfo")}
              </h2>
              <div className="divide-y divide-divider">
                <PaxRow
                  label={t("pax.adult")}
                  value={adults}
                  onMinus={() => setAdults((v) => Math.max(1, v - 1))}
                  onPlus={() => setAdults((v) => Math.min(9, v + 1))}
                  minusDisabled={adults <= 1}
                  plusDisabled={passengerCount >= 9}
                />
                <PaxRow
                  label={t("pax.child")}
                  value={children}
                  onMinus={() => setChildren((v) => Math.max(0, v - 1))}
                  onPlus={() => setChildren((v) => Math.min(8, v + 1))}
                  minusDisabled={children <= 0}
                  plusDisabled={passengerCount >= 9}
                />
              </div>
            </section>

            {/* Booker */}
            <section className="card-apple p-5">
              <h2 className="font-semibold tracking-tight mb-3 text-ink">
                {t("ord.booker")}
              </h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("ord.lastName")}>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t("ord.lastNamePh")}
                      className={INPUT}
                      required
                    />
                  </Field>
                  <Field label={t("ord.firstName")}>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t("ord.firstNamePh")}
                      className={INPUT}
                      required
                    />
                  </Field>
                </div>
                <Field label={t("ord.email")}>
                  <input
                    type="email"
                    value={reservant.email}
                    onChange={(e) =>
                      setReservant((p) => ({ ...p, email: e.target.value }))
                    }
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
                        reservant.countryCode ? "text-ink" : "text-ink-faint"
                      }
                    >
                      {reservant.countryCode
                        ? countryLabel(reservant.countryCode, lang)
                        : t("ord.countryPh")}
                    </span>
                    <svg className="text-ink-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                </Field>
              </div>
            </section>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-line">
                {error}
              </div>
            )}
          </div>

          {/* ── Right column: payment summary */}
          <aside className="mt-3 lg:mt-0 lg:sticky lg:top-[88px]">
            <section className="card-apple p-5">
              <h2 className="font-semibold tracking-tight mb-3 text-ink">
                {t("ord.payInfo")}
              </h2>
              <div className="divide-y divide-divider">
                <div className="flex items-center justify-between py-3 text-sm">
                  <span className="text-ink-soft">
                    {t("pax.adult")} × {adults}
                  </span>
                  <span className="font-semibold text-ink tabular-nums">
                    {krwL(adults * fare, lang)}
                  </span>
                </div>
                {children > 0 && (
                  <div className="flex items-center justify-between py-3 text-sm">
                    <span className="text-ink-soft">
                      {t("pax.child")} × {children}
                    </span>
                    <span className="font-semibold text-ink tabular-nums">
                      {krwL(children * childFare, lang)}
                    </span>
                  </div>
                )}
                {/* Seat selection */}
                <div className="py-3">
                  <button
                    type="button"
                    onClick={() => setSeatModalOpen(true)}
                    className="w-full flex items-center justify-between gap-2 h-11 px-3.5 rounded-lg border border-hairline bg-white text-sm font-semibold text-ink-soft hover:border-action active:scale-[0.99] transition"
                  >
                    <span className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-action" aria-hidden>
                        <path d="M5 11V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
                        <path d="M5 11h11a2 2 0 0 1 2 2v4H5z" />
                        <path d="M5 17v3M18 17v3" />
                      </svg>
                      {t("bus.seatSelect")}
                    </span>
                    <span className="tabular-nums text-action">
                      {seats.length > 0 ? seats.join(", ") : `0/${passengerCount}`}
                    </span>
                  </button>
                </div>
                {/* Payment method */}
                <div className="py-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">
                    {t("ord.payMethod")}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {PAY_METHODS.map((m) => {
                      const active = payMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPayMethod(m.id)}
                          className={`h-11 px-3 rounded-lg border text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
                            active
                              ? "border-2 border-action text-action bg-white"
                              : "border border-hairline bg-white text-ink-soft hover:border-ink-faint"
                          }`}
                        >
                          {lang === "ko" ? m.ko : m.en}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between py-3 mt-1">
                  <span className="text-sm font-semibold text-ink">
                    {t("ord.total")}
                  </span>
                  <span className="text-base font-semibold text-ink tabular-nums">
                    {krwL(totalPrice, lang)}
                  </span>
                </div>
              </div>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className={`btn-action mt-4 h-12 w-full ${
                  canSubmit && !submitting
                    ? ""
                    : "!bg-hairline !text-ink-faint cursor-not-allowed active:scale-100"
                }`}
              >
                {submitting ? t("ord.paying") : t("ord.pay")}
              </button>
            </section>
          </aside>
        </form>
      </div>

      {/* Seat selection modal */}
      <BottomSheet
        open={seatModalOpen}
        onClose={() => setSeatModalOpen(false)}
        title={t("bus.seatSelect")}
        maxHeight="90vh"
        footer={
          <button
            type="button"
            onClick={() => setSeatModalOpen(false)}
            disabled={seats.length !== passengerCount}
            className={`btn-action h-12 w-full ${
              seats.length === passengerCount
                ? ""
                : "!bg-hairline !text-ink-faint cursor-not-allowed active:scale-100"
            }`}
          >
            {t("common.select")}
          </button>
        }
      >
        <div className="px-4 pt-1 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-ink-faint">
              {t("bus.seatHint", { n: passengerCount })}
            </p>
            <span className="text-xs font-semibold tabular-nums text-action">
              {seats.length}/{passengerCount}
            </span>
          </div>
          <BusSeatMap
            grade={grade}
            maxSelect={passengerCount}
            selected={seats}
            onChange={setSeats}
            seed={`${routeId}-${date}`}
          />
        </div>
      </BottomSheet>

      <CountryPicker
        open={countrySheetOpen}
        value={reservant.countryCode}
        onClose={() => setCountrySheetOpen(false)}
        onPick={(iso) => {
          setReservant((p) => ({ ...p, countryCode: iso }));
          setCountrySheetOpen(false);
        }}
      />

      {submitting && <PaymentLoading />}
    </div>
  );
}

function PaxRow({
  label,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-3 border border-hairline rounded-xl px-2 py-1.5">
        <button
          type="button"
          onClick={onMinus}
          disabled={minusDisabled}
          aria-label={`${label} 감소`}
          className="w-8 h-8 grid place-items-center text-action disabled:text-ink-faint/50 active:scale-95 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <span className="min-w-[24px] text-center text-base font-semibold tabular-nums text-ink">
          {value}
        </span>
        <button
          type="button"
          onClick={onPlus}
          disabled={plusDisabled}
          aria-label={`${label} 증가`}
          className="w-8 h-8 grid place-items-center text-action disabled:text-ink-faint/50 active:scale-95 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  );
}

function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl backdrop-saturate-150 border-b border-hairline">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 flex items-center py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("back")}
          className="h-10 w-10 grid place-items-center text-ink -ml-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="flex-1 text-center text-base font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <Link href="/" aria-label={t("home")} className="h-10 w-10 grid place-items-center text-ink -mr-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 9v12h14V9" /><path d="M10 21v-7h4v7" /></svg>
        </Link>
      </div>
    </div>
  );
}

const INPUT =
  "h-11 px-3 rounded-xl border border-hairline bg-white w-full placeholder:text-ink-faint focus:border-action focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft mb-1 block">{label}</span>
      {children}
    </label>
  );
}

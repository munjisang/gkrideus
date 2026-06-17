"use client";

import { useEffect, useMemo } from "react";
import BookingCard from "../../components/bookings/BookingCard";
import { countryLabel } from "../../lib/countries";
import { summarizeFares } from "../../lib/fareCalc";
import { krwL } from "../../lib/format-i18n";
import { useI18n } from "../../lib/i18n";
import { DEFAULT_FEE_SETTINGS } from "../../lib/types";
import type { Order, PayMethod, SeatPref } from "../../lib/types";

type Flags = {
  busy: boolean;
  hasLiveReservation: boolean;
  hasUnconfirmedLeg: boolean;
  isExpired: boolean;
  failureMessage?: string;
};

type Props = {
  order: Order | null;
  flags: Flags;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

const SEAT_PREF_KEY: Record<SeatPref, string> = {
  none: "ord.seatPref.none",
  window: "ord.seatPref.window",
  aisle: "ord.seatPref.aisle",
};
const PAY_METHOD_KEY: Record<PayMethod, string> = {
  card: "bk.payMethod.card",
  paypal: "bk.payMethod.paypal",
};

export default function AdminBookingModal({
  order,
  flags,
  onClose,
  onConfirm,
  onCancel,
  onDelete,
}: Props) {
  const { t, lang } = useI18n();

  // Lock background scroll + ESC to close while the modal is mounted.
  useEffect(() => {
    if (!order) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [order, onClose]);

  // Recompute totals using the snapshotted fee settings on the order
  // (falls back to defaults for orders made before that field existed).
  const feeSettings = order?.feeSettings ?? DEFAULT_FEE_SETTINGS;
  const fareSummary = useMemo(() => {
    if (!order) return null;
    return summarizeFares(
      order.outbound,
      order.seatType,
      order.tripType === "roundtrip" ? order.inbound ?? null : null,
      order.inboundSeatType ?? order.seatType,
      order.passengerCount,
      order.paxBreakdown ?? null,
      feeSettings,
    );
  }, [order, feeSettings]);

  if (!order) return null;
  const booker = order.passengers[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-card shadow-xl flex flex-col max-h-[90vh] rounded-t-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-divider">
          <div>
            <div className="text-[11px] text-ink-faint font-mono break-all">{order.id}</div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{t("bk.detail.title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 grid place-items-center text-ink-soft hover:text-ink -mr-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-parchment p-4 space-y-3">
          {flags.failureMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2 break-words whitespace-pre-line">
              {flags.failureMessage}
            </div>
          )}

          {/* Itinerary card — reuse the inert variant of BookingCard. */}
          <BookingCard order={order} lang={lang} t={t} onClick={null} />

          {/* 인원 + 선호좌석 */}
          <section className="card-apple p-4">
            <h3 className="text-sm font-semibold text-ink mb-2">{t("ord.paxInfo")}</h3>
            <ul className="divide-y divide-divider">
              {paxRowsFor(order, t).map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-ink-soft">{r.label}</span>
                  <span className="font-semibold text-ink tabular-nums">
                    {t("pax.count", { n: r.count })}
                  </span>
                </li>
              ))}
              {order.seatPref && (
                <li className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-soft">{t("ord.seatPref")}</span>
                  <span className="font-semibold text-ink">
                    {t(SEAT_PREF_KEY[order.seatPref])}
                  </span>
                </li>
              )}
            </ul>
          </section>

          {/* 예약자 */}
          {booker && (
            <section className="card-apple p-4">
              <h3 className="text-sm font-semibold text-ink mb-2">{t("ord.booker")}</h3>
              <ul className="divide-y divide-divider">
                <Kv label={t("ord.name")} value={booker.name} />
                <Kv label={t("ord.email")} value={booker.email} />
                {booker.countryCode && (
                  <Kv
                    label={t("ord.country")}
                    value={countryLabel(booker.countryCode, lang)}
                  />
                )}
              </ul>
            </section>
          )}

          {/* 결제 요약 */}
          {fareSummary && (
            <section className="card-apple p-4">
              <h3 className="text-sm font-semibold text-ink mb-2">{t("ord.payInfo")}</h3>
              <div className="space-y-1.5 text-sm">
                {order.payMethod && (
                  <KvLine
                    label={t("bk.pay.method")}
                    value={t(PAY_METHOD_KEY[order.payMethod])}
                  />
                )}
                <KvLine
                  label={t("ord.fare.regular")}
                  value={krwL(
                    fareSummary.rows.reduce((s, r) => s + r.regular, 0),
                    lang,
                  )}
                />
                <KvLine
                  label={t("ord.fare.discount")}
                  value={(() => {
                    const d = fareSummary.rows.reduce(
                      (s, r) => s + r.discount,
                      0,
                    );
                    return d > 0 ? `-${krwL(d, lang)}` : krwL(0, lang);
                  })()}
                />
                <KvLine
                  label={t("ord.fare.netPay")}
                  value={krwL(
                    fareSummary.rows.reduce((s, r) => s + r.netPay, 0),
                    lang,
                  )}
                />
                <KvLine
                  label={t("ord.fare.fee", {
                    p: `${Math.round(feeSettings.bookingFeeRate * 100)}%`,
                  })}
                  value={krwL(
                    fareSummary.rows.reduce((s, r) => s + r.fee, 0),
                    lang,
                  )}
                />
                <div className="pt-2 mt-1 border-t border-divider flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">
                    {t("ord.total")}
                  </span>
                  <span className="text-base font-bold text-action tabular-nums">
                    {krwL(fareSummary.total, lang)}
                  </span>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Admin actions footer */}
        <div className="border-t border-hairline px-3 py-3 flex flex-wrap gap-2 justify-end bg-white">
          {flags.hasUnconfirmedLeg && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={flags.busy}
              className="btn-action h-10 text-sm"
            >
              확정
            </button>
          )}
          {flags.hasLiveReservation && (
            <button
              type="button"
              onClick={onCancel}
              disabled={flags.busy}
              className="h-10 px-[22px] rounded-pill text-sm font-semibold bg-red-600 text-white active:scale-95 transition-transform disabled:opacity-50"
            >
              {flags.busy ? "처리중…" : "예매 취소"}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={flags.busy}
            className="h-10 px-3 rounded-pill text-sm text-ink-faint hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost h-10 text-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── small key/value helpers (mirrors detail page) */

function paxRowsFor(
  order: Order,
  t: (k: string, p?: Record<string, string | number>) => string,
): { label: string; count: number }[] {
  const b = order.paxBreakdown;
  const rows: { label: string; count: number }[] = [];
  if (!b) {
    rows.push({ label: t("pax.adult"), count: order.passengerCount });
    return rows;
  }
  if (b.adults) rows.push({ label: t("pax.adult"), count: b.adults });
  if (b.children) rows.push({ label: t("pax.child"), count: b.children });
  if (b.toddlers) rows.push({ label: t("pax.toddler"), count: b.toddlers });
  if (b.seniors) rows.push({ label: t("pax.senior"), count: b.seniors });
  if (rows.length === 0)
    rows.push({ label: t("pax.adult"), count: order.passengerCount });
  return rows;
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between py-2 text-sm gap-3">
      <span className="text-ink-soft shrink-0">{label}</span>
      <span className="font-semibold text-ink break-all text-right">{value}</span>
    </li>
  );
}

function KvLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </div>
  );
}

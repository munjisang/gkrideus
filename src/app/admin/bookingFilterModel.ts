/**
 * Filter model + pure filtering logic for the admin 예매내역 tab.
 * Kept framework-free (no React, no "use client") so it can be unit-reasoned
 * about and imported anywhere.
 */
import type { Order, Reservation } from "../../lib/types";

/** Which date field the 기간 range applies to. */
export type PeriodField = "reserved" | "departure" | "cancelled";
/** Train operator filter. */
export type TrainKind = "all" | "ktx" | "srt";
/** Order-level booking status filter. */
export type BookingStatus = "all" | "pending" | "ticketed" | "cancelled";

export type BookingFilterState = {
  periodField: PeriodField;
  /** Inclusive range as "YYYY-MM-DD" strings; null = no period filter. */
  rangeStart: string | null;
  rangeEnd: string | null;
  kind: TrainKind;
  status: BookingStatus;
  keyword: string;
};

export const EMPTY_FILTERS: BookingFilterState = {
  periodField: "reserved",
  rangeStart: null,
  rangeEnd: null,
  kind: "all",
  status: "all",
  keyword: "",
};

/** True when any filter would narrow the list. */
export function hasActiveFilter(f: BookingFilterState): boolean {
  return (
    (!!f.rangeStart && !!f.rangeEnd) ||
    f.kind !== "all" ||
    f.status !== "all" ||
    f.keyword.trim() !== ""
  );
}

/* ───────────────────────────────── status */

type LegStatus = "pending" | "confirmed" | "ticketed" | "cancelled";

function legStatus(r: Reservation | undefined): LegStatus {
  if (!r) return "cancelled";
  if (r.cancelled) return "cancelled";
  if (r.ticketed) return "ticketed";
  if (r.confirmed) return "confirmed";
  return "pending";
}

/** Collapse an order to one of the three filterable states. */
export function orderStatus(o: Order): "pending" | "ticketed" | "cancelled" {
  const out = legStatus(o.reservation);
  const inn =
    o.tripType === "roundtrip" ? legStatus(o.inboundReservation) : null;
  const legs = inn === null ? [out] : [out, inn];
  if (legs.every((s) => s === "cancelled")) return "cancelled";
  const active = legs.filter((s) => s !== "cancelled");
  if (active.length > 0 && active.every((s) => s === "ticketed")) {
    return "ticketed";
  }
  return "pending";
}

/* ───────────────────────────────── dates */

/** ISO timestamp → "YYYY-MM-DD" (or null). */
function isoToYmd(iso: string | undefined): string | null {
  if (!iso || iso.length < 10) return null;
  return iso.slice(0, 10);
}

/** TAGO plan time "YYYYMMDDHHmm" → "YYYY-MM-DD" (or null). */
function plandToYmd(s: string | undefined): string | null {
  if (!s || s.length < 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** The candidate dates an order exposes for the chosen period field. */
function periodDates(o: Order, field: PeriodField): string[] {
  if (field === "reserved") {
    const d = isoToYmd(o.createdAt);
    return d ? [d] : [];
  }
  if (field === "departure") {
    return [
      plandToYmd(o.outbound?.depPlandTime),
      plandToYmd(o.inbound?.depPlandTime),
    ].filter((x): x is string => !!x);
  }
  // cancelled
  return [
    isoToYmd(o.reservation?.cancelledAt),
    isoToYmd(o.inboundReservation?.cancelledAt),
  ].filter((x): x is string => !!x);
}

/* ───────────────────────────────── kind */

export function orderKind(o: Order): "ktx" | "srt" {
  return (o.outbound?.trainGradeName ?? "").toUpperCase().startsWith("SRT")
    ? "srt"
    : "ktx";
}

/* ───────────────────────────────── filter */

export function filterOrders(
  orders: Order[],
  f: BookingFilterState,
): Order[] {
  const kw = f.keyword.trim().toLowerCase();
  return orders.filter((o) => {
    // 기간 — only applied when a full range is set.
    if (f.rangeStart && f.rangeEnd) {
      const dates = periodDates(o, f.periodField);
      const hit = dates.some(
        (d) => d >= f.rangeStart! && d <= f.rangeEnd!,
      );
      if (!hit) return false;
    }
    // 종류
    if (f.kind !== "all" && orderKind(o) !== f.kind) return false;
    // 예매 상태
    if (f.status !== "all" && orderStatus(o) !== f.status) return false;
    // 검색어 — name / email across every passenger.
    if (kw) {
      const hay = o.passengers
        .flatMap((p) => [p.name, p.email])
        .join(" ")
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

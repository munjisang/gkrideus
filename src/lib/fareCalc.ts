import { firstClassMult } from "./fare";
import {
  DEFAULT_FEE_SETTINGS,
  type FeeSettings,
  type SeatType,
  type TrainSchedule,
} from "./types";

/** Passenger fare categories, mirrored from the home-page passenger sheet. */
export type PaxType = "adult" | "child" | "toddler" | "senior";

/** Standard KORAIL discount rates applied to the adult fare. */
export const PAX_FARE_RATE: Record<PaxType, number> = {
  adult: 1.0,
  child: 0.5,
  toddler: 0.0, // toddlers ride free when not assigned their own seat
  senior: 0.7, // 30% 경로 할인
};

export type PaxFare = {
  type: PaxType;
  /** 정상운임 for this passenger (round-trip total if applicable). */
  regular: number;
  /** 운임할인 ≥ 0. */
  discount: number;
  /** 결제운임 = 정상운임 − 운임할인. */
  netPay: number;
  /** 발권수수료 = ceil(netPay × 0.20 / 100) × 100. */
  fee: number;
  /** 총 운임 = netPay + fee. */
  legTotal: number;
};

/** Compute one passenger's fare from the adult-base per-person values.
 *  `feeSettings` lets the admin pick the rate and which baseline (정상
 *  운임 vs 결제운임) the rate is applied to. Defaults match the
 *  pre-Phase-3 behaviour. */
export function paxFareFor(
  ppAdultRegular: number,
  ppAdultDiscounted: number,
  type: PaxType,
  feeSettings: FeeSettings = DEFAULT_FEE_SETTINGS,
): PaxFare {
  const rate = PAX_FARE_RATE[type];
  const regular = Math.round((ppAdultRegular * rate) / 100) * 100;
  const netPay = Math.round((ppAdultDiscounted * rate) / 100) * 100;
  const discount = Math.max(0, regular - netPay);
  const basisAmount =
    feeSettings.bookingFeeBasis === "regular" ? regular : netPay;
  const fee = Math.ceil((basisAmount * feeSettings.bookingFeeRate) / 100) * 100;
  return { type, regular, discount, netPay, fee, legTotal: netPay + fee };
}

/** Expand a paxBreakdown into one PaxType per seat, in display order. */
export function expandPaxBreakdown(b: {
  adults?: number;
  children?: number;
  toddlers?: number;
  seniors?: number;
}): PaxType[] {
  const out: PaxType[] = [];
  for (let i = 0; i < (b.adults ?? 0); i++) out.push("adult");
  for (let i = 0; i < (b.children ?? 0); i++) out.push("child");
  for (let i = 0; i < (b.toddlers ?? 0); i++) out.push("toddler");
  for (let i = 0; i < (b.seniors ?? 0); i++) out.push("senior");
  return out;
}

/** Regular = TAGO standard × class multiplier (rounded to 100원).
 *  Discounted = same with the standard-class live-discount ratio applied
 *  uniformly (matches letskorail.com's promo behaviour). */
export function legFares(
  tr: TrainSchedule | null | undefined,
  seat: SeatType,
): { regular: number; discounted: number } {
  if (!tr) return { regular: 0, discounted: 0 };
  const mult = seat === "first" ? firstClassMult(tr.trainGradeName) : 1;
  const regular = Math.round((tr.adultCharge * mult) / 100) * 100;
  let discounted = regular;
  if (tr.discountedCharge != null && tr.adultCharge > 0) {
    const ratio = tr.discountedCharge / tr.adultCharge;
    discounted = Math.round((tr.adultCharge * mult * ratio) / 100) * 100;
    if (discounted > regular) discounted = regular;
  }
  return { regular, discounted };
}

export type FareSummary = {
  /** Adult-equivalent per-person 정상운임 across both legs. Children /
   *  seniors / toddlers each scale this by PAX_FARE_RATE. */
  ppRegular: number;
  /** Adult-equivalent per-person 결제운임. */
  ppDiscounted: number;
  /** Adult-equivalent per-person 운임할인. */
  ppDiscount: number;
  /** Per-passenger fare blocks, one per seat in display order. */
  rows: PaxFare[];
  /** Real grand total = sum of every row's legTotal. Honours pax types. */
  total: number;
};

type PaxBreakdownIn = {
  adults?: number;
  children?: number;
  toddlers?: number;
  seniors?: number;
};

/** Aggregate fares across out/in legs and the chosen seat for each.
 *  When `breakdown` is omitted we assume `passengerCount` adults — keeps
 *  callers without a typed breakdown (legacy localStorage data) working.
 *  `feeSettings` defaults to the legacy 20%/discounted rule. */
export function summarizeFares(
  outbound: TrainSchedule | null | undefined,
  outboundSeat: SeatType,
  inbound: TrainSchedule | null | undefined,
  inboundSeat: SeatType,
  passengerCount: number,
  breakdown?: PaxBreakdownIn | null,
  feeSettings: FeeSettings = DEFAULT_FEE_SETTINGS,
): FareSummary {
  const out = legFares(outbound, outboundSeat);
  const inn = legFares(inbound, inboundSeat);
  const ppRegular = out.regular + inn.regular;
  const ppDiscounted = out.discounted + inn.discounted;
  const ppDiscount = Math.max(0, ppRegular - ppDiscounted);
  // Resolve the seat-by-seat pax type list. Fall back to all-adult.
  const types: PaxType[] =
    breakdown && (breakdown.adults || breakdown.children || breakdown.toddlers || breakdown.seniors)
      ? expandPaxBreakdown(breakdown)
      : Array(Math.max(1, passengerCount)).fill("adult");
  const rows = types.map((type) =>
    paxFareFor(ppRegular, ppDiscounted, type, feeSettings),
  );
  const total = rows.reduce((sum, r) => sum + r.legTotal, 0);
  return { ppRegular, ppDiscounted, ppDiscount, rows, total };
}

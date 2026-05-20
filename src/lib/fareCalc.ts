import { firstClassMult } from "./fare";
import type { SeatType, TrainSchedule } from "./types";

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
  /** 정상운임 per person across both legs. */
  ppRegular: number;
  /** 결제운임 per person (= regular − discount). */
  ppDiscounted: number;
  /** 운임할인 per person. Always ≥ 0. */
  ppDiscount: number;
  /** 발권수수료 per person. (discounted × 20%, ceil to 100원). */
  ppFee: number;
  /** 총 운임 per person (= discounted + fee). */
  ppLegTotal: number;
  /** Grand total = ppLegTotal × passengerCount. */
  total: number;
};

/** Aggregate fares across out/in legs and the chosen seat for each. */
export function summarizeFares(
  outbound: TrainSchedule | null | undefined,
  outboundSeat: SeatType,
  inbound: TrainSchedule | null | undefined,
  inboundSeat: SeatType,
  passengerCount: number,
): FareSummary {
  const out = legFares(outbound, outboundSeat);
  const inn = legFares(inbound, inboundSeat);
  const ppRegular = out.regular + inn.regular;
  const ppDiscounted = out.discounted + inn.discounted;
  const ppDiscount = Math.max(0, ppRegular - ppDiscounted);
  const ppFee = Math.ceil((ppDiscounted * 0.2) / 100) * 100;
  const ppLegTotal = ppDiscounted + ppFee;
  return {
    ppRegular,
    ppDiscounted,
    ppDiscount,
    ppFee,
    ppLegTotal,
    total: ppLegTotal * Math.max(1, passengerCount),
  };
}

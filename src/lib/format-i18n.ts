import type { Lang } from "./i18n";

/** Localised duration: `2시간 30분` / `2h 30m`. */
export function durationL(min: number, lang: Lang): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (lang === "ko") return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Localised KRW: `59,800원` / `₩59,800`. */
export function krwL(n: number, lang: Lang): string {
  return lang === "ko"
    ? `${n.toLocaleString("ko-KR")}원`
    : `₩${n.toLocaleString("en-US")}`;
}

/** `YYYYMMDD...` (12+ digits) → `YYYY.MM.DD` for compact card headers. */
export function fmtDateDots(plandTime: string): string {
  if (plandTime.length < 8) return plandTime;
  return `${plandTime.slice(0, 4)}.${plandTime.slice(4, 6)}.${plandTime.slice(6, 8)}`;
}

/** Localised "N호 7A" / "Car N · 7A" from Reservation car/seat fields.
 *  Returns null when either piece is missing. */
export function fmtCarSeatL(
  carNo: string | undefined,
  seatNo: string | undefined,
  seatNoEnd: string | undefined,
  lang: Lang,
): string | null {
  if (!carNo || !seatNo) return null;
  const car = String(Number(carNo) || carNo);
  const seats = seatNoEnd ? `${seatNo}~${seatNoEnd}` : seatNo;
  return lang === "ko" ? `${car}호 ${seats}` : `Car ${car} · ${seats}`;
}

export type TripType = "oneway" | "roundtrip";
export type SeatType = "standard" | "first";
export type SeatPref = "none" | "window" | "aisle";
export type Gender = "M" | "F";
export type PayMethod = "card" | "paypal";

/** Admin-configurable fee policy stored in `service_settings`. */
export type FeeSettings = {
  /** 발권수수료율 in [0, 1]. e.g. 0.2 = 20%. */
  bookingFeeRate: number;
  /** Apply the rate to either 정상운임 (regular) or 결제운임 (discounted). */
  bookingFeeBasis: "regular" | "discounted";
  /** 취소수수료율 in [0, 1]. */
  cancelFeeRate: number;
};

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  bookingFeeRate: 0.2,
  bookingFeeBasis: "discounted",
  cancelFeeRate: 0.1,
};

export type TrainSchedule = {
  trainNo: string;
  trainGradeCode: string;
  trainGradeName: string;
  depPlaceId: string;
  depPlaceName: string;
  arrPlaceId: string;
  arrPlaceName: string;
  depPlandTime: string;
  arrPlandTime: string;
  /** TAGO regular adult fare for the standard seat. */
  adultCharge: number;
  /** Korail live discounted fare for the standard seat, when announced
   *  via reservePossibleName. Absent → no current discount. */
  discountedCharge?: number;
};

export type Passenger = {
  name: string;
  email: string;
  countryCode: string;
  phone: string;
};

export type Reservation = {
  rsvId: string;
  /** ISO timestamp when reservation was placed (locally observed) */
  reservedAt: string;
  /** "YYYY-MM-DD HH:mm" payment deadline from Korail, if available */
  deadline?: string;
  totalPrice?: number;
  seatLabel?: string;
  /** Server-side mode that actually ran. "live" hit Korail; "dry" only matched. */
  mode: "live" | "dry";
  /** True once the reservation is no longer active (user-cancelled,
   *  payment-deadline expired, or any other Korail-side disappearance).
   *  We keep the row + rsvId for history rather than wiping the field. */
  cancelled?: boolean;
  /** ISO timestamp when we observed the cancellation. */
  cancelledAt?: string;
  /** True once the admin marks the booking as confirmed. */
  confirmed?: boolean;
  /** ISO timestamp when admin confirmed. */
  confirmedAt?: string;
  /** True once Korail issues an actual ticket (=결제 완료 + 좌석 배정).
   *  The Korail reservation row disappears at this point; we detect this
   *  by matching the train/date against `korail.tickets()`. */
  ticketed?: boolean;
  /** ISO timestamp when we observed the ticketing. */
  ticketedAt?: string;
  /** 호차 — e.g. "04". Only present once ticketed.
   *  Legacy single-seat compat: matches `seats[0].carNo`. */
  carNo?: string;
  /** 좌석번호 — e.g. "7A". Legacy: matches `seats[0].seatNo`. */
  seatNo?: string;
  /** 다구간 좌석의 끝 좌석 (라이브러리가 채우지 않으므로 보통 undefined). */
  seatNoEnd?: string;
  /** 인원별 호차/좌석 — Korail의 `tk_seat_info` 배열을 통째로 보관.
   *  예약시 인원 순서(어른→어린이→경로→유아)와 매칭. */
  seats?: { carNo: string; seatNo: string }[];
  raw?: unknown;
};

export type Order = {
  id: string;
  createdAt: string;
  tripType: TripType;
  outbound: TrainSchedule;
  inbound?: TrainSchedule;
  /** Seat type for the outbound leg (kept for backward compatibility). */
  seatType: SeatType;
  /** Seat type for the inbound leg, only set when roundtrip + chosen. */
  inboundSeatType?: SeatType;
  passengerCount: number;
  /** Age-type breakdown chosen on the home page. */
  paxBreakdown?: {
    adults: number;
    children: number;
    toddlers: number;
    seniors: number;
  };
  passengers: Passenger[];
  /** "none" (default), "window", or "aisle". UX-only — Korail seat-pref
   *  flag is not honored by the booking endpoint yet. */
  seatPref?: SeatPref;
  /** Payment method chosen at checkout. Persisted for the booking
   *  detail's "결제수단" line. */
  payMethod?: PayMethod;
  /** Snapshot of admin fee settings at checkout time. Lets the booking
   *  detail re-render the same numbers later even after the admin
   *  changes service-settings. */
  feeSettings?: FeeSettings;
  totalPrice: number;
  /** Result of clicking [예매하기] in admin — outbound leg. */
  reservation?: Reservation;
  /** Reservation for the inbound leg (only roundtrip orders). */
  inboundReservation?: Reservation;
};

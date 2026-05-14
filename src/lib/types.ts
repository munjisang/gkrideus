export type TripType = "oneway" | "roundtrip";
export type SeatType = "standard" | "first";
export type Gender = "M" | "F";

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
  adultCharge: number;
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
  passengers: Passenger[];
  totalPrice: number;
  /** Result of clicking [예매하기] in admin — independent from the TAGO search above. */
  reservation?: Reservation;
};

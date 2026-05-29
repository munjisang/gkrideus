"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Lang } from "./labels";

// `Lang` lives in the non-client ./labels module; re-export so existing
// `import { type Lang } from ".../i18n"` callers keep working.
export type { Lang };

const STORAGE_KEY = "korail.lang";

// ─────────────────────────────────────────── UI string dictionary
// Flat semantic keys. Use {x} placeholders; pass params to t().
type Entry = { ko: string; en: string };

const DICT: Record<string, Entry> = {
  // header / nav
  "app.title": { ko: "승차권 예매", en: "Ticketing" },
  "nav.admin": { ko: "관리자", en: "Admin" },
  "nav.book": { ko: "예매하기", en: "Booking" },
  "nav.main": { ko: "메인", en: "Main" },
  "nav.myBookings": { ko: "예매내역", en: "My bookings" },
  "nav.profileMenu": { ko: "프로필 메뉴", en: "Profile menu" },
  "nav.langMenu": { ko: "언어 선택", en: "Select language" },

  // home
  "home.oneway": { ko: "편도", en: "One-way" },
  "home.roundtrip": { ko: "왕복", en: "Round-trip" },
  "home.dep": { ko: "출발", en: "From" },
  "home.arr": { ko: "도착", en: "To" },
  "home.depStation": { ko: "출발역", en: "Departure station" },
  "home.arrStation": { ko: "도착역", en: "Arrival station" },
  "home.depDate": { ko: "가는 날", en: "Departure" },
  "home.retDate": { ko: "오는 날", en: "Return" },
  "home.pickDate": { ko: "탑승일", en: "Travel date" },
  "home.pax": { ko: "인원", en: "Passengers" },
  "home.swap": { ko: "역 바꾸기", en: "Swap stations" },
  "home.search": { ko: "열차 조회", en: "Search trains" },
  "home.err.sameStation": {
    ko: "출발역과 도착역이 같습니다.",
    en: "Departure and arrival stations are the same.",
  },
  "home.err.noStations": {
    ko: "출발역과 도착역을 선택해주세요.",
    en: "Please select departure and arrival stations.",
  },
  "home.err.noDep": { ko: "가는 날을 선택해주세요.", en: "Please pick a departure date." },
  "home.err.noRet": { ko: "오는 날을 선택해주세요.", en: "Please pick a return date." },
  "home.err.retBeforeDep": {
    ko: "돌아오는 날짜가 가는 날짜보다 빠를 수 없습니다.",
    en: "Return date cannot be before departure date.",
  },
  "home.err.noPax": {
    ko: "탑승객을 1명 이상 선택해주세요.",
    en: "Select at least one passenger.",
  },
  "home.afterHour": { ko: "{h}시 이후", en: "after {h}:00" },

  // passengers labels
  "pax.adult": { ko: "어른", en: "Adult" },
  "pax.child": { ko: "어린이", en: "Child" },
  "pax.toddler": { ko: "유아", en: "Toddler" },
  "pax.senior": { ko: "경로", en: "Senior" },
  "pax.adultSub": { ko: "만 13세 이상", en: "Age 13+" },
  "pax.childSub": { ko: "만 6-12세", en: "Age 6-12" },
  "pax.toddlerSub": { ko: "만 6세 미만", en: "Under 6" },
  "pax.seniorSub": { ko: "만 65세 이상", en: "Age 65+" },
  "pax.toddlerFree": { ko: "6세 미만 유아는 무료입니다.", en: "Children under 6 ride free." },
  "pax.selectTitle": { ko: "인원 선택", en: "Select passengers" },
  "pax.count": { ko: "{n}명", en: "{n}" },
  "pax.adultDefault": { ko: "성인 1명", en: "1 Adult" },

  // station picker
  "sp.searchPlaceholder": {
    ko: "역명 또는 지역명 검색",
    en: "Search station or region",
  },
  "sp.tab.recent": { ko: "최근", en: "Recent" },
  "sp.tab.major": { ko: "주요역", en: "Major" },
  "sp.loading": { ko: "역 목록을 불러오는 중…", en: "Loading stations…" },
  "sp.noRecent": { ko: "최근 선택한 역이 없습니다.", en: "No recent stations." },
  "sp.empty": { ko: "표시할 역이 없습니다.", en: "No stations to show." },
  "sp.noResult": { ko: '"{q}" 검색 결과가 없습니다.', en: 'No results for "{q}".' },
  // Empty so labels show only the region name ("서울" / "Seoul"), not "서울역".
  "sp.stationSuffix": { ko: "", en: "" },

  // date picker
  "dp.titleDep": { ko: "가는 날 선택", en: "Select departure date" },
  "dp.titleRet": { ko: "오는 날 선택", en: "Select return date" },
  "dp.today": { ko: "오늘", en: "Today" },
  "dp.selected": { ko: "선택", en: "Selected" },
  "dp.afterDepart": { ko: "{h}시 이후 출발", en: "Departing after {h}:00" },
  "dp.hourPill": { ko: "{h}시", en: "{h}:00" },
  "common.cancel": { ko: "취소", en: "Cancel" },
  "common.select": { ko: "선택", en: "Select" },
  "common.loading": { ko: "불러오는 중…", en: "Loading…" },

  // search results
  "sr.filter.all": { ko: "전체", en: "All" },
  "sr.filter.ktx": { ko: "KTX", en: "KTX" },
  "sr.filter.srt": { ko: "SRT", en: "SRT" },
  "sr.filter.saemaul": { ko: "새마을", en: "Saemaul" },
  "sr.filter.mugunghwa": { ko: "무궁화", en: "Mugunghwa" },
  "sr.filter.itx": { ko: "ITX-청춘", en: "ITX-Cheongchun" },
  "sr.standard": { ko: "일반실", en: "Standard" },
  "sr.first": { ko: "특실", en: "First" },
  "sr.searching": { ko: "스케줄을 조회중입니다.", en: "Searching schedules." },
  "sr.none": { ko: "예매할 수 있는 열차가 없습니다.", en: "No trains available." },
  "sr.outbound": { ko: "가는 편", en: "Outbound" },
  "sr.mockWarn": {
    ko: "실시간 TAGO 응답을 받지 못해 데모용 모의 시간표를 표시합니다.",
    en: "Live TAGO data unavailable — showing demo mock schedule.",
  },
  "sr.searchAgain": { ko: "검색 조건이 부족합니다.", en: "Missing search parameters." },
  "sr.totalPax": { ko: "총 {n}명", en: "Total {n}" },

  // order
  "ord.title": { ko: "예매정보 입력", en: "Booking Details" },
  "ord.selectedTrain": { ko: "선택한 열차", en: "Selected Train" },
  "ord.legOut": { ko: "가는 편", en: "Outbound" },
  "ord.legIn": { ko: "오는 편", en: "Inbound" },
  "ord.paxInfo": { ko: "인원정보", en: "Passengers" },
  "ord.seatPref": { ko: "선호 좌석", en: "Seat preference" },
  "ord.seatPref.none": { ko: "선호 사항 없음", en: "No preferences" },
  "ord.seatPref.window": { ko: "창가", en: "Window" },
  "ord.seatPref.aisle": { ko: "통로측", en: "Aisle" },
  "ord.payInfo": { ko: "결제정보", en: "Payment Summary" },
  "ord.fare.regular": { ko: "정상운임", en: "Regular fare" },
  "ord.fare.discount": { ko: "운임할인", en: "Fare discount" },
  "ord.fare.netPay": { ko: "결제운임", en: "Payment fare" },
  "ord.fare.fee": { ko: "발권수수료({p})", en: "Booking fee ({p})" },
  "ord.fare.legTotal": { ko: "총 운임", en: "Subtotal" },
  "ord.total": { ko: "합계", en: "Total" },
  "ord.booker": { ko: "예약자 정보", en: "Booker Info" },
  "ord.name": { ko: "이름", en: "Name as in passport" },
  "ord.namePh": { ko: "홍길동", en: "Enter your name" },
  "ord.email": { ko: "이메일", en: "Email" },
  "ord.emailPh": { ko: "example@mail.com", en: "Enter your email" },
  "ord.country": { ko: "국가", en: "Country" },
  "ord.countryPh": { ko: "국가를 선택하세요", en: "Select your country" },
  "ord.country.searchPh": { ko: "국가명 검색", en: "Search country" },
  "ord.payMethod": { ko: "결제수단 선택", en: "Payment Method" },
  "ord.agreeAll": { ko: "전체 동의", en: "Agree to all" },
  "ord.agree.fare": { ko: "요금규정", en: "Fare policy" },
  "ord.agree.tos": { ko: "이용약관", en: "Terms of service" },
  "ord.agree.privacy": { ko: "개인정보 처리방침", en: "Privacy policy" },
  "ord.totalAmount": { ko: "총 결제 금액", en: "Total Amount" },
  "ord.pay": { ko: "결제하기", en: "Pay" },
  "ord.paying": { ko: "처리 중…", en: "Processing…" },
  "ord.processing.title": { ko: "결제 처리 중", en: "Processing your payment" },
  "ord.processing.sub": {
    ko: "코레일에 좌석을 확보하고 있어요. 잠시만 기다려 주세요.",
    en: "Reserving your seat with Korail. Please hold on.",
  },
  "ord.perPerson": { ko: "1인", en: "/person" },
  "ord.noTrain": { ko: "선택된 열차 정보가 없습니다.", en: "No train selected." },
  "ord.toHome": { ko: "처음으로", en: "Home" },
  "ord.toBookings": { ko: "예매내역 가기", en: "View my bookings" },
  "ord.err.name": { ko: "예약자 이름을 입력해주세요.", en: "Enter the booker's name." },
  "ord.err.email": {
    ko: "예약자 이메일이 올바르지 않습니다.",
    en: "Invalid email address.",
  },
  "ord.err.country": { ko: "국가를 선택해주세요.", en: "Please select your country." },
  "ord.err.pay": { ko: "결제수단을 선택해주세요.", en: "Select a payment method." },
  "ord.err.agree": { ko: "약관에 모두 동의해주세요.", en: "Agree to all policies." },
  "ord.err.saveFail": { ko: "주문 저장 실패: {m}", en: "Failed to save order: {m}" },
  "ord.err.legOut": { ko: "가는 편 정보가 없습니다.", en: "Missing outbound train." },
  "ord.err.legIn": { ko: "오는 편 정보가 없습니다.", en: "Missing return train." },
  "ord.err.reserveOut": {
    ko: "가는 편 예약 실패: {m}",
    en: "Outbound reservation failed: {m}",
  },
  "ord.err.reserveIn": {
    ko: "오는 편 예약 실패: {m}",
    en: "Inbound reservation failed: {m}",
  },
  "ord.err.reserveParse": {
    ko: "예약 응답을 해석할 수 없습니다.",
    en: "Could not parse reservation response.",
  },
  "ord.err.rollbackOk": {
    ko: "가는 편 예약은 자동 취소되었습니다. ({id})",
    en: "Outbound reservation auto-cancelled. ({id})",
  },
  "ord.err.rollbackFail": {
    ko: "⚠ 가는 편({id}) 자동 취소 실패: {m}\n코레일 앱에서 직접 취소해주세요.",
    en: "⚠ Outbound rollback failed ({id}): {m}\nPlease cancel it manually in the Korail app.",
  },

  // bookings (user-facing list + detail)
  "bk.title": { ko: "예매내역", en: "My bookings" },
  "bk.empty": { ko: "예매 내역이 없습니다.", en: "No bookings yet." },
  "bk.empty.cta": { ko: "예매하러 가기", en: "Book a ticket" },
  "bk.detail.title": { ko: "예매 상세", en: "Booking detail" },
  "bk.notFound": {
    ko: "예매 내역을 찾을 수 없습니다. (ID: {id})",
    en: "Booking not found. (ID: {id})",
  },
  "bk.status.pending": { ko: "예매대기", en: "Pending" },
  "bk.status.confirmed": { ko: "예매확정", en: "Confirmed" },
  "bk.status.ticketed": { ko: "발권완료", en: "Ticketed" },
  "bk.status.cancelled": { ko: "예매취소", en: "Cancelled" },
  "bk.car": { ko: "{n}호", en: "Car {n}" },
  "bk.seat": { ko: "좌석", en: "Seat" },
  "bk.rsvInfo": { ko: "예약 정보", en: "Reservation" },
  "bk.rsvId": { ko: "예약 번호", en: "Reservation No." },
  "bk.deadline": { ko: "결제 기한", en: "Payment deadline" },
  "bk.bookedAt": { ko: "예매 시각", en: "Booked at" },
  "bk.cancel": { ko: "예매 취소", en: "Cancel booking" },
  "bk.cancelConfirm": {
    ko: "예매를 취소합니다.\n취소된 좌석은 즉시 다른 사람이 잡을 수 있게 됩니다.\n진행할까요?",
    en: "Cancel this booking?\nThe seat will immediately be available to others.\nProceed?",
  },
  "bk.cancelDone": { ko: "예매가 취소되었습니다.", en: "Booking cancelled." },
  "bk.cancelFail": { ko: "취소 실패: {m}", en: "Cancel failed: {m}" },
  "bk.cancelling": { ko: "취소 중…", en: "Cancelling…" },
  "bk.totalShort": { ko: "총 {m}", en: "Total {m}" },
  "bk.legPax": { ko: "총인원 {n}명", en: "{n} pax" },
  "bk.section.itinerary": { ko: "여정", en: "Itinerary" },
  "bk.section.cancellation": { ko: "취소내역", en: "Cancellation" },
  "bk.pay.method": { ko: "결제수단", en: "Payment method" },
  "bk.pay.at": { ko: "결제일시", en: "Paid at" },
  "bk.cancel.at": { ko: "취소일시", en: "Cancelled at" },
  "bk.cancelFee": { ko: "취소수수료({p})", en: "Cancellation fee ({p})" },
  "bk.payAmount": { ko: "결제금액", en: "Paid amount" },
  "bk.cancelAmount": { ko: "취소금액", en: "Refund amount" },
  "bk.payMethod.card": { ko: "신용카드", en: "Credit card" },
  "bk.payMethod.paypal": { ko: "Paypal", en: "Paypal" },
  "bk.confirm": { ko: "확정", en: "Confirm" },
  "bk.confirmConfirm": {
    ko: "예매를 확정 처리합니다. 진행할까요?",
    en: "Mark this booking as confirmed. Proceed?",
  },

  // complete
  "cp.done": { ko: "예매가 완료되었습니다", en: "Booking Complete" },
  "cp.bookingNo": { ko: "예매 번호", en: "Booking No." },
  "cp.amount": { ko: "결제 금액", en: "Amount" },
  "cp.seat": { ko: "좌석 등급", en: "Seat class" },
  "cp.trip": { ko: "여정", en: "Trip" },
  "cp.bookedAt": { ko: "예매 시각", en: "Booked at" },
  "cp.pax": { ko: "탑승객", en: "Passengers" },
  "cp.notFound": {
    ko: "주문을 찾을 수 없습니다. (ID: {id})",
    en: "Order not found. (ID: {id})",
  },

  // misc
  "back": { ko: "뒤로", en: "Back" },
  "home": { ko: "홈", en: "Home" },
};

// Station / region / grade label helpers live in the non-client
// `./labels` module so server code can call them. Re-exported here so
// existing client imports (`from "../lib/i18n"`) keep working.
export { stationLabel, regionLabel, gradeLabel, romanize } from "./labels";

// ─────────────────────────────────────────── context
type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "ko" || saved === "en") setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const entry = DICT[key];
      let s = entry ? entry[lang] : key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useI18n(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) {
    // Safe fallback when used outside provider (shouldn't happen).
    return {
      lang: "ko",
      setLang: () => {},
      t: (k) => DICT[k]?.ko ?? k,
    };
  }
  return ctx;
}

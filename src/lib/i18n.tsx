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
  "nav.trains": { ko: "기차", en: "Trains" },
  "nav.bus": { ko: "버스", en: "Bus" },
  "nav.ferry": { ko: "페리", en: "Ferry" },
  "nav.bookingSearch": { ko: "예약 내역", en: "Find bookings" },
  "nav.login": { ko: "로그인/회원가입", en: "Sign in" },

  // home
  "home.oneway": { ko: "편도", en: "One-way" },
  "home.roundtrip": { ko: "왕복", en: "Round-trip" },
  "home.dep": { ko: "출발", en: "From" },
  "home.arr": { ko: "도착", en: "To" },
  "home.depStation": { ko: "출발", en: "Departure" },
  "home.arrStation": { ko: "도착", en: "Arrival" },
  "home.depPlaceholder": { ko: "출발역", en: "From" },
  "home.arrPlaceholder": { ko: "도착역", en: "To" },
  "home.depDate": { ko: "가는날", en: "Departure date" },
  "home.retDate": { ko: "오는날", en: "Return date" },
  "home.pickDate": { ko: "탑승일", en: "Travel date" },
  "home.pax": { ko: "인원", en: "Passengers" },
  "home.swap": { ko: "역 바꾸기", en: "Swap stations" },
  "home.search": { ko: "조회", en: "Search" },
  "home.heroTitle": {
    ko: "어디로 가시나요?",
    en: "Welcome to Korea. Where to go?",
  },
  "home.heroSub": {
    ko: "전국 기차표를 한 번에 검색하고 예매하세요.",
    en: "Search and book train tickets across Korea in one place.",
  },
  "home.addReturn": { ko: "돌아오는 일정 추가", en: "Add return" },
  "home.whyTitle": {
    ko: "그라운드케이에서 예약해야 하는 이유",
    en: "Why with GroundK",
  },
  "home.why1.title": { ko: "실시간 좌석 예약", en: "Real-time booking" },
  "home.why1.desc": {
    ko: "다양한 교통수단을 실시간으로 조회하고 바로 예매하세요.",
    en: "Check various transportation methods in real time and book them right away.",
  },
  "home.why2.title": { ko: "외국인도 간편하게", en: "Made for travelers" },
  "home.why2.desc": {
    ko: "다국어와 해외 결제로 누구나 쉽게 예매할 수 있어요.",
    en: "Multilingual and overseas payments built in.",
  },
  "home.why3.title": { ko: "투명한 가격", en: "Transparent pricing" },
  "home.why3.desc": {
    ko: "운임과 수수료를 미리 명확하게 보여드려요.",
    en: "Fares and fees shown clearly, before you pay.",
  },
  "home.popularTitle": { ko: "국내 인기 노선", en: "Popular routes in South Korea" },
  "home.popularGo": { ko: "예매하기", en: "Book" },
  "home.fromPrice": { ko: "{p}원~", en: "KRW {p}~" },
  "home.busSoon": {
    ko: "시외버스 예매는 준비 중입니다.",
    en: "Intercity bus booking is coming soon.",
  },
  "home.modeSoon": {
    ko: "선택하신 교통수단 예매는 준비 중입니다.",
    en: "Booking for this transport is coming soon.",
  },
  "home.filterAll": { ko: "전체", en: "All" },
  "home.ferrySoon": { ko: "준비중입니다.", en: "Coming soon." },
  "home.infoBus1.title": { ko: "고속버스", en: "Express buses" },
  "home.infoBus1.desc": {
    ko: "주요 도시를 고속도로로 빠르게 잇는 고속버스. 우등·프리미엄 좌석으로 넓고 편안하게 이동하고, 실시간 잔여석과 요금을 미리 확인할 수 있어요.",
    en: "Express buses connect major cities quickly via expressway. Travel in roomy Premium or Excellent-class seats, and check live seat availability and fares in advance.",
  },
  "home.infoBus2.title": { ko: "시외버스", en: "Intercity buses" },
  "home.infoBus2.desc": {
    ko: "기차가 닿지 않는 중소도시까지 촘촘하게 연결하는 시외버스. 가까운 터미널에서 합리적인 요금으로 전국 구석구석을 편리하게 오갈 수 있어요.",
    en: "Intercity buses reach the smaller towns trains don't serve. Travel across the country from your nearest terminal at a reasonable fare.",
  },
  "home.infoBus3.title": { ko: "버스 터미널 · 예매", en: "Terminals & booking" },
  "home.infoBus3.desc": {
    ko: "전국 버스 터미널의 시간표와 노선을 한 곳에서 조회하고, 좌석을 선택해 바로 예매하세요. 출발 직전까지 모바일로 간편하게 예약할 수 있어요.",
    en: "Browse timetables and routes for bus terminals nationwide, pick your seat, and book right away — conveniently from your phone, right up to departure.",
  },

  // intercity bus
  "bus.terminalTitle": { ko: "터미널 선택", en: "Select terminal" },
  "bus.searchPh": { ko: "터미널명 검색", en: "Search terminal" },
  "bus.depPlaceholder": { ko: "출발 터미널", en: "From terminal" },
  "bus.arrPlaceholder": { ko: "도착 터미널", en: "To terminal" },
  "bus.depTerminal": { ko: "출발 터미널", en: "Departure" },
  "bus.arrTerminal": { ko: "도착 터미널", en: "Arrival" },
  "bus.searching": { ko: "버스를 조회중입니다.", en: "Searching buses…" },
  "bus.none": { ko: "운행하는 버스가 없습니다.", en: "No buses available." },
  "bus.remaining": { ko: "{n}석", en: "{n} seats" },
  "bus.soldOut": { ko: "매진", en: "Sold out" },
  "bus.err.noTerminals": {
    ko: "출발·도착 터미널을 선택해주세요.",
    en: "Please select departure and arrival terminals.",
  },
  "bus.err.sameTerminal": {
    ko: "출발과 도착 터미널이 같습니다.",
    en: "Departure and arrival terminals are the same.",
  },
  "bus.resultCount": { ko: "{n}편", en: "{n}" },
  "bus.cityTitle": { ko: "도시 선택", en: "Select city" },
  "bus.cityPh": { ko: "도시 검색", en: "Search city" },
  "bus.depCity": { ko: "출발", en: "From" },
  "bus.arrCity": { ko: "도착", en: "To" },
  "bus.depCityPh": { ko: "출발 도시", en: "From city" },
  "bus.arrCityPh": { ko: "도착 도시", en: "To city" },
  "bus.intercity": { ko: "시외", en: "Intercity" },
  "bus.express": { ko: "고속", en: "Express" },
  "bus.err.noCities": {
    ko: "출발·도착 도시를 선택해주세요.",
    en: "Please select departure and arrival cities.",
  },
  "bus.err.sameCity": {
    ko: "출발과 도착 도시가 같습니다.",
    en: "Departure and arrival cities are the same.",
  },
  "bus.popularCities": { ko: "인기 도시", en: "Popular" },
  "bus.recentSearch": { ko: "최근검색", en: "Recent searches" },
  "bus.noRecent": { ko: "최근 검색한 노선이 없습니다.", en: "No recent routes." },
  "bus.typeTitle": { ko: "버스 종류", en: "Bus type" },
  "bus.gradeTitle": { ko: "좌석 등급", en: "Seat grade" },
  "bus.selected": { ko: "선택한 버스", en: "Selected bus" },
  "bus.fare": { ko: "운임", en: "Fare" },
  "bus.depTime": { ko: "출발 시각", en: "Departure" },
  "bus.seatSelect": { ko: "좌석 선택", en: "Select seats" },
  "bus.seatHint": { ko: "{n}석을 선택해주세요", en: "Select {n} seat(s)" },
  "bus.selectedSeats": { ko: "선택 좌석", en: "Selected" },
  "bus.driver": { ko: "운전석", en: "Driver" },
  "bus.exit": { ko: "출입구", en: "Exit" },
  "bus.seatAvail": { ko: "선택가능", en: "Available" },
  "bus.seatSel": { ko: "선택", en: "Selected" },
  "bus.seatTaken": { ko: "예약됨", en: "Taken" },

  // bookings list filters
  "bk.statusFilter": { ko: "예약 상태", en: "Status" },
  "bk.transportFilter": { ko: "교통수단", en: "Transport" },
  "bk.status.reserved": { ko: "예약완료", en: "Reserved" },
  "bk.status.waiting": { ko: "예약대기", en: "Pending" },
  "bk.status.canceled": { ko: "예약취소", en: "Cancelled" },
  "bk.transport.ktx": { ko: "KTX", en: "KTX" },
  "bk.transport.srt": { ko: "SRT", en: "SRT" },
  "bk.transport.intercity": { ko: "시외버스", en: "Intercity bus" },
  "bk.transport.express": { ko: "고속버스", en: "Express bus" },
  "bk.transport.ferry": { ko: "페리", en: "Ferry" },

  // footer
  "footer.tagline": {
    ko: "교통 X 여행 No.1 플랫폼",
    en: "Transportation X Travel No.1 Platform",
  },
  "footer.brand": { ko: "그라운드케이", en: "GroundK" },
  "footer.desc1": {
    ko: "어디를 가든, 누구와 가든, 그라운드케이가 있다면 가볍게 떠날 수 있습니다.",
    en: "Wherever you go, whoever you're with GroundK, every trip feels light.",
  },
  "footer.desc2": {
    ko: "쉽고, 빠르고, 편안한 이동을 경험하세요.",
    en: "Experience easy, fast, and comfortable travel.",
  },
  "footer.terms": { ko: "이용약관", en: "Terms of Service" },
  "footer.privacy": { ko: "개인정보처리방침", en: "Privacy Policy" },
  "footer.company": { ko: "(주)그라운드케이", en: "GroundK Inc." },
  "footer.ceo": { ko: "대표이사", en: "CEO" },
  "footer.ceoName": { ko: "장동원", en: "Daniel Jang" },
  "footer.addrValue": {
    ko: "부산광역시 해운대구 센텀동로 45, 405호",
    en: "405, Centum-dong-ro, Haeundae-gu, Busan, Republic of Korea",
  },
  "footer.bizNo": { ko: "사업자번호", en: "Business no." },
  "footer.fax": { ko: "Fax", en: "Fax" },
  "footer.addr": { ko: "주소", en: "Address" },
  "footer.tel": { ko: "Tel", en: "Tel" },
  "footer.email": { ko: "Email", en: "Email" },
  // footer — prototype (RIDEUS) layout
  "footer.rdBrandDesc": {
    ko: "프리미엄 모빌리티의 기준을 정의합니다.\n공항 의전부터 프라이빗 투어까지,\n완벽한 여정을 설계합니다.",
    en: "Defining the standard of premium mobility.\nFrom airport chauffeur service to private tours,\nwe design the complete journey.",
  },
  "footer.colCompany": { ko: "회사소개", en: "Company" },
  "footer.brandStory": { ko: "브랜드 스토리", en: "Brand Story" },
  "footer.careers": { ko: "채용", en: "Careers" },
  "footer.press": { ko: "보도자료", en: "Press" },
  "footer.soon": { ko: "준비중", en: "Soon" },
  "footer.colSupport": { ko: "고객지원", en: "Support" },
  "footer.helpCenter": { ko: "고객센터", en: "Help Center" },
  "footer.colPartnership": { ko: "제휴 문의", en: "Partnership" },
  "footer.becomePartner": { ko: "파트너 등록", en: "Become a partner" },
  "footer.apply": { ko: "신청하기 →", en: "Apply →" },
  "footer.copyright": {
    ko: "© 2026 Rideus Mobility. All rights reserved.",
    en: "© 2026 Rideus Mobility. All rights reserved.",
  },
  "footer.location": {
    ko: "Seoul, Republic of Korea",
    en: "Seoul, Republic of Korea",
  },
  "home.infoTitle": {
    ko: "한국 기차 여행 정보",
    en: "South Korea travel information",
  },
  "home.infoSub": {
    ko: "최신 기차 정보를 확인하고 다음 여행을 더 편안하게 준비하세요.",
    en: "Stay up-to-date with the latest train information to make your next journey in South Korea even smoother.",
  },
  "home.info1.title": {
    ko: "한국 기차 여행 플래너",
    en: "South Korea train journey planner",
  },
  "home.info1.desc": {
    ko: "열차 편의시설, 요금, 시간표, 실시간 운행 정보, 노선 정보를 실시간으로 확인하세요. 최대 약 3개월 전부터 일정을 계획할 수 있어요.",
    en: "Check train amenities, fares, schedules, live timetables, route details, and other information in real time. You can plan your journey up to roughly 3 months in advance.",
  },
  "home.info2.title": {
    ko: "외국인을 위한 KORAIL 패스",
    en: "KORAIL Rail Pass for foreigners",
  },
  "home.info2.desc": {
    ko: "KORAIL 패스는 한국을 방문하는 외국인 여행자를 위한 교통 패스입니다. 정해진 기간 동안 코레일 일반 열차를 무제한 이용할 수 있어, 합리적인 비용으로 전국을 둘러볼 수 있어요.",
    en: "The KORAIL PASS is a transportation pass tailored for international travelers visiting South Korea. It permits unlimited travel on standard trains operated by KORAIL for a specified number of days — an efficient, cost-effective way to explore the country.",
  },
  "home.info3.title": { ko: "KTX 열차 시간표", en: "KTX train times" },
  "home.info3.desc": {
    ko: "전국 모든 역의 실시간 열차 운행 상태, 정차역, 출발 정보를 그라운드케이에서 확인하세요. 실시간 시간표로 한국 기차 여행을 계획할 수 있어요.",
    en: "Check live train status, stops, and departure information for all South Korea stations on GroundK. Plan your travel with live timetables and schedule information.",
  },
  "home.info4.title": { ko: "KTX 좌석 등급", en: "KTX train classes" },
  "home.info4.desc": {
    ko: "KTX 열차는 일반실(2등석)과 특실 두 가지 좌석 등급을 제공합니다. 승차권에는 좌석이 순방향인지 역방향인지도 표시되며, 선택한 등급에 따라 운임이 달라집니다.",
    en: "KTX trains offer two seating classes: Economy class and First Class. Your ticket also specifies whether the seat is forward- or backward-facing, and prices vary by the class you choose.",
  },
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
    en: "Search station",
  },
  "sp.tab.recent": { ko: "최근", en: "Recent" },
  "sp.tab.major": { ko: "주요역", en: "Major" },
  "sp.recommended": { ko: "추천", en: "Suggested" },
  "sp.popularRegions": { ko: "인기 지역", en: "Popular" },
  "sp.recentSearch": { ko: "최근검색", en: "Recent searches" },
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
  "sr.filterTitle": { ko: "열차 종류", en: "Train type" },
  "sr.resultCount": { ko: "{n}건", en: "{n}" },
  "sr.resultLabel": { ko: "검색결과", en: "Results" },
  "sr.legOutbound": { ko: "가는편", en: "Outbound" },
  "sr.legInbound": { ko: "오는편", en: "Inbound" },
  "sr.journeyTitle": { ko: "여정", en: "Trip" },
  "sr.seatClassTitle": { ko: "좌석 등급", en: "Seat class" },
  "sr.depTimeTitle": { ko: "출발 시간대", en: "Departure time" },
  "sr.optAll": { ko: "전체", en: "All" },
  "sr.timeMorning": { ko: "오전 (00:00~12:00)", en: "Morning (00:00–12:00)" },
  "sr.timeAfternoon": { ko: "오후 (12:00~18:00)", en: "Afternoon (12:00–18:00)" },
  "sr.timeEvening": { ko: "저녁 (18:00~24:00)", en: "Evening (18:00–24:00)" },
  "sr.sortLabel": { ko: "정렬", en: "Sort" },
  "sr.sortEarliest": { ko: "이른 출발순", en: "Earliest" },
  "sr.sortFastest": { ko: "짧은 소요순", en: "Fastest" },
  "sr.searchFilter": { ko: "검색 필터", en: "Filters" },
  "sr.reset": { ko: "초기화", en: "Reset" },
  "sr.hideSoldOut": { ko: "매진 제외", en: "Hide sold out" },
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
  "sr.serverError": {
    ko: "서버 응답에 문제가 있습니다. 잠시 후 다시 시도해 주세요.",
    en: "The server response was malformed. Please try again in a moment.",
  },
  "sr.totalPax": { ko: "인원 {n}명", en: "Passengers {n}" },

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
  "ord.lastName": { ko: "성", en: "Last name" },
  "ord.firstName": { ko: "이름", en: "First name" },
  "ord.lastNamePh": { ko: "홍", en: "Hong" },
  "ord.firstNamePh": { ko: "길동", en: "Gildong" },
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

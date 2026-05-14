/**
 * Curated KTX/SRT 주요 정차역 IDs — used as the default tab in StationPicker
 * before user has any "recent" history. IDs are verified via TAGO
 * `GetCtyAcctoTrainSttnList` responses.
 */
export const MAJOR_STATION_IDS: string[] = [
  "NAT010000", // 서울
  "NAT010032", // 용산
  "NAT010091", // 영등포
  "NATH10219", // 광명
  "NAT010415", // 수원
  "NATH10960", // 천안아산
  "NAT050044", // 오송
  "NAT011668", // 대전
  "NAT030057", // 서대전
  "NAT030879", // 익산
  "NATH12383", // 김천(구미)
  "NAT013271", // 동대구
  "NAT013189", // 서대구
  "NATH13421", // 경주
  "NATH13717", // 울산(통도사)
  "NAT014445", // 부산
  "NAT014281", // 구포
  "NAT031857", // 광주송정
  "NAT032563", // 목포
  "NAT040257", // 전주
  "NAT041595", // 순천
  "NAT041993", // 여수EXPO
  "NAT021033", // 만종(원주)
  "NATN10625", // 평창
  "NAT601936", // 강릉
  "NAT022188", // 영주
  "NAT022558", // 안동
];

/**
 * Display order of region tabs in the picker. cityCode strings match what
 * /api/stations returns (TAGO `GetCtyCodeList`).
 */
export const REGION_TAB_ORDER: { code: string; label: string }[] = [
  { code: "11", label: "서울" },
  { code: "31", label: "경기" },
  { code: "32", label: "강원" },
  { code: "33", label: "충북" },
  { code: "34", label: "충남" },
  { code: "35", label: "전북" },
  { code: "36", label: "전남" },
  { code: "37", label: "경북" },
  { code: "38", label: "경남" },
  { code: "21", label: "부산" },
  { code: "22", label: "대구" },
  { code: "24", label: "광주" },
  { code: "25", label: "대전" },
  { code: "26", label: "울산" },
  { code: "12", label: "세종" },
];

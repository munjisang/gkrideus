// Unified intercity (tmoney) + express (KOBUS) CITY table.
//
// Each city groups one or more 7-digit tmoney terminal codes and (optionally)
// a single 3-digit KOBUS terminal code under one user-facing origin/destination.
// The two code spaces are entirely separate; the search API resolves a city to
// both and queries each system. Major hubs are mapped explicitly so the
// high-traffic routes (서울/부산/대구/광주/대전/…) merge correctly.
//
// Codes were verified against busTerminals.json (tmoney) and
// kobusTerminals.json (KOBUS) at build time.

export type BusCity = {
  id: string; // stable slug, e.g. "seoul", "busan", "sokcho"
  name: string; // 표시명 e.g. "서울", "부산", "속초"
  region: string; // display region (Korean province / metro grouping)
  tmoney: string[]; // tmoney terminal codes in this city (may be several)
  kobus: string[]; // KOBUS terminal codes (Seoul has 경부 010 + 센트럴시티 021)
};

export const BUS_CITIES: BusCity[] = [
  { id: "seoul", name: "서울", region: "특별/광역시", tmoney: ["0511601", "0671801"], kobus: ["010", "021"] },
  { id: "busan", name: "부산", region: "특별/광역시", tmoney: ["4620401", "4696901", "4809501", "4773401"], kobus: ["700"] },
  { id: "daegu", name: "대구", region: "특별/광역시", tmoney: ["4124601", "4248201", "4171101"], kobus: ["801"] },
  { id: "gwangju", name: "광주", region: "특별/광역시", tmoney: ["6193701"], kobus: ["500"] },
  { id: "daejeon", name: "대전", region: "특별/광역시", tmoney: ["3455101", "3498701"], kobus: ["300"] },
  { id: "ulsan", name: "울산", region: "특별/광역시", tmoney: ["4472001", "4463201"], kobus: ["715"] },
  { id: "incheon", name: "인천", region: "경기/인천", tmoney: ["2224201"], kobus: ["100"] },
  { id: "sejong", name: "세종", region: "충청/세종", tmoney: ["3015401", "3010701"], kobus: ["352"] },
  { id: "suwon", name: "수원", region: "경기/인천", tmoney: ["1658501", "1640501"], kobus: ["110"] },
  { id: "seongnam", name: "성남", region: "경기/인천", tmoney: ["1349701"], kobus: ["120"] },
  { id: "yongin", name: "용인", region: "경기/인천", tmoney: ["1706301", "1709401"], kobus: ["150"] },
  { id: "anyang", name: "안양", region: "경기/인천", tmoney: ["1400601", "1399201"], kobus: ["135"] },
  { id: "bucheon", name: "부천", region: "경기/인천", tmoney: ["1454501"], kobus: ["101"] },
  { id: "ansan", name: "안산", region: "경기/인천", tmoney: ["1529901"], kobus: ["190"] },
  { id: "uijeongbu", name: "의정부", region: "경기/인천", tmoney: ["1174901"], kobus: ["170"] },
  { id: "guri", name: "구리", region: "경기/인천", tmoney: ["1194401"], kobus: ["169"] },
  { id: "goyang", name: "고양", region: "경기/인천", tmoney: ["1045001"], kobus: ["116"] },
  { id: "icheon", name: "이천", region: "경기/인천", tmoney: ["1737301"], kobus: ["160"] },
  { id: "yeoju", name: "여주", region: "경기/인천", tmoney: ["1263101"], kobus: ["140"] },
  { id: "anseong", name: "안성", region: "경기/인천", tmoney: ["1758501"], kobus: ["130"] },
  { id: "pyeongtaek", name: "평택", region: "경기/인천", tmoney: ["1791901"], kobus: ["180"] },
  { id: "osan", name: "오산", region: "경기/인천", tmoney: ["1813701"], kobus: ["127"] },
  { id: "siheung", name: "시흥", region: "경기/인천", tmoney: ["1506601"], kobus: ["195"] },
  { id: "pocheon", name: "포천", region: "경기/인천", tmoney: [], kobus: ["146"] },
  { id: "hogyedong", name: "호계동", region: "경기/인천", tmoney: ["1407701"], kobus: ["108"] },
  { id: "chuncheon", name: "춘천", region: "강원도", tmoney: ["2443501"], kobus: ["250"] },
  { id: "wonju", name: "원주", region: "강원도", tmoney: ["2638201"], kobus: ["240"] },
  { id: "gangneung", name: "강릉", region: "강원도", tmoney: ["2551901"], kobus: ["200"] },
  { id: "sokcho", name: "속초", region: "강원도", tmoney: ["2482701"], kobus: ["230"] },
  { id: "donghae", name: "동해", region: "강원도", tmoney: ["2573501"], kobus: ["210"] },
  { id: "samcheok", name: "삼척", region: "강원도", tmoney: ["2592901"], kobus: ["220"] },
  { id: "taebaek", name: "태백", region: "강원도", tmoney: ["2600701"], kobus: ["274"] },
  { id: "yeongwol", name: "영월", region: "강원도", tmoney: ["2623601"], kobus: ["272"] },
  { id: "jeongseon", name: "정선", region: "강원도", tmoney: ["2613201"], kobus: ["222"] },
  { id: "yangyang", name: "양양", region: "강원도", tmoney: ["2503101"], kobus: ["270"] },
  { id: "jumunjin", name: "주문진", region: "강원도", tmoney: ["2541901"], kobus: ["202"] },
  { id: "hoengseong", name: "횡성", region: "강원도", tmoney: ["2523401"], kobus: [] },
  { id: "hongcheon", name: "홍천", region: "강원도", tmoney: ["2513501"], kobus: [] },
  { id: "cheongju", name: "청주", region: "충청북도", tmoney: ["2839701", "2812001"], kobus: ["400"] },
  { id: "chungju", name: "충주", region: "충청북도", tmoney: ["2736001"], kobus: ["420"] },
  { id: "jecheon", name: "제천", region: "충청북도", tmoney: ["2716501"], kobus: ["450"] },
  { id: "jeungpyeong", name: "증평", region: "충청북도", tmoney: ["2793101"], kobus: ["455"] },
  { id: "boeun", name: "보은", region: "충청북도", tmoney: ["2891101"], kobus: ["409"] },
  { id: "goesan", name: "괴산", region: "충청북도", tmoney: ["2803301"], kobus: ["457"] },
  { id: "cheonan", name: "천안", region: "충청/세종", tmoney: ["3112001"], kobus: ["310"] },
  { id: "asan", name: "아산", region: "충청/세종", tmoney: ["3151704"], kobus: ["340"] },
  { id: "gongju", name: "공주", region: "충청/세종", tmoney: ["3258501"], kobus: ["320"] },
  { id: "nonsan", name: "논산", region: "충청/세종", tmoney: ["3295401"], kobus: ["370"] },
  { id: "seosan", name: "서산", region: "충청/세종", tmoney: ["3198101"], kobus: ["393"] },
  { id: "dangjin", name: "당진", region: "충청/세종", tmoney: ["3177101"], kobus: ["312"] },
  { id: "hongseong", name: "홍성", region: "충청/세종", tmoney: ["3222001"], kobus: ["389"] },
  { id: "boryeong", name: "보령", region: "충청/세종", tmoney: ["3345801"], kobus: ["395"] },
  { id: "taean", name: "태안", region: "충청/세종", tmoney: ["3214401"], kobus: ["394"] },
  { id: "yesan", name: "예산", region: "충청/세종", tmoney: ["3242801"], kobus: ["398"] },
  { id: "geumsan", name: "금산", region: "충청/세종", tmoney: ["3273501"], kobus: ["330"] },
  { id: "cheongyang", name: "청양", region: "충청/세종", tmoney: ["3332601"], kobus: ["391"] },
  { id: "anmyeondo", name: "안면도", region: "충청/세종", tmoney: ["3216401"], kobus: ["396"] },
  { id: "jeonju", name: "전주", region: "전라북도", tmoney: ["5493301"], kobus: ["602"] },
  { id: "gunsan", name: "군산", region: "전라북도", tmoney: ["5403701"], kobus: ["610"] },
  { id: "iksan", name: "익산", region: "전라북도", tmoney: ["5467401"], kobus: ["615"] },
  { id: "jeongeup", name: "정읍", region: "전라북도", tmoney: ["5615801"], kobus: ["630"] },
  { id: "namwon", name: "남원", region: "전라북도", tmoney: ["5576001"], kobus: ["625"] },
  { id: "gimje", name: "김제", region: "전라북도", tmoney: ["5437901"], kobus: ["620"] },
  { id: "buan", name: "부안", region: "전라북도", tmoney: ["5630801"], kobus: ["640"] },
  { id: "gochang", name: "고창", region: "전라북도", tmoney: ["5643301"], kobus: ["635"] },
  { id: "sunchang", name: "순창", region: "전라북도", tmoney: ["5603501"], kobus: ["645"] },
  { id: "jinan", name: "진안", region: "전라북도", tmoney: ["5543201"], kobus: ["650"] },
  { id: "mokpo", name: "목포", region: "전라남도", tmoney: ["5864201"], kobus: ["505"] },
  { id: "yeosu", name: "여수", region: "전라남도", tmoney: ["5971501"], kobus: ["510"] },
  { id: "suncheon", name: "순천", region: "전라남도", tmoney: ["5796001", "5794001"], kobus: ["515"] },
  { id: "gwangyang", name: "광양", region: "전라남도", tmoney: ["5775801"], kobus: ["520"] },
  { id: "naju", name: "나주", region: "전라남도", tmoney: ["5825501"], kobus: ["530"] },
  { id: "gangjin", name: "강진", region: "전라남도", tmoney: ["5923401"], kobus: ["535"] },
  { id: "goheung", name: "고흥", region: "전라남도", tmoney: ["5954001"], kobus: ["540"] },
  { id: "boseong", name: "보성", region: "전라남도", tmoney: ["5945801"], kobus: ["554"] },
  { id: "beolgyo", name: "벌교", region: "전라남도", tmoney: ["5942301"], kobus: ["555"] },
  { id: "muan", name: "무안", region: "전라남도", tmoney: ["5852401"], kobus: ["550"] },
  { id: "yeonggwang", name: "영광", region: "전라남도", tmoney: ["5704301"], kobus: ["560"] },
  { id: "yeongam", name: "영암", region: "전라남도", tmoney: ["5841101"], kobus: ["570"] },
  { id: "jangheung", name: "장흥", region: "전라남도", tmoney: ["5932401"], kobus: ["580"] },
  { id: "jangseong", name: "장성", region: "전라남도", tmoney: ["5721901"], kobus: ["583"] },
  { id: "hampyeong", name: "함평", region: "전라남도", tmoney: ["5715301"], kobus: ["581"] },
  { id: "haenam", name: "해남", region: "전라남도", tmoney: ["5903801"], kobus: ["595"] },
  { id: "jindo", name: "진도", region: "전라남도", tmoney: ["5892201"], kobus: ["590"] },
  { id: "wando", name: "완도", region: "전라남도", tmoney: ["5911401"], kobus: ["575"] },
  { id: "gurye", name: "구례", region: "전라남도", tmoney: ["5765401"], kobus: ["519"] },
  { id: "damyang", name: "담양", region: "전라남도", tmoney: ["5734401"], kobus: ["582"] },
  { id: "nokdong", name: "녹동", region: "전라남도", tmoney: ["5955501"], kobus: ["545"] },
  { id: "okgwa", name: "옥과", region: "전라남도", tmoney: ["5750401"], kobus: ["588"] },
  { id: "pohang", name: "포항", region: "경상북도", tmoney: ["3776001"], kobus: ["830"] },
  { id: "gyeongju", name: "경주", region: "경상북도", tmoney: ["3815701", "3815702"], kobus: ["815"] },
  { id: "gumi", name: "구미", region: "경상북도", tmoney: ["3923301"], kobus: ["810"] },
  { id: "gyeongsan", name: "경산", region: "경상북도", tmoney: ["3861901"], kobus: [] },
  { id: "sangju", name: "상주", region: "경상북도", tmoney: ["3718101"], kobus: ["825"] },
  { id: "yeongju", name: "영주", region: "경상북도", tmoney: ["3607801"], kobus: ["835"] },
  { id: "mungyeong", name: "문경", region: "경상북도", tmoney: ["3691701"], kobus: [] },
  { id: "jeomchon", name: "점촌", region: "경상북도", tmoney: ["3695102"], kobus: ["850"] },
  { id: "yecheon", name: "예천", region: "경상북도", tmoney: ["3682601"], kobus: ["851"] },
  { id: "yeongcheon", name: "영천", region: "경상북도", tmoney: ["3888501"], kobus: ["845"] },
  { id: "yeongdeok", name: "영덕", region: "경상북도", tmoney: ["3643101"], kobus: ["843"] },
  { id: "uljin", name: "울진", region: "경상북도", tmoney: ["3632601"], kobus: ["853"] },
  { id: "andong", name: "안동", region: "경상북도", tmoney: [], kobus: ["840"] },
  { id: "gimcheon", name: "김천", region: "경상북도", tmoney: ["3958601"], kobus: [] },
  { id: "yeonghae", name: "영해", region: "경상북도", tmoney: ["3641101"], kobus: ["842"] },
  { id: "pyeonghae", name: "평해", region: "경상북도", tmoney: ["3636601"], kobus: ["844"] },
  { id: "hupo", name: "후포", region: "경상북도", tmoney: ["3636901"], kobus: ["857"] },
  { id: "onjeong", name: "온정", region: "경상북도", tmoney: ["3635801"], kobus: ["856"] },
  { id: "changwon", name: "창원", region: "경상남도", tmoney: ["5139301"], kobus: ["710"] },
  { id: "masan", name: "마산", region: "경상남도", tmoney: ["5135601", "5175001"], kobus: ["705"] },
  { id: "jinju", name: "진주", region: "경상남도", tmoney: ["5275905"], kobus: ["722"] },
  { id: "jinhae", name: "진해", region: "경상남도", tmoney: ["5170301"], kobus: ["704"] },
  { id: "gimhae", name: "김해", region: "경상남도", tmoney: ["5093801"], kobus: ["735"] },
  { id: "tongyeong", name: "통영", region: "경상남도", tmoney: ["5302001"], kobus: ["730"] },
  { id: "geoje", name: "거제", region: "경상남도", tmoney: ["5325101"], kobus: [] },
  { id: "miryang", name: "밀양", region: "경상남도", tmoney: ["5042301"], kobus: [] },
  { id: "yangsan", name: "양산", region: "경상남도", tmoney: ["5062901"], kobus: [] },
  { id: "geochang", name: "거창", region: "경상남도", tmoney: ["5282201"], kobus: [] },
  { id: "hamyang", name: "함양", region: "경상남도", tmoney: ["5003901"], kobus: [] },
  { id: "sancheong", name: "산청", region: "경상남도", tmoney: ["5221801"], kobus: [] },
  { id: "hapcheon", name: "합천", region: "경상남도", tmoney: ["5023301"], kobus: [] },
  { id: "namhae", name: "남해", region: "경상남도", tmoney: ["5241401"], kobus: [] },
  { id: "sacheon", name: "사천", region: "경상남도", tmoney: ["5251801"], kobus: [] },
  { id: "hadong", name: "하동", region: "경상남도", tmoney: ["5232501"], kobus: [] },
  { id: "goseong-gn", name: "고성(경남)", region: "경상남도", tmoney: ["5293101"], kobus: [] },
];

// Region display order (metro first, then provinces roughly NW → SE).
const REGION_ORDER = [
  "특별/광역시",
  "경기/인천",
  "강원도",
  "충청북도",
  "충청/세종",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
];

export type BusCityRegionGroup = { region: string; cities: BusCity[] };

/** Cities grouped by region, regions in display order, names sorted (Korean). */
export function busCitiesByRegion(): BusCityRegionGroup[] {
  const map = new Map<string, BusCity[]>();
  for (const c of BUS_CITIES) {
    const arr = map.get(c.region);
    if (arr) arr.push(c);
    else map.set(c.region, [c]);
  }
  return REGION_ORDER.filter((r) => map.has(r)).map((r) => ({
    region: r,
    cities: map.get(r)!.sort((a, b) => a.name.localeCompare(b.name, "ko")),
  }));
}

const BY_ID = new Map(BUS_CITIES.map((c) => [c.id, c]));

export function busCityById(id: string): BusCity | undefined {
  return BY_ID.get(id);
}

/** Display label for a city. English uses the romanized slug (`id`). */
export function busCityLabel(
  city: { name: string; id: string } | undefined,
  lang: "ko" | "en",
): string {
  if (!city) return "";
  if (lang === "ko") return city.name;
  return city.id.charAt(0).toUpperCase() + city.id.slice(1);
}

/** Same as busCityLabel but resolved from a Korean city name (best-effort). */
export function busCityLabelByName(name: string, lang: "ko" | "en"): string {
  if (lang === "ko") return name;
  const c = BUS_CITIES.find((x) => x.name === name);
  return c ? busCityLabel(c, "en") : name;
}

const REGION_EN: Record<string, string> = {
  "특별/광역시": "Metro Cities",
  "경기/인천": "Gyeonggi/Incheon",
  강원도: "Gangwon",
  "충청/세종": "Chungcheong/Sejong",
  충청북도: "Chungbuk",
  전라남도: "Jeonnam",
  전라북도: "Jeonbuk",
  경상남도: "Gyeongnam",
  경상북도: "Gyeongbuk",
};

export function busRegionLabel(region: string, lang: "ko" | "en"): string {
  return lang === "ko" ? region : REGION_EN[region] ?? region;
}

const GRADE_EN: Record<string, string> = {
  일반: "Standard",
  우등: "Excellent",
  프리미엄: "Premium",
  고속: "Express",
};

/** Translate a KOBUS/tmoney seat grade. Handles the 심야 (late-night) prefix. */
export function busGradeLabel(grade: string, lang: "ko" | "en"): string {
  if (lang === "ko" || !grade) return grade;
  if (grade.startsWith("심야")) {
    const base = grade.slice(2);
    return `Late-night ${GRADE_EN[base] ?? base}`;
  }
  return GRADE_EN[grade] ?? grade;
}

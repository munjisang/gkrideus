/**
 * Pure label helpers — station / region / train-grade name localisation.
 *
 * This module has NO "use client" directive on purpose: server code
 * (e.g. the email route) needs to *call* these functions, and functions
 * exported from a "use client" module become client references that
 * throw when invoked server-side. `i18n.tsx` re-exports these for the
 * client; server callers import straight from here.
 */

export type Lang = "ko" | "en";

// ─────────────────────────────── station EN map (major)
const STATION_EN: Record<string, string> = {
  서울: "Seoul",
  용산: "Yongsan",
  영등포: "Yeongdeungpo",
  광명: "Gwangmyeong",
  수원: "Suwon",
  천안아산: "Cheonan-Asan",
  오송: "Osong",
  대전: "Daejeon",
  서대전: "Seodaejeon",
  익산: "Iksan",
  "김천(구미)": "Gimcheon-Gumi",
  김천구미: "Gimcheon-Gumi",
  동대구: "Dongdaegu",
  서대구: "Seodaegu",
  경주: "Gyeongju",
  "울산(통도사)": "Ulsan",
  부산: "Busan",
  구포: "Gupo",
  사상: "Sasang",
  광주송정: "Gwangju-Songjeong",
  목포: "Mokpo",
  전주: "Jeonju",
  순천: "Suncheon",
  여천: "Yeocheon",
  여수EXPO: "Yeosu-EXPO",
  "만종(원주)": "Manjong-Wonju",
  만종: "Manjong",
  원주: "Wonju",
  "진부(오대산)": "Jinbu",
  진부: "Jinbu",
  평창: "Pyeongchang",
  강릉: "Gangneung",
  영주: "Yeongju",
  안동: "Andong",
  동해: "Donghae",
  포항: "Pohang",
  수서: "Suseo",
};

// region tab labels (city names)
const REGION_EN: Record<string, string> = {
  서울: "Seoul",
  경기: "Gyeonggi",
  강원: "Gangwon",
  충북: "Chungbuk",
  충남: "Chungnam",
  전북: "Jeonbuk",
  전남: "Jeonnam",
  경북: "Gyeongbuk",
  경남: "Gyeongnam",
  부산: "Busan",
  대구: "Daegu",
  광주: "Gwangju",
  대전: "Daejeon",
  울산: "Ulsan",
  세종: "Sejong",
};

// train grade EN map
const GRADE_EN: Record<string, string> = {
  KTX: "KTX",
  "KTX-산천": "KTX-Sancheon",
  "KTX-이음": "KTX-Eum",
  "KTX-청룡": "KTX-Cheongnyong",
  SRT: "SRT",
  "ITX-청춘": "ITX-Cheongchun",
  "ITX-새마을": "ITX-Saemaul",
  새마을호: "Saemaul",
  무궁화호: "Mugunghwa",
};

// ─── Revised Romanization fallback (for stations not in STATION_EN) ───
const RR_CHO = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj",
  "ch", "k", "t", "p", "h",
];
const RR_JUNG = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe",
  "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const RR_JONG = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p",
  "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

/** Romanize a Korean string per Revised Romanization (no liaison rules —
 *  good enough for station labels). Non-Hangul passes through. */
export function romanize(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      out += RR_CHO[Math.floor(s / 588)];
      out += RR_JUNG[Math.floor((s % 588) / 28)];
      out += RR_JONG[s % 28];
    } else {
      out += ch;
    }
  }
  // Title-case each word/segment (split on space, hyphen, paren).
  return out.replace(/(^|[\s\-(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

export function stationLabel(korean: string, lang: Lang): string {
  if (lang === "ko") return korean;
  if (STATION_EN[korean]) return STATION_EN[korean];
  // Auto-romanize the long tail so EN mode never shows raw Hangul.
  return romanize(korean);
}

export function regionLabel(korean: string, lang: Lang): string {
  if (lang === "ko") return korean;
  return REGION_EN[korean] ?? korean;
}

export function gradeLabel(korean: string, lang: Lang): string {
  if (lang === "ko") return korean;
  if (GRADE_EN[korean]) return GRADE_EN[korean];
  // prefix fallback (e.g. "KTX-산천(A)") → keep base
  for (const k of Object.keys(GRADE_EN)) {
    if (korean.startsWith(k)) return GRADE_EN[k];
  }
  return korean;
}

/**
 * Country list shown in the booker-info form's residence-country picker.
 * `iso` is the persisted key (stored as Passenger.countryCode in the order).
 */
export type Country = {
  /** ISO-3166 alpha-2 — primary key stored on the order. */
  iso: string;
  /** Native flag emoji. */
  flag: string;
  /** Display name in Korean. */
  ko: string;
  /** Display name in English. */
  en: string;
};

export const COUNTRIES: Country[] = [
  { iso: "KR", flag: "🇰🇷", ko: "대한민국", en: "South Korea" },
  { iso: "US", flag: "🇺🇸", ko: "미국", en: "United States" },
  { iso: "JP", flag: "🇯🇵", ko: "일본", en: "Japan" },
  { iso: "CN", flag: "🇨🇳", ko: "중국", en: "China" },
  { iso: "HK", flag: "🇭🇰", ko: "홍콩", en: "Hong Kong" },
  { iso: "TW", flag: "🇹🇼", ko: "대만", en: "Taiwan" },
  { iso: "SG", flag: "🇸🇬", ko: "싱가포르", en: "Singapore" },
  { iso: "MY", flag: "🇲🇾", ko: "말레이시아", en: "Malaysia" },
  { iso: "TH", flag: "🇹🇭", ko: "태국", en: "Thailand" },
  { iso: "VN", flag: "🇻🇳", ko: "베트남", en: "Vietnam" },
  { iso: "PH", flag: "🇵🇭", ko: "필리핀", en: "Philippines" },
  { iso: "ID", flag: "🇮🇩", ko: "인도네시아", en: "Indonesia" },
  { iso: "IN", flag: "🇮🇳", ko: "인도", en: "India" },
  { iso: "GB", flag: "🇬🇧", ko: "영국", en: "United Kingdom" },
  { iso: "DE", flag: "🇩🇪", ko: "독일", en: "Germany" },
  { iso: "FR", flag: "🇫🇷", ko: "프랑스", en: "France" },
  { iso: "ES", flag: "🇪🇸", ko: "스페인", en: "Spain" },
  { iso: "IT", flag: "🇮🇹", ko: "이탈리아", en: "Italy" },
  { iso: "AU", flag: "🇦🇺", ko: "호주", en: "Australia" },
  { iso: "CA", flag: "🇨🇦", ko: "캐나다", en: "Canada" },
];

export function countryLabel(iso: string, lang: "ko" | "en"): string {
  const c = COUNTRIES.find((x) => x.iso === iso);
  if (!c) return iso;
  return `${c.flag} ${lang === "ko" ? c.ko : c.en}`;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { MAJOR_STATION_IDS, REGION_TAB_ORDER } from "../lib/majorStations";
import { loadRecent } from "../lib/recentStations";
import { useI18n, stationLabel, regionLabel } from "../lib/i18n";

type Station = { id: string; name: string };
type CityGroup = { cityCode: string; cityName: string; stations: Station[] };

type Props = {
  open: boolean;
  groups: CityGroup[] | null;
  onPick: (s: Station) => void;
  onClose: () => void;
};

type TabKey = "recent" | "major" | string;
const EXIT_MS = 220;

export default function StationPicker({ open, groups, onPick, onClose }: Props) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<TabKey>("major");
  const [recent, setRecent] = useState<Station[]>([]);
  const [query, setQuery] = useState("");

  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setAnimateIn(true));
    } else if (mounted) {
      setAnimateIn(false);
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (open) {
      const r = loadRecent();
      setRecent(r);
      setTab(r.length > 0 ? "recent" : "major");
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const allStations: Station[] = useMemo(
    () => (groups ? groups.flatMap((g) => g.stations) : []),
    [groups],
  );

  const majorStations: Station[] = useMemo(() => {
    if (!groups) return [];
    const byId = new Map<string, Station>();
    for (const g of groups) for (const s of g.stations) byId.set(s.id, s);
    return MAJOR_STATION_IDS.map((id) => byId.get(id)).filter((s): s is Station => !!s);
  }, [groups]);

  const stationsForTab: Station[] = useMemo(() => {
    if (tab === "recent") return recent;
    if (tab === "major") return majorStations;
    return groups?.find((g) => g.cityCode === tab)?.stations ?? [];
  }, [tab, recent, majorStations, groups]);

  // When user types in the search box, search across ALL stations regardless of tab.
  // Otherwise show whatever the current tab is filtered to.
  const list: Station[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stationsForTab;
    return allStations.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [query, stationsForTab, allStations]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          animateIn ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sheet panel */}
      <div
        className={`absolute left-0 right-0 bottom-0 mx-auto w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl sm:mb-6 overflow-hidden shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          animateIn ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ minHeight: "50vh", maxHeight: "85vh" }}
      >
        {/* Grabber on mobile */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Search input */}
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center gap-2 px-3 h-11 rounded-xl bg-slate-100 border border-transparent focus-within:border-slate-300 focus-within:bg-white transition">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-400 shrink-0"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("sp.searchPlaceholder")}
              className="flex-1 bg-transparent text-base placeholder-slate-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="w-6 h-6 grid place-items-center rounded-full bg-slate-300 text-white text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tabs — hidden while searching */}
        {!query.trim() && (
          <div className="border-b border-slate-100">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-4">
              <Tab active={tab === "recent"} onClick={() => setTab("recent")}>
                {t("sp.tab.recent")}
              </Tab>
              <Tab active={tab === "major"} onClick={() => setTab("major")}>
                {t("sp.tab.major")}
              </Tab>
              {REGION_TAB_ORDER.filter((r) =>
                groups?.some((g) => g.cityCode === r.code),
              ).map((r) => (
                <Tab key={r.code} active={tab === r.code} onClick={() => setTab(r.code)}>
                  {regionLabel(r.label, lang)}
                </Tab>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {!groups && (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">
              {t("sp.loading")}
            </div>
          )}
          {groups && list.length === 0 && (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">
              {query.trim()
                ? t("sp.noResult", { q: query.trim() })
                : tab === "recent"
                  ? t("sp.noRecent")
                  : t("sp.empty")}
            </div>
          )}
          <ul>
            {list.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onPick(s)}
                  className="w-full text-left flex items-center justify-between px-6 py-4 border-b border-slate-100 hover:bg-slate-50 active:bg-slate-100 transition"
                >
                  <Highlighted
                    text={`${stationLabel(s.name, lang)}${t("sp.stationSuffix")}`}
                    query={query}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) {
    return <span className="text-[17px] text-slate-900">{text}</span>;
  }
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) {
    return <span className="text-[17px] text-slate-900">{text}</span>;
  }
  return (
    <span className="text-[17px] text-slate-900">
      {text.slice(0, idx)}
      <mark className="bg-transparent text-sky-600 font-semibold">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium border transition ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

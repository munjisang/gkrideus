"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_TAB_ORDER } from "../lib/majorStations";
import { loadRecentRoutes, type RecentRoute } from "../lib/recentStations";
import { useI18n, stationLabel, regionLabel } from "../lib/i18n";

type Station = { id: string; name: string };
type CityGroup = { cityCode: string; cityName: string; stations: Station[] };

type Props = {
  open: boolean;
  groups: CityGroup[] | null;
  onPick: (s: Station) => void;
  onPickRoute?: (from: Station, to: Station) => void;
  onClose: () => void;
  // Desktop: anchor the panel below this element (the search card). Mobile
  // ignores it and uses the bottom sheet.
  anchorRef?: React.RefObject<HTMLElement | null>;
};

const EXIT_MS = 220;

// Stations surfaced in the "Suggested" tab, by Korean name.
const SUGGESTED_NAMES = ["서울", "부산", "강릉"];
// Sentinel tab value for the suggested / recent-searches tab.
const RECOMMEND_TAB = "__recommend__";

export default function StationPicker({
  open,
  groups,
  onPick,
  onPickRoute,
  onClose,
  anchorRef,
}: Props) {
  const { t, lang } = useI18n();
  const [routes, setRoutes] = useState<RecentRoute[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>(RECOMMEND_TAB);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

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
      setRoutes(loadRecentRoutes());
      setQuery("");
      setTab(RECOMMEND_TAB);
      if (anchorRef?.current) setRect(anchorRef.current.getBoundingClientRect());
    }
  }, [open, anchorRef]);

  // Track desktop breakpoint for anchored-popover vs bottom-sheet mode.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Re-measure the anchor on resize while open (keeps the popover aligned).
  useEffect(() => {
    if (!open || !anchorRef?.current) return;
    const update = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, anchorRef]);

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

  const suggested: Station[] = useMemo(() => {
    if (!groups) return [];
    const byName = new Map<string, Station>();
    for (const g of groups) for (const s of g.stations) byName.set(s.name, s);
    return SUGGESTED_NAMES.map((n) => byName.get(n)).filter(
      (s): s is Station => !!s,
    );
  }, [groups]);

  // Region tabs, in the curated order, limited to regions present in the data.
  const regions = useMemo(
    () => REGION_TAB_ORDER.filter((r) => groups?.some((g) => g.cityCode === r.code)),
    [groups],
  );
  const regionStations: Station[] = useMemo(
    () => groups?.find((g) => g.cityCode === tab)?.stations ?? [],
    [groups, tab],
  );

  // When searching, match against Korean name, station ID, and the English label.
  const results: Station[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allStations.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true;
      if (s.id.toLowerCase().includes(q)) return true;
      if (stationLabel(s.name, "en").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [query, allStations]);

  const searching = !!query.trim();

  if (!mounted) return null;

  // Desktop anchors the panel below the search card; mobile uses the bottom sheet.
  const anchored = isDesktop && !!rect;
  const panelW = rect ? Math.min(520, rect.width) : 520;
  const panelLeft = rect
    ? Math.max(16, Math.min(rect.left, window.innerWidth - panelW - 16))
    : 0;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop — dark on mobile, transparent click-catcher when anchored */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className={`absolute inset-0 transition-opacity duration-200 ${
          anchored ? "bg-transparent" : "bg-black/40"
        } ${animateIn ? "opacity-100" : "opacity-0"}`}
      />

      {/* Panel */}
      <div
        className={
          anchored
            ? `fixed bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200 ease-out ${
                animateIn ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
              }`
            : `absolute left-0 right-0 bottom-0 mx-auto w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl sm:mb-6 overflow-hidden shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                animateIn ? "translate-y-0" : "translate-y-full"
              }`
        }
        style={
          anchored && rect
            ? { top: rect.bottom + 8, left: panelLeft, width: panelW, maxHeight: "70vh" }
            : { minHeight: "50vh", maxHeight: "85vh" }
        }
      >
        {/* Grabber on mobile */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="mx-auto h-1 w-10 rounded-full bg-hairline" />
        </div>

        {/* Search input */}
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center gap-2 px-4 h-11 rounded-pill bg-parchment border border-transparent focus-within:border-action focus-within:bg-white transition">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ink-faint shrink-0"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("sp.searchPlaceholder")}
              className="flex-1 bg-transparent text-base text-ink placeholder-ink-faint focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="w-6 h-6 grid place-items-center rounded-full bg-chip text-white text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!groups && (
            <div className="px-6 py-10 text-center text-ink-faint text-sm">
              {t("sp.loading")}
            </div>
          )}

          {/* Search results */}
          {groups && searching && (
            <>
              {results.length === 0 ? (
                <div className="px-6 py-10 text-center text-ink-faint text-sm">
                  {t("sp.noResult", { q: query.trim() })}
                </div>
              ) : (
                <ul>
                  {results.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => onPick(s)}
                        className="w-full text-left flex items-center justify-between px-6 py-4 border-b border-divider hover:bg-parchment active:bg-pearl transition"
                      >
                        <Highlighted
                          text={`${stationLabel(s.name, lang)}${t("sp.stationSuffix")}`}
                          query={query}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* 추천 tab (suggested + recent) and region tabs (when not searching) */}
          {groups && !searching && (
            <div>
              {/* Tab row: 추천 + regions */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-3 border-b border-divider">
                <Tab
                  active={tab === RECOMMEND_TAB}
                  onClick={() => setTab(RECOMMEND_TAB)}
                >
                  {t("sp.recommended")}
                </Tab>
                {regions.map((r) => (
                  <Tab
                    key={r.code}
                    active={tab === r.code}
                    onClick={() => setTab(r.code)}
                  >
                    {regionLabel(r.label, lang)}
                  </Tab>
                ))}
              </div>

              {tab === RECOMMEND_TAB ? (
                <div className="pb-4">
                  {/* Suggested chips */}
                  <section className="px-5 pt-4">
                    <h3 className="text-[13px] font-semibold text-ink-faint mb-2.5">
                      {t("sp.popularRegions")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {suggested.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => onPick(s)}
                          className="inline-flex items-center gap-1.5 h-10 pl-3 pr-4 rounded-pill bg-parchment text-[15px] font-medium text-ink hover:bg-action/10 hover:text-action active:scale-95 transition"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-action shrink-0"
                            aria-hidden
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {stationLabel(s.name, lang)}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Recent searches */}
                  <section className="px-5 pt-6">
                    <h3 className="text-[13px] font-semibold text-ink-faint mb-1">
                      {t("sp.recentSearch")}
                    </h3>
                    {routes.length === 0 ? (
                      <p className="py-4 text-sm text-ink-faint">{t("sp.noRecent")}</p>
                    ) : (
                      <ul className="-mx-1">
                        {routes.map((r, i) => (
                          <li key={`${r.from.id}-${r.to.id}-${i}`}>
                            <button
                              onClick={() =>
                                onPickRoute
                                  ? onPickRoute(r.from, r.to)
                                  : onPick(r.from)
                              }
                              className="w-full text-left flex items-center gap-2.5 px-1 py-3.5 hover:bg-parchment active:bg-pearl rounded-lg transition"
                            >
                              <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-ink-faint shrink-0"
                                aria-hidden
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="M21 21l-4.3-4.3" />
                              </svg>
                              <span className="text-[17px] text-ink">
                                {stationLabel(r.from.name, lang)}
                                <span className="mx-2 text-ink-faint">→</span>
                                {stationLabel(r.to.name, lang)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              ) : (
                <ul>
                  {regionStations.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => onPick(s)}
                        className="w-full text-left flex items-center justify-between px-6 py-4 border-b border-divider hover:bg-parchment active:bg-pearl transition"
                      >
                        <span className="text-[17px] text-ink">
                          {`${stationLabel(s.name, lang)}${t("sp.stationSuffix")}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) {
    return <span className="text-[17px] text-ink">{text}</span>;
  }
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) {
    return <span className="text-[17px] text-ink">{text}</span>;
  }
  return (
    <span className="text-[17px] text-ink">
      {text.slice(0, idx)}
      <mark className="bg-transparent text-action font-semibold">
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
      className={`shrink-0 h-9 px-4 rounded-pill text-sm font-medium border transition active:scale-95 ${
        active
          ? "bg-action text-white border-action"
          : "bg-white text-ink-soft border-hairline hover:border-action"
      }`}
    >
      {children}
    </button>
  );
}

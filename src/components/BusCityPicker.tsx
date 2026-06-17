"use client";

import { useEffect, useMemo, useState } from "react";
import BottomSheet from "./BottomSheet";
import { useI18n } from "../lib/i18n";
import {
  busCitiesByRegion,
  busCityLabel,
  busRegionLabel,
  BUS_CITIES,
  type BusCity,
} from "../lib/busCities";
import { loadRecentBusRoutes, type RecentRoute } from "../lib/recentStations";

type Props = {
  open: boolean;
  onPick: (c: BusCity) => void;
  onPickRoute?: (from: BusCity, to: BusCity) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
};

// Cities surfaced in the "추천" tab, by Korean name.
const SUGGESTED_NAMES = ["서울", "부산", "광주", "대구", "대전"];
const RECOMMEND_TAB = "__recommend__";

export default function BusCityPicker({
  open,
  onPick,
  onPickRoute,
  onClose,
  anchorRef,
}: Props) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>(RECOMMEND_TAB);
  const [routes, setRoutes] = useState<RecentRoute[]>([]);

  const groups = useMemo(() => busCitiesByRegion(), []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTab(RECOMMEND_TAB);
      setRoutes(loadRecentBusRoutes());
    }
  }, [open]);

  const suggested = useMemo(() => {
    const byName = new Map<string, BusCity>();
    for (const c of BUS_CITIES) byName.set(c.name, c);
    return SUGGESTED_NAMES.map((n) => byName.get(n)).filter(
      (c): c is BusCity => !!c,
    );
  }, []);

  const regionCities =
    groups.find((g) => g.region === tab)?.cities ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return BUS_CITIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [query]);

  const searching = !!query.trim();

  // Resolve a stored recent route's city ids back to full BusCity objects.
  function cityById(id: string): BusCity | undefined {
    return BUS_CITIES.find((c) => c.id === id);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("bus.cityTitle")}
      anchorRef={anchorRef}
      desktopWidth={460}
      maxHeight="80vh"
    >
      {/* Search */}
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
            placeholder={t("bus.cityPh")}
            className="flex-1 bg-transparent text-base text-ink placeholder-ink-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="clear"
              className="w-6 h-6 grid place-items-center rounded-full bg-chip text-white text-[10px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {searching ? (
        results.length === 0 ? (
          <div className="px-6 py-10 text-center text-ink-faint text-sm">
            {t("sp.noResult", { q: query.trim() })}
          </div>
        ) : (
          <ul>
            {results.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onPick(c)}
                  className="w-full text-left flex items-center justify-between px-6 py-4 border-b border-divider hover:bg-parchment active:bg-pearl transition"
                >
                  <span className="text-[17px] text-ink">{busCityLabel(c, lang)}</span>
                  <span className="text-xs text-ink-faint">{busRegionLabel(c.region, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {/* Tab row: 추천 + regions */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-3 border-b border-divider">
            <Tab
              active={tab === RECOMMEND_TAB}
              onClick={() => setTab(RECOMMEND_TAB)}
            >
              {t("sp.recommended")}
            </Tab>
            {groups.map((g) => (
              <Tab
                key={g.region}
                active={tab === g.region}
                onClick={() => setTab(g.region)}
              >
                {busRegionLabel(g.region, lang)}
              </Tab>
            ))}
          </div>

          {tab === RECOMMEND_TAB ? (
            <div className="pb-4">
              {/* Popular city chips */}
              <section className="px-5 pt-4">
                <h3 className="text-[13px] font-semibold text-ink-faint mb-2.5">
                  {t("bus.popularCities")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {suggested.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onPick(c)}
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
                      {busCityLabel(c, lang)}
                    </button>
                  ))}
                </div>
              </section>

              {/* Recent searched routes */}
              <section className="px-5 pt-6">
                <h3 className="text-[13px] font-semibold text-ink-faint mb-1">
                  {t("bus.recentSearch")}
                </h3>
                {routes.length === 0 ? (
                  <p className="py-4 text-sm text-ink-faint">{t("bus.noRecent")}</p>
                ) : (
                  <ul className="-mx-1">
                    {routes.map((r, i) => (
                      <li key={`${r.from.id}-${r.to.id}-${i}`}>
                        <button
                          onClick={() => {
                            const f = cityById(r.from.id);
                            const tt = cityById(r.to.id);
                            if (f && tt && onPickRoute) onPickRoute(f, tt);
                            else if (f) onPick(f);
                          }}
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
                            {busCityLabel(r.from, lang)}
                            <span className="mx-2 text-ink-faint">→</span>
                            {busCityLabel(r.to, lang)}
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
              {regionCities.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onPick(c)}
                    className="w-full text-left flex items-center px-6 py-4 border-b border-divider hover:bg-parchment active:bg-pearl transition"
                  >
                    <span className="text-[17px] text-ink">{busCityLabel(c, lang)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </BottomSheet>
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
      type="button"
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

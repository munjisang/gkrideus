"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import { COUNTRIES, type Country } from "../lib/countries";
import { useI18n } from "../lib/i18n";

type Props = {
  open: boolean;
  /** Currently selected ISO code (empty string = no selection). */
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
};

/** Case-insensitive normaliser. Treats whitespace as a soft separator
 *  so "south korea" matches "South Korea" / "대한민국" both ways. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export default function CountryPicker({ open, value, onPick, onClose }: Props) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset search and focus the field whenever the sheet opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      // Defer focus to after the slide-in animation.
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Pre-sort the list once per language so users see alphabetical order.
  const sorted = useMemo(() => {
    return [...COUNTRIES].sort((a, b) =>
      (lang === "ko" ? a.ko : a.en).localeCompare(
        lang === "ko" ? b.ko : b.en,
        lang === "ko" ? "ko" : "en",
      ),
    );
  }, [lang]);

  const filtered: Country[] = useMemo(() => {
    const q = norm(query);
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        norm(c.ko).includes(q) ||
        norm(c.en).includes(q) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("ord.country")}>
      {/* Search input */}
      <div className="px-5 pt-1 pb-3 sticky top-0 bg-white z-10">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ord.country.searchPh")}
            className="field-pill w-full h-11 pl-10 pr-4 text-sm"
            aria-label={t("ord.country.searchPh")}
          />
        </div>
      </div>

      {/* List */}
      <ul className="px-2 pb-4">
        {filtered.length === 0 ? (
          <li className="px-3 py-10 text-center text-sm text-ink-faint">
            {t("sp.noResult", { q: query })}
          </li>
        ) : (
          filtered.map((c) => {
            const active = c.iso === value;
            return (
              <li key={c.iso}>
                <button
                  type="button"
                  onClick={() => onPick(c.iso)}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-left transition active:scale-95 ${
                    active
                      ? "bg-action/5 text-action"
                      : "text-ink hover:bg-parchment"
                  }`}
                >
                  <span className="text-sm font-medium">
                    {lang === "ko" ? c.ko : c.en}
                  </span>
                  {active && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </BottomSheet>
  );
}

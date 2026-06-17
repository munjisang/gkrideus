"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n, type Lang } from "../lib/i18n";

const GROUNDK_LOGO =
  "https://www.groundk.co.kr/ko/images/common/img_header_logo.png";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Routes with their own page-level sub-header — hide the global one.
  const hideHeader =
    pathname === "/search" ||
    pathname === "/order" ||
    pathname === "/order/complete" ||
    pathname.startsWith("/bookings");
  // Home overlays a transparent nav on top of its full-bleed hero.
  const isHome = pathname === "/";
  const { lang, setLang, t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">
      {!hideHeader && (
        <header
          className={
            isHome
              ? "absolute inset-x-0 top-0 z-30"
              : "sticky top-0 z-30 frosted border-b border-hairline"
          }
        >
          <div
            className={`${
              isHome
                ? "mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12"
                : "mx-4 sm:mx-6 lg:mx-[470px]"
            } h-[60px] flex items-center justify-between gap-3`}
          >
            {/* Left: logo */}
            <Link href="/" className="flex items-center min-w-0" aria-label="GroundK">
              <Image
                src={GROUNDK_LOGO}
                alt="GroundK"
                width={69}
                height={20}
                className={`h-5 w-auto ${isHome ? "brightness-0 invert" : ""}`}
                priority
                unoptimized
              />
            </Link>

            {/* Right: language · find booking · sign in */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <LangDropdown
                lang={lang}
                setLang={setLang}
                label={t("nav.langMenu")}
                onDark={isHome}
              />
              <Link
                href="/bookings"
                className={`inline-flex items-center h-8 px-3.5 rounded-pill text-[13px] font-semibold active:scale-95 transition-transform ${
                  isHome ? "bg-white text-ink" : "bg-ink text-white"
                }`}
              >
                {t("nav.bookingSearch")}
              </Link>
            </div>
          </div>
        </header>
      )}
      <main className={`flex-1 relative ${isHome ? "bg-white" : "bg-parchment"}`}>
        {children}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────── Language dropdown */

const LANG_OPTIONS: { code: Lang; flag: string; label: string }[] = [
  { code: "ko", flag: "🇰🇷", label: "KO" },
  { code: "en", flag: "🇺🇸", label: "EN" },
];

function LangDropdown({
  lang,
  setLang,
  label,
  onDark = false,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  label: string;
  onDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapRef, () => setOpen(false));

  const current = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-pill border text-[12px] font-semibold active:scale-95 transition-transform ${
          onDark
            ? "border-white/30 bg-white/10 text-white backdrop-blur-sm"
            : "border-hairline bg-white text-ink"
        }`}
      >
        <span aria-hidden className="text-base leading-none">
          {current.flag}
        </span>
        <span>{current.label}</span>
        <svg
          className={onDark ? "text-white/70" : "text-ink-faint"}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[96px] py-1 rounded-card border border-hairline bg-white shadow-lg overflow-hidden"
        >
          {LANG_OPTIONS.map((o) => {
            const active = o.code === lang;
            return (
              <li key={o.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setLang(o.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold transition ${
                    active
                      ? "bg-ink text-white"
                      : "text-ink hover:bg-parchment"
                  }`}
                >
                  <span aria-hidden className="text-base leading-none">
                    {o.flag}
                  </span>
                  <span>{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── Helpers */

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) handler();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handler();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, handler]);
}

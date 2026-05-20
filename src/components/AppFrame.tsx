"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n, type Lang } from "../lib/i18n";

const GROUNDK_LOGO =
  "https://www.groundk.co.kr/ko/images/common/img_header_logo.png";
const AVATAR_URL = "https://admin.rideus.net/images/avatar.png";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Routes with their own page-level sub-header — hide the global one.
  const hideHeader = pathname === "/search" || pathname === "/order";
  const { lang, setLang, t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {!hideHeader && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="mx-4 sm:mx-6 lg:mx-[470px] py-3 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center min-w-0" aria-label="GroundK">
              <Image
                src={GROUNDK_LOGO}
                alt="GroundK"
                width={96}
                height={28}
                className="h-7 w-auto"
                priority
                unoptimized
              />
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <LangDropdown lang={lang} setLang={setLang} label={t("nav.langMenu")} />
              <ProfileMenu
                myBookingsLabel={t("nav.myBookings")}
                adminLabel={t("nav.admin")}
                ariaLabel={t("nav.profileMenu")}
              />
            </div>
          </div>
        </header>
      )}
      <main className="flex-1 relative bg-slate-50">{children}</main>
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
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  label: string;
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
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:border-slate-300 transition"
      >
        <span aria-hidden className="text-base leading-none">
          {current.flag}
        </span>
        <span>{current.label}</span>
        <svg
          className="text-slate-400"
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
          className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[96px] py-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden"
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
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
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

/* ─────────────────────────────────────────── Profile avatar menu */

function ProfileMenu({
  myBookingsLabel,
  adminLabel,
  ariaLabel,
}: {
  myBookingsLabel: string;
  adminLabel: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapRef, () => setOpen(false));

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="block w-8 h-8 rounded-full overflow-hidden border border-slate-200 bg-slate-100 hover:border-slate-300 transition"
      >
        <Image
          src={AVATAR_URL}
          alt=""
          width={32}
          height={32}
          className="w-full h-full object-cover"
          unoptimized
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[140px] py-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden"
        >
          {/* TODO: replace href once the 예매내역 page is built. */}
          <Link
            role="menuitem"
            href="#"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            {myBookingsLabel}
          </Link>
          <Link
            role="menuitem"
            href="/admin"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            {adminLabel}
          </Link>
        </div>
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

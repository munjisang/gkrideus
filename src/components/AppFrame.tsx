"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "../lib/i18n";

const RIDEUS_LOGO = "/rideusLogo.webp";
// Cross-site hubs of the unified K.Rideus site. This app IS the
// "시외 이동(City to City)" service, so that item is the current page. The other
// hubs are the static K.Rideus prototype, served from public/ (symlinked).
type NavItem = {
  key: string;
  ko: string;
  en: string;
  href: string;
  current?: boolean;
  external?: boolean; // static/cross-site → full navigation via <a>
};
const NAV_ITEMS: NavItem[] = [
  { key: "movement", ko: "공항", en: "Airport", href: "/prototype/movement/index.html", external: true },
  { key: "city2city", ko: "시외 이동", en: "City to City", href: "/city", current: true },
  { key: "travel", ko: "여행", en: "Travel", href: "/prototype/travel/index.html", external: true },
  { key: "event", ko: "이벤트", en: "Events", href: "/prototype/event/index.html", external: true },
];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Routes with their own page-level sub-header — hide the global one.
  const hideHeader =
    pathname === "/search" ||
    pathname.startsWith("/order") ||
    pathname === "/bus" ||
    pathname.startsWith("/bookings");

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">
      {!hideHeader && <RideusNav />}
      <main className="flex-1 relative bg-white">{children}</main>
    </div>
  );
}

/* ─────────────────────────── K.Rideus unified GNB */

function RideusNav() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const isKo = lang === "ko";

  const menuLabel = (it: NavItem) => (isKo ? it.ko : it.en);

  const NavLink = ({ it, drawer }: { it: NavItem; drawer?: boolean }) => {
    const cls = drawer
      ? `py-3.5 px-1 text-[1.05rem] font-semibold border-b border-[#F2F3F4] ${
          it.current ? "text-[#2C51DB]" : "text-[#1B2027]"
        }`
      : `py-2 transition-colors ${
          it.current
            ? "text-[#1B2027] font-semibold"
            : "text-[#5C6675] hover:text-[#1B2027]"
        }`;
    const onClick = drawer ? () => setOpen(false) : undefined;
    return it.external ? (
      <a href={it.href} className={cls} onClick={onClick}>
        {menuLabel(it)}
      </a>
    ) : (
      <Link
        href={it.href}
        aria-current={it.current ? "page" : undefined}
        className={cls}
        onClick={onClick}
      >
        {menuLabel(it)}
      </Link>
    );
  };

  return (
    <header
      className="sticky top-0 z-[60] bg-[rgba(255,255,255,0.86)] backdrop-blur-md backdrop-saturate-150"
      style={{ WebkitBackdropFilter: "saturate(140%) blur(12px)" }}
    >
      <div className="mx-auto max-w-[1280px] flex items-center gap-4 md:gap-11 py-5 px-6 sm:px-10 lg:px-14">
        {/* Brand */}
        <Link href="/" className="inline-flex items-center shrink-0" aria-label="K.Rideus">
          <Image
            src={RIDEUS_LOGO}
            alt="K.Rideus"
            width={117}
            height={28}
            className="h-7 w-auto block"
            priority
            unoptimized
          />
        </Link>

        {/* Desktop menu */}
        <nav className="hidden md:flex gap-8 text-[0.95rem]">
          {NAV_ITEMS.map((it) => (
            <NavLink key={it.key} it={it} />
          ))}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2 text-[#5C6675]">
          {/* Language chip (KR / EN) */}
          <span
            role="group"
            aria-label="언어"
            className="hidden md:flex items-center gap-0.5 bg-[#F2F3F4] rounded-full p-1 text-[0.78rem] font-semibold"
          >
            <button
              type="button"
              onClick={() => setLang("ko")}
              className={`px-3 py-1 rounded-full transition ${
                isKo ? "bg-white text-[#2C51DB]" : "text-[#97A0AC]"
              }`}
            >
              KR
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-3 py-1 rounded-full transition ${
                !isKo ? "bg-white text-[#2C51DB]" : "text-[#97A0AC]"
              }`}
            >
              EN
            </button>
          </span>

          {/* Search */}
          <button
            type="button"
            aria-label="검색"
            className="hidden md:grid w-10 h-10 place-items-center rounded-full hover:bg-[#F2F3F4] transition"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
          </button>

          {/* Burger (mobile) */}
          <button
            type="button"
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex md:hidden flex-col items-center justify-center gap-[5px] w-[42px] h-[42px]"
          >
            <span
              className={`block w-[22px] h-[2px] rounded-sm bg-[#1B2027] transition-transform ${
                open ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`block w-[22px] h-[2px] rounded-sm bg-[#1B2027] transition-opacity ${
                open ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-[22px] h-[2px] rounded-sm bg-[#1B2027] transition-transform ${
                open ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden flex flex-col max-w-[1280px] mx-auto px-6 pb-4 pt-1">
          {NAV_ITEMS.map((it) => (
            <NavLink key={it.key} it={it} drawer />
          ))}
          <span
            role="group"
            aria-label="언어"
            className="inline-flex self-start mt-3.5 items-center gap-0.5 bg-[#F2F3F4] rounded-full p-1 text-[0.78rem] font-semibold"
          >
            <button
              type="button"
              onClick={() => setLang("ko")}
              className={`px-3 py-1 rounded-full transition ${
                isKo ? "bg-white text-[#2C51DB]" : "text-[#97A0AC]"
              }`}
            >
              KR
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-3 py-1 rounded-full transition ${
                !isKo ? "bg-white text-[#2C51DB]" : "text-[#97A0AC]"
              }`}
            >
              EN
            </button>
          </span>
        </div>
      )}
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "../lib/i18n";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onAdmin = pathname.startsWith("/admin");
  // Routes with their own page-level sub-header — hide the global one.
  const hideHeader = pathname === "/search" || pathname === "/order";
  const { lang, setLang, t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {!hideHeader && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="mx-4 sm:mx-6 lg:mx-[470px] py-3 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 min-w-0">
              <span aria-hidden className="block w-1 h-5 rounded-sm bg-sky-700 shrink-0" />
              <span className="text-[15px] sm:text-base font-bold text-slate-900 truncate">
                {onAdmin ? (lang === "ko" ? "주문 내역" : "Orders") : t("app.title")}
              </span>
            </Link>
            <div className="flex items-center gap-3 shrink-0">
              <LangToggle lang={lang} setLang={setLang} />
              {onAdmin ? (
                <Link
                  href="/"
                  className="text-[13px] sm:text-sm font-medium text-slate-500 hover:text-slate-900 transition"
                >
                  {t("nav.book")}
                </Link>
              ) : (
                <Link
                  href="/admin"
                  className="text-[13px] sm:text-sm font-medium text-slate-500 hover:text-slate-900 transition"
                >
                  {t("nav.admin")}
                </Link>
              )}
            </div>
          </div>
        </header>
      )}
      <main className="flex-1 relative bg-slate-50">{children}</main>
    </div>
  );
}

function LangToggle({
  lang,
  setLang,
}: {
  lang: "ko" | "en";
  setLang: (l: "ko" | "en") => void;
}) {
  return (
    <div className="flex items-center rounded-full border border-slate-200 overflow-hidden text-[12px] font-semibold">
      {(["ko", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 transition ${
            lang === l
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-500 hover:text-slate-900"
          }`}
        >
          {l === "ko" ? "KO" : "EN"}
        </button>
      ))}
    </div>
  );
}

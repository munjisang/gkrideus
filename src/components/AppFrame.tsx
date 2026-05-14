"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onAdmin = pathname.startsWith("/admin");
  // Routes with their own page-level sub-header — hide the global one.
  const hideHeader = pathname === "/search" || pathname === "/order";

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {!hideHeader && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="mx-4 sm:mx-6 lg:mx-[470px] py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span aria-hidden className="block w-1 h-5 rounded-sm bg-sky-700" />
              <span className="text-[15px] sm:text-base font-bold text-slate-900">
                {onAdmin ? "주문 내역" : "KORAIL 승차권 예매"}
              </span>
            </Link>
            {onAdmin ? (
              <Link
                href="/"
                className="text-[13px] sm:text-sm font-medium text-slate-500 hover:text-slate-900 transition"
              >
                예매하기
              </Link>
            ) : (
              <Link
                href="/admin"
                className="text-[13px] sm:text-sm font-medium text-slate-500 hover:text-slate-900 transition"
              >
                관리자
              </Link>
            )}
          </div>
        </header>
      )}
      <main className="flex-1 relative bg-slate-50">{children}</main>
    </div>
  );
}

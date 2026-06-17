"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SearchLoading from "../../components/SearchLoading";
import { useI18n, type Lang } from "../../lib/i18n";
import { busCityById, busCityLabel, busGradeLabel } from "../../lib/busCities";

type BusRun = {
  mode: "intercity" | "express";
  routeId: string;
  departTime: string;
  operator: string;
  grade: string;
  fare: number | null;
  remaining: number | null;
  total: number | null;
  departName: string;
  arriveName: string;
};

type Resp =
  | { ok: true; count: number; runs: BusRun[] }
  | { ok: false; error: string };

function krw(n: number, lang: Lang): string {
  return lang === "ko"
    ? `${n.toLocaleString("ko-KR")}원`
    : `₩${n.toLocaleString("en-US")}`;
}

function fmtDate(yyyymmdd: string): string {
  if (yyyymmdd.length < 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

type BusType = "all" | "intercity" | "express";
const TYPE_OPTS: { key: BusType; tkey: string }[] = [
  { key: "all", tkey: "sr.optAll" },
  { key: "intercity", tkey: "bus.intercity" },
  { key: "express", tkey: "bus.express" },
];

type DepPeriod = "all" | "morning" | "afternoon" | "evening";
const DEP_PERIOD_OPTS: { key: DepPeriod; tkey: string }[] = [
  { key: "all", tkey: "sr.optAll" },
  { key: "morning", tkey: "sr.timeMorning" },
  { key: "afternoon", tkey: "sr.timeAfternoon" },
  { key: "evening", tkey: "sr.timeEvening" },
];

export default function BusSearchView() {
  const router = useRouter();
  const sp = useSearchParams();
  const { t, lang } = useI18n();

  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const date = sp.get("date") ?? "";
  const fromName = busCityLabel(busCityById(from), lang) || from;
  const toName = busCityLabel(busCityById(to), lang) || to;

  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const [busType, setBusType] = useState<BusType>("all");
  const [grade, setGrade] = useState<string>("all");
  const [depPeriod, setDepPeriod] = useState<DepPeriod>("all");
  const [hideSoldOut, setHideSoldOut] = useState(false);

  useEffect(() => {
    if (!from || !to || !date) {
      setLoading(false);
      setData({ ok: false, error: t("sr.searchAgain") });
      return;
    }
    setLoading(true);
    const q = new URLSearchParams({ from, to, date });
    fetch(`/api/bus/search?${q.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        try {
          return JSON.parse(text) as Resp;
        } catch {
          throw new Error(t("sr.serverError"));
        }
      })
      .then(setData)
      .catch((e: Error) => setData({ ok: false, error: e.message }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, date]);

  const runs = data?.ok ? data.runs : [];

  // Distinct seat grades present in the results (e.g. 우등 / 심야우등 / 프리미엄).
  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) if (r.grade) set.add(r.grade);
    return [...set];
  }, [runs]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (busType !== "all" && r.mode !== busType) return false;
      if (grade !== "all" && r.grade !== grade) return false;
      const hour = Number(r.departTime.slice(0, 2));
      if (depPeriod === "morning" && !(hour >= 0 && hour <= 11)) return false;
      if (depPeriod === "afternoon" && !(hour >= 12 && hour <= 17)) return false;
      if (depPeriod === "evening" && !(hour >= 18 && hour <= 23)) return false;
      if (hideSoldOut && r.remaining != null && r.remaining <= 0) return false;
      return true;
    });
  }, [runs, busType, grade, depPeriod, hideSoldOut]);

  function onPick(r: BusRun) {
    if (r.fare == null) return; // can't checkout without a fare
    const params = new URLSearchParams({
      mode: r.mode,
      routeId: r.routeId,
      departTime: r.departTime,
      operator: r.operator,
      grade: r.grade,
      fare: String(r.fare),
      date,
      from,
      to,
      departName: r.departName,
      arriveName: r.arriveName,
    });
    router.push(`/order/bus?${params.toString()}`);
  }

  if (loading) {
    return <SearchLoading from={fromName} to={toName} />;
  }

  return (
    <div className="bg-white min-h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl backdrop-saturate-150 border-b border-hairline">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 flex items-center py-3">
          <Link
            href="/city"
            className="h-10 w-10 grid place-items-center text-ink -ml-1 active:scale-95 transition"
            aria-label={t("back")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="flex-1 text-center text-base font-bold tracking-tight text-ink">
            {fromName}
            <span className="mx-1 text-ink-faint">→</span>
            {toName}
          </h1>
          <span className="w-10" />
        </div>
      </div>

      {/* Filter sidebar + results */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 pt-8 pb-3 lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 lg:items-start">
        {/* Left filter panel */}
        <aside className="lg:sticky lg:top-[90px] space-y-4">
          <div className="card-apple overflow-hidden">
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <div className="flex items-center gap-1.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-action" aria-hidden>
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                <h3 className="text-sm font-bold tracking-tight text-ink">
                  {t("sr.searchFilter")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBusType("all");
                  setGrade("all");
                  setDepPeriod("all");
                  setHideSoldOut(false);
                }}
                className="text-xs font-semibold text-ink-faint transition-colors hover:text-action"
              >
                {t("sr.reset")}
              </button>
            </div>

            {/* date */}
            <div className="border-b border-divider px-4 py-3">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft tabular-nums">
                {fmtDate(date)}
              </div>
            </div>

            {/* hide sold-out */}
            <div className="border-b border-divider px-4 py-3">
              <label className="flex cursor-pointer select-none items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={hideSoldOut}
                  onChange={(e) => setHideSoldOut(e.target.checked)}
                  className="h-4 w-4 rounded accent-action"
                />
                <span className="text-sm font-medium text-ink">
                  {t("sr.hideSoldOut")}
                </span>
              </label>
            </div>

            {/* bus type */}
            <div className="border-b border-divider px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("bus.typeTitle")}
              </h4>
              <div className="space-y-1">
                {TYPE_OPTS.map((opt) => {
                  const active = busType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setBusType(opt.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? "bg-action/10 font-semibold text-action"
                          : "font-medium text-ink-soft hover:bg-parchment"
                      }`}
                    >
                      {t(opt.tkey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* seat grade (only when results expose grades) */}
            {grades.length > 0 && (
              <div className="border-b border-divider px-4 py-3">
                <h4 className="mb-2 text-xs font-bold text-ink-soft">
                  {t("bus.gradeTitle")}
                </h4>
                <div className="space-y-1">
                  {[{ key: "all", label: t("sr.optAll") }, ...grades.map((g) => ({ key: g, label: busGradeLabel(g, lang) }))].map(
                    (opt) => {
                      const active = grade === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setGrade(opt.key)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                            active
                              ? "bg-action/10 font-semibold text-action"
                              : "font-medium text-ink-soft hover:bg-parchment"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {/* departure time */}
            <div className="px-4 py-3">
              <h4 className="mb-2 text-xs font-bold text-ink-soft">
                {t("sr.depTimeTitle")}
              </h4>
              <div className="space-y-1">
                {DEP_PERIOD_OPTS.map((opt) => {
                  const active = depPeriod === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setDepPeriod(opt.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? "bg-action/10 font-semibold text-action"
                          : "font-medium text-ink-soft hover:bg-parchment"
                      }`}
                    >
                      {t(opt.tkey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Right column */}
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-ink">
            {t("sr.legOutbound")}
          </h2>
          <div className="mt-3 border-t border-hairline" />

          {data?.ok && (
            <div className="pt-3 text-sm font-semibold text-ink-soft">
              {t("sr.resultLabel")}{" "}
              <span className="text-action tabular-nums">
                {t("bus.resultCount", { n: filtered.length })}
              </span>
            </div>
          )}

          <div className="pt-3 pb-10">
            {data && !data.ok && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-card px-4 py-3 text-sm">
                {data.error}
              </div>
            )}

            {data?.ok && filtered.length === 0 && (
              <div className="py-16 text-center text-sm text-ink-soft">
                {t("bus.none")}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {filtered.map((r, i) => {
                const soldOut = r.remaining != null && r.remaining <= 0;
                const express = r.mode === "express";
                const clickable = !soldOut && r.fare != null;
                return (
                  <button
                    key={`${r.mode}-${r.routeId}-${r.departTime}-${i}`}
                    type="button"
                    onClick={clickable ? () => onPick(r) : undefined}
                    disabled={!clickable}
                    style={{ borderLeft: "3px solid #1D4ED8" }}
                    className={`flex items-center justify-between gap-4 rounded-xl border border-hairline bg-white p-5 text-left transition ${
                      clickable
                        ? "hover:border-action active:scale-[0.99]"
                        : "opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                            express
                              ? "bg-action/10 text-action"
                              : "bg-parchment text-ink-soft"
                          }`}
                        >
                          {express ? t("bus.express") : t("bus.intercity")}
                        </span>
                        <span className="text-2xl font-bold tabular-nums text-ink">
                          {r.departTime}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {r.grade && (
                          <span className="rounded-pill bg-parchment px-2 py-0.5 text-xs font-semibold text-ink-soft">
                            {busGradeLabel(r.grade, lang)}
                          </span>
                        )}
                        <span className="text-sm text-ink-soft truncate">
                          {r.operator}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-ink-faint truncate">
                        {fromName}
                        <span className="mx-1">→</span>
                        {toName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.fare != null && (
                        <div className="text-lg font-bold tabular-nums text-ink">
                          {krw(r.fare, lang)}
                        </div>
                      )}
                      <div
                        className={`text-xs ${
                          soldOut ? "text-red-600 font-semibold" : "text-ink-faint"
                        }`}
                      >
                        {soldOut
                          ? t("bus.soldOut")
                          : r.remaining != null
                            ? t("bus.remaining", { n: r.remaining })
                            : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

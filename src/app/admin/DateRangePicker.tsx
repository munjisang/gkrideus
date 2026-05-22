"use client";

/**
 * Two-month date-range picker with quick presets, used by the admin
 * 예매내역 filter bar. Renders as a popover — the caller wraps it in a
 * `relative` container and positions it; this component only draws the
 * panel + a transparent backdrop for click-outside.
 */
import { useMemo, useState } from "react";

export type DateRange = { start: string | null; end: string | null };

type Props = {
  value: DateRange;
  onApply: (range: DateRange) => void;
  onClose: () => void;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* ─────────────── date helpers (all local-time, day granularity) */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* ─────────────── presets */

type Preset = { id: string; label: string; range: DateRange };

function buildPresets(): Preset[] {
  const today = startOfDay(new Date());
  const y = today.getFullYear();
  const m = today.getMonth();
  const r = (a: Date, b: Date): DateRange => ({ start: ymd(a), end: ymd(b) });
  const weekStart = addDays(today, -today.getDay()); // Sunday
  return [
    { id: "today", label: "오늘", range: r(today, today) },
    {
      id: "yesterday",
      label: "어제",
      range: r(addDays(today, -1), addDays(today, -1)),
    },
    { id: "last7", label: "지난 7일", range: r(addDays(today, -6), today) },
    { id: "last30", label: "지난 30일", range: r(addDays(today, -29), today) },
    {
      id: "thisMonth",
      label: "이번달",
      range: r(new Date(y, m, 1), new Date(y, m + 1, 0)),
    },
    {
      id: "lastMonth",
      label: "지난달",
      range: r(new Date(y, m - 1, 1), new Date(y, m, 0)),
    },
    {
      id: "thisYear",
      label: "올해",
      range: r(new Date(y, 0, 1), new Date(y, 11, 31)),
    },
    {
      id: "thisWeek",
      label: "이번주",
      range: r(weekStart, addDays(weekStart, 6)),
    },
  ];
}

/** Grid cells for one month — leading/trailing blanks as null. */
function monthCells(year: number, month: number): (Date | null)[] {
  const lead = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DateRangePicker({ value, onApply, onClose }: Props) {
  const presets = useMemo(buildPresets, []);
  const todayStr = ymd(startOfDay(new Date()));

  const [draft, setDraft] = useState<DateRange>(value);
  const seed = value.start ? parseYmd(value.start) : new Date();
  const [view, setView] = useState({
    y: seed.getFullYear(),
    m: seed.getMonth(),
  });

  function pick(d: Date) {
    const s = ymd(d);
    if (!draft.start || draft.end) {
      setDraft({ start: s, end: null });
    } else if (s < draft.start) {
      setDraft({ start: s, end: null });
    } else {
      setDraft({ start: draft.start, end: s });
    }
  }

  function applyPreset(p: Preset) {
    setDraft(p.range);
    if (p.range.start) {
      const d = parseYmd(p.range.start);
      setView({ y: d.getFullYear(), m: d.getMonth() });
    }
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const activePreset =
    presets.find(
      (p) => p.range.start === draft.start && p.range.end === draft.end,
    )?.id ?? "custom";

  const next = new Date(view.y, view.m + 1, 1);
  const months = [
    { y: view.y, m: view.m },
    { y: next.getFullYear(), m: next.getMonth() },
  ];

  const rangeText =
    draft.start && draft.end
      ? `${draft.start} ~ ${draft.end}`
      : draft.start
        ? `${draft.start} ~ `
        : "기간을 선택하세요";

  function confirm() {
    if (draft.start) {
      onApply({ start: draft.start, end: draft.end ?? draft.start });
    } else {
      onApply({ start: null, end: null });
    }
  }

  return (
    <>
      {/* click-outside backdrop */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div className="absolute left-0 top-full mt-2 z-50 w-[600px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex">
          {/* preset sidebar */}
          <div className="w-28 shrink-0 border-r border-slate-100 p-2 space-y-0.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition ${
                  activePreset === p.id
                    ? "bg-violet-600 text-white font-semibold"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div
              className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${
                activePreset === "custom"
                  ? "bg-violet-600 text-white font-semibold"
                  : "text-slate-400"
              }`}
            >
              Custom Range
            </div>
          </div>

          {/* calendars */}
          <div className="flex-1 p-3">
            <div className="flex items-center justify-between mb-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="이전 달"
                className="w-7 h-7 grid place-items-center rounded-md text-slate-500 hover:bg-slate-100"
              >
                ‹
              </button>
              <div className="flex-1 flex justify-around text-sm font-semibold text-slate-800">
                {months.map((mo) => (
                  <span key={`${mo.y}-${mo.m}`}>
                    {mo.m + 1}월 {mo.y}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="다음 달"
                className="w-7 h-7 grid place-items-center rounded-md text-slate-500 hover:bg-slate-100"
              >
                ›
              </button>
            </div>

            <div className="flex gap-3">
              {months.map((mo) => (
                <div key={`${mo.y}-${mo.m}`} className="flex-1">
                  <div className="grid grid-cols-7">
                    {WEEKDAYS.map((w) => (
                      <div
                        key={w}
                        className="h-7 grid place-items-center text-[11px] text-slate-400"
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthCells(mo.y, mo.m).map((cell, i) => {
                      if (!cell) return <div key={i} className="h-9" />;
                      const s = ymd(cell);
                      const isStart = s === draft.start;
                      const isEnd = s === draft.end;
                      const isEndpoint = isStart || isEnd;
                      const inRange =
                        !!draft.start &&
                        !!draft.end &&
                        s > draft.start &&
                        s < draft.end;
                      const isToday = s === todayStr;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => pick(cell)}
                          className={`h-9 text-sm tabular-nums transition ${
                            isEndpoint
                              ? "bg-violet-600 text-white font-semibold rounded-lg"
                              : inRange
                                ? "bg-violet-100 text-violet-800"
                                : "text-slate-700 rounded-lg hover:bg-slate-100"
                          } ${
                            isToday && !isEndpoint
                              ? "ring-1 ring-inset ring-violet-400 rounded-lg"
                              : ""
                          }`}
                        >
                          {cell.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-sm text-slate-600 tabular-nums">
            {rangeText}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirm}
              className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

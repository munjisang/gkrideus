"use client";

import { useEffect, useMemo, useState } from "react";
import BottomSheet from "./BottomSheet";
import { useI18n } from "../lib/i18n";

export type DateHour = {
  /** YYYY-MM-DD */
  date: string;
  /** 0–23 (hour to start filtering from). */
  hour: number;
};

type Props = {
  open: boolean;
  /** Existing selection to pre-populate (optional). */
  value?: DateHour | null;
  /** Earliest selectable date (YYYY-MM-DD). Default = today (local). */
  minDate?: string;
  /** Latest selectable date (YYYY-MM-DD). Default = no upper limit. */
  maxDate?: string;
  /** Sheet title — typically "가는 날" or "오는 날". */
  title: string;
  onPick: (v: DateHour) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
};

function todayLocal(): { y: number; m: number; d: number } {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function firstDayWeekday(y: number, m: number): number {
  // 0 = Sun … 6 = Sat
  return new Date(y, m - 1, 1).getDay();
}

export default function DatePickerSheet({
  open,
  value,
  minDate,
  maxDate,
  title,
  onPick,
  onClose,
  anchorRef,
}: Props) {
  const { t, lang } = useI18n();
  const weekdays =
    lang === "ko"
      ? ["일", "월", "화", "수", "목", "금", "토"]
      : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const today = useMemo(todayLocal, []);
  const minIso = minDate ?? toIso(today.y, today.m, today.d);

  const initialFromValue = value?.date
    ? {
        y: Number(value.date.slice(0, 4)),
        m: Number(value.date.slice(5, 7)),
      }
    : { y: today.y, m: today.m };

  const [viewY, setViewY] = useState(initialFromValue.y);
  const [viewM, setViewM] = useState(initialFromValue.m);
  const [picked, setPicked] = useState<string | null>(value?.date ?? null);
  const [hour, setHour] = useState<number>(value?.hour ?? 0);
  // Snapshot the current hour when the sheet opens so the floor stays stable
  // while the user interacts; recomputed each open.
  const [nowHour, setNowHour] = useState<number>(() => new Date().getHours());

  const todayIso = useMemo(() => toIso(today.y, today.m, today.d), [today]);
  const isToday = picked === todayIso;
  // If the user picks today, force hour ≥ now+1 (capped at 23).
  const hourFloor = isToday ? Math.min(23, nowHour + 1) : 0;

  useEffect(() => {
    if (open) {
      setNowHour(new Date().getHours());
      // Reset view to value or today each time it opens.
      const v = value?.date;
      if (v) {
        setViewY(Number(v.slice(0, 4)));
        setViewM(Number(v.slice(5, 7)));
        setPicked(v);
        setHour(value?.hour ?? 0);
      } else {
        setViewY(today.y);
        setViewM(today.m);
        setPicked(null);
        setHour(0);
      }
    }
  }, [open, value, today.y, today.m]);

  // Whenever the picked date changes (or floor recomputes), keep hour ≥ floor.
  useEffect(() => {
    setHour((h) => (h < hourFloor ? hourFloor : h));
  }, [hourFloor]);

  function prevMonth() {
    let y = viewY;
    let m = viewM - 1;
    if (m < 1) {
      m = 12;
      y--;
    }
    // Don't allow viewing months earlier than the minDate month
    const minY = Number(minIso.slice(0, 4));
    const minM = Number(minIso.slice(5, 7));
    if (y < minY || (y === minY && m < minM)) return;
    setViewY(y);
    setViewM(m);
  }
  function nextMonth() {
    let y = viewY;
    let m = viewM + 1;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (maxDate) {
      const maxY = Number(maxDate.slice(0, 4));
      const maxM = Number(maxDate.slice(5, 7));
      if (y > maxY || (y === maxY && m > maxM)) return;
    }
    setViewY(y);
    setViewM(m);
  }

  const offset = firstDayWeekday(viewY, viewM);
  const days = daysInMonth(viewY, viewM);
  const cells: ({ d: number } | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push({ d });
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      anchorRef={anchorRef}
      desktopWidth={360}
    >
      {/* Month switcher */}
      <div className="flex items-center justify-center gap-4 px-5 pt-3 pb-2">
        <button
          type="button"
          onClick={prevMonth}
          className="w-9 h-9 grid place-items-center rounded-full border border-hairline text-ink-faint hover:text-action hover:border-action transition active:scale-95"
          aria-label="이전 달"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xl font-semibold tabular-nums text-ink">
          {viewY}.{pad2(viewM)}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="w-9 h-9 grid place-items-center rounded-full border border-hairline text-ink-faint hover:text-action hover:border-action transition active:scale-95"
          aria-label="다음 달"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-2 text-center text-sm font-medium text-ink-faint">
        {weekdays.map((w, i) => (
          <div
            key={w}
            className={`py-2 ${i === 0 ? "text-red-500" : ""}`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 px-2 pb-2">
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} className="aspect-square" />;
          const iso = toIso(viewY, viewM, c.d);
          const isPast = iso < minIso;
          const isFuture = !!maxDate && iso > maxDate;
          const disabledCell = isPast || isFuture;
          const isToday = iso === todayIso;
          const isSelected = iso === picked;
          const isSunday = i % 7 === 0;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabledCell}
              onClick={() => onPick({ date: iso, hour: 0 })}
              className={`aspect-square flex flex-col items-center justify-center text-base tabular-nums transition ${
                disabledCell
                  ? "text-ink-faint/50 cursor-not-allowed"
                  : isSelected
                    ? ""
                    : isSunday
                      ? "text-red-500"
                      : "text-ink"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${
                  isSelected
                    ? "bg-action text-white font-semibold"
                    : isToday
                      ? "border border-hairline"
                      : ""
                }`}
              >
                {c.d}
              </span>
              <span
                className={`text-[10px] mt-0.5 leading-none ${
                  isSelected
                    ? "text-action font-semibold"
                    : isToday
                      ? "text-ink-faint"
                      : "text-transparent"
                }`}
              >
                {isSelected ? t("dp.selected") : isToday ? t("dp.today") : "·"}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

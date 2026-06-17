"use client";

/** Filter bar above the admin 예매내역 list. Period (with date-range
 *  picker), train kind, booking status, and a name/email keyword. */
import { useState } from "react";
import DateRangePicker from "./DateRangePicker";
import type {
  BookingFilterState,
  BookingStatus,
  PeriodField,
  TrainKind,
} from "./bookingFilterModel";
import { hasActiveFilter } from "./bookingFilterModel";

const PERIOD_OPTS: { id: PeriodField; label: string }[] = [
  { id: "reserved", label: "예매일" },
  { id: "departure", label: "출발일" },
  { id: "cancelled", label: "예매취소일" },
];
const KIND_OPTS: { id: TrainKind; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "ktx", label: "KTX" },
  { id: "srt", label: "SRT" },
];
const STATUS_OPTS: { id: BookingStatus; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "pending", label: "예매대기" },
  { id: "ticketed", label: "발권완료" },
  { id: "cancelled", label: "예매취소" },
];

const SELECT_CLASS =
  "h-9 rounded-lg border border-hairline bg-white px-2 text-sm text-ink-soft focus:border-action focus:outline-none";

type Props = {
  value: BookingFilterState;
  onChange: (next: BookingFilterState) => void;
  onReset: () => void;
};

export default function BookingFilters({ value, onChange, onReset }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function set<K extends keyof BookingFilterState>(
    key: K,
    v: BookingFilterState[K],
  ) {
    onChange({ ...value, [key]: v });
  }

  const rangeLabel =
    value.rangeStart && value.rangeEnd
      ? `${value.rangeStart} ~ ${value.rangeEnd}`
      : "전체 기간";

  return (
    <div className="mb-4 card-apple p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* 기간 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-ink-faint">기간</span>
        <select
          value={value.periodField}
          onChange={(e) => set("periodField", e.target.value as PeriodField)}
          className={SELECT_CLASS}
        >
          {PERIOD_OPTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="h-9 flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 text-sm text-ink-soft hover:border-action"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-ink-faint"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="tabular-nums">{rangeLabel}</span>
          </button>
          {pickerOpen && (
            <DateRangePicker
              value={{ start: value.rangeStart, end: value.rangeEnd }}
              onApply={(r) => {
                onChange({
                  ...value,
                  rangeStart: r.start,
                  rangeEnd: r.end,
                });
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {/* 종류 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-ink-faint">종류</span>
        <select
          value={value.kind}
          onChange={(e) => set("kind", e.target.value as TrainKind)}
          className={SELECT_CLASS}
        >
          {KIND_OPTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* 예매 상태 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-ink-faint">예매상태</span>
        <select
          value={value.status}
          onChange={(e) => set("status", e.target.value as BookingStatus)}
          className={SELECT_CLASS}
        >
          {STATUS_OPTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* 검색어 */}
      <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
        <span className="text-xs font-medium text-ink-faint shrink-0">
          검색어
        </span>
        <input
          type="text"
          value={value.keyword}
          onChange={(e) => set("keyword", e.target.value)}
          placeholder="이름 · 이메일"
          className="h-9 w-full rounded-lg border border-hairline bg-white px-2.5 text-sm text-ink-soft placeholder:text-ink-faint focus:border-action focus:outline-none"
        />
      </div>

      {/* 초기화 */}
      <button
        type="button"
        onClick={onReset}
        disabled={!hasActiveFilter(value)}
        className="h-9 px-3 rounded-pill text-sm font-medium text-ink-soft border border-hairline hover:bg-parchment active:scale-95 transition-transform disabled:opacity-40"
      >
        초기화
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";

export type Passengers = {
  adults: number;
  children: number;
  toddlers: number;
  seniors: number;
};

type Props = {
  open: boolean;
  value: Passengers;
  onPick: (v: Passengers) => void;
  onClose: () => void;
};

const MIN_TOTAL = 1;
const MAX_TOTAL = 9; // common rail limit

export default function PassengersSheet({ open, value, onPick, onClose }: Props) {
  const [draft, setDraft] = useState<Passengers>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const total = draft.adults + draft.children + draft.toddlers + draft.seniors;

  function update(key: keyof Passengers, delta: 1 | -1) {
    setDraft((cur) => {
      const next = { ...cur, [key]: Math.max(0, cur[key] + delta) };
      const nextTotal = next.adults + next.children + next.toddlers + next.seniors;
      if (nextTotal < MIN_TOTAL || nextTotal > MAX_TOTAL) return cur;
      return next;
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="인원 선택"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onPick(draft)}
            className="flex-1 h-12 rounded-xl bg-sky-600 text-white font-semibold"
          >
            선택
          </button>
        </div>
      }
    >
      <div className="px-5 py-2 space-y-1">
        <Row
          label="어른"
          sub="만 13세 이상"
          value={draft.adults}
          onMinus={() => update("adults", -1)}
          onPlus={() => update("adults", 1)}
          minusDisabled={draft.adults <= 0 || (total <= MIN_TOTAL && draft.adults > 0)}
          plusDisabled={total >= MAX_TOTAL}
        />
        <Row
          label="어린이"
          sub="만 6-12세"
          info="6세 미만 유아는 무료입니다."
          value={draft.children}
          onMinus={() => update("children", -1)}
          onPlus={() => update("children", 1)}
          minusDisabled={draft.children <= 0}
          plusDisabled={total >= MAX_TOTAL}
        />

      </div>
    </BottomSheet>
  );
}

function Row({
  label,
  sub,
  info,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  sub: string;
  info?: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
}) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-900">{label}</div>
          <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
        </div>
        <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-2 py-1.5">
          <button
            type="button"
            onClick={onMinus}
            disabled={minusDisabled}
            aria-label={`${label} 감소`}
            className="w-8 h-8 grid place-items-center text-sky-600 disabled:text-slate-300"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span className="min-w-[24px] text-center text-base font-semibold tabular-nums text-slate-900">
            {value}
          </span>
          <button
            type="button"
            onClick={onPlus}
            disabled={plusDisabled}
            aria-label={`${label} 증가`}
            className="w-8 h-8 grid place-items-center text-sky-600 disabled:text-slate-300"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
      {info && (
        <div className="mt-1.5 text-[12px] text-slate-500 flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v.01M12 11v5" strokeLinecap="round" />
          </svg>
          {info}
        </div>
      )}
    </div>
  );
}

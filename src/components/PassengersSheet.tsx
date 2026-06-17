"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import { useI18n } from "../lib/i18n";

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
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Desktop popover alignment relative to the anchor. Default "right". */
  align?: "left" | "right";
};

const MIN_TOTAL = 1;
const MAX_TOTAL = 9; // common rail limit

export default function PassengersSheet({
  open,
  value,
  onPick,
  onClose,
  anchorRef,
  align = "right",
}: Props) {
  const { t } = useI18n();
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
      title={t("pax.selectTitle")}
      anchorRef={anchorRef}
      desktopWidth={400}
      align={align}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1 h-12"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onPick(draft)}
            className="btn-action flex-1 h-12"
          >
            {t("common.select")}
          </button>
        </div>
      }
    >
      <div className="px-5 py-2 space-y-1">
        <Row
          label={t("pax.adult")}
          sub={t("pax.adultSub")}
          value={draft.adults}
          onMinus={() => update("adults", -1)}
          onPlus={() => update("adults", 1)}
          minusDisabled={draft.adults <= 0 || (total <= MIN_TOTAL && draft.adults > 0)}
          plusDisabled={total >= MAX_TOTAL}
        />
        <Row
          label={t("pax.child")}
          sub={t("pax.childSub")}
          info={t("pax.toddlerFree")}
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
          <div className="text-base font-semibold text-ink">{label}</div>
          <div className="text-xs text-ink-faint mt-0.5">{sub}</div>
        </div>
        <div className="flex items-center gap-3 border border-hairline rounded-xl px-2 py-1.5">
          <button
            type="button"
            onClick={onMinus}
            disabled={minusDisabled}
            aria-label={`${label} 감소`}
            className="w-8 h-8 grid place-items-center text-action disabled:text-ink-faint/50 active:scale-95 transition-transform"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span className="min-w-[24px] text-center text-base font-semibold tabular-nums text-ink">
            {value}
          </span>
          <button
            type="button"
            onClick={onPlus}
            disabled={plusDisabled}
            aria-label={`${label} 증가`}
            className="w-8 h-8 grid place-items-center text-action disabled:text-ink-faint/50 active:scale-95 transition-transform"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
      {info && (
        <div className="mt-1.5 text-[12px] text-ink-faint flex items-center gap-1.5">
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

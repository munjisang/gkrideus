"use client";

import { useMemo } from "react";
import { useI18n } from "../lib/i18n";

type Props = {
  /** Bus grade (우등 / 심야우등 / 프리미엄 / 일반 …) — decides the layout. */
  grade: string;
  /** Number of seats the user must pick (= passenger count). */
  maxSelect: number;
  selected: number[];
  onChange: (seats: number[]) => void;
  /** Stable string (routeId+date) so "taken" seats don't reshuffle per render. */
  seed: string;
};

type Cfg = { left: number; right: number; rows: number; back: number };

function layoutFor(grade: string): Cfg {
  if (grade.includes("프리미엄")) return { left: 1, right: 1, rows: 10, back: 1 };
  if (grade.includes("우등")) return { left: 2, right: 1, rows: 8, back: 4 };
  return { left: 2, right: 2, rows: 10, back: 5 }; // 일반 / 기타
}

/** Deterministic ~22% "already taken" seats from the seed string. */
function takenSet(seed: string, total: number): Set<number> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let x = (h >>> 0) || 1;
  const count = Math.floor(total * 0.22);
  const set = new Set<number>();
  let guard = 0;
  while (set.size < count && guard++ < total * 8) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    set.add((x % total) + 1);
  }
  return set;
}

export default function BusSeatMap({
  grade,
  maxSelect,
  selected,
  onChange,
  seed,
}: Props) {
  const { t } = useI18n();

  const { rows, back, total } = useMemo(() => {
    const cfg = layoutFor(grade);
    let n = 1;
    const rows: { left: number[]; right: number[] }[] = [];
    for (let r = 0; r < cfg.rows; r++) {
      const left: number[] = [];
      for (let i = 0; i < cfg.left; i++) left.push(n++);
      const right: number[] = [];
      for (let i = 0; i < cfg.right; i++) right.push(n++);
      rows.push({ left, right });
    }
    const back: number[] = [];
    for (let i = 0; i < cfg.back; i++) back.push(n++);
    return { rows, back, total: n - 1 };
  }, [grade]);

  const taken = useMemo(() => takenSet(seed, total), [seed, total]);

  function toggle(num: number) {
    if (taken.has(num)) return;
    if (selected.includes(num)) {
      onChange(selected.filter((s) => s !== num));
    } else if (selected.length < maxSelect) {
      onChange([...selected, num].sort((a, b) => a - b));
    }
  }

  const Seat = ({ num }: { num: number }) => {
    const isTaken = taken.has(num);
    const isSel = selected.includes(num);
    return (
      <button
        type="button"
        onClick={() => toggle(num)}
        disabled={isTaken}
        aria-label={`${num}`}
        className={`relative w-9 h-9 rounded-md rounded-t-lg border text-[11px] font-semibold tabular-nums grid place-items-center transition ${
          isTaken
            ? "bg-parchment border-hairline text-ink-faint/60 cursor-not-allowed"
            : isSel
              ? "bg-action border-action text-white shadow-sm"
              : "bg-white border-hairline text-ink-soft hover:border-action active:scale-95"
        }`}
      >
        {isSel ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          num
        )}
      </button>
    );
  };

  return (
    <div>
      {/* Bus body */}
      <div className="mx-auto max-w-[260px] rounded-[26px] border border-hairline bg-pearl/40 p-4">
        {/* Front: driver + exit */}
        <div className="flex items-end justify-between px-1 pb-3 border-b border-dashed border-hairline">
          <div className="flex flex-col items-center gap-1 text-ink-faint">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
            </svg>
            <span className="text-[10px] font-medium">{t("bus.driver")}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-ink-faint">
            <span className="text-[10px] font-medium">{t("bus.exit")}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Seats */}
        <div className="space-y-2 pt-4">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center justify-center gap-1.5">
              {row.left.map((s) => (
                <Seat key={s} num={s} />
              ))}
              <div className="w-5 shrink-0" aria-hidden />
              {row.right.map((s) => (
                <Seat key={s} num={s} />
              ))}
            </div>
          ))}
          {back.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 pt-0.5">
              {back.map((s) => (
                <Seat key={s} num={s} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-hairline bg-white" />
          {t("bus.seatAvail")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-action" />
          {t("bus.seatSel")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-parchment border border-hairline" />
          {t("bus.seatTaken")}
        </span>
      </div>
    </div>
  );
}

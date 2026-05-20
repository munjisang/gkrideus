"use client";

import { fmtTime, durationMinutes } from "../lib/format";
import { durationL, fmtDateDots } from "../lib/format-i18n";
import { stationLabel, type Lang } from "../lib/i18n";
import type { TrainSchedule } from "../lib/types";
import { TrainLogo } from "./TrainLogo";

/** Single-leg train summary card body used in OrderView and bookings detail.
 *  Two-row layout:
 *    1. [label badge] logo train-no ──────── YYYY.MM.DD
 *    2. dep_time / dep_station ─── duration ─── arr_time / arr_station
 */
export default function LegSummary({
  label,
  train,
  lang,
}: {
  label: string;
  train: TrainSchedule;
  lang: Lang;
}) {
  const min = durationMinutes(train.depPlandTime, train.arrPlandTime);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded px-2 py-0.5 leading-tight">
            {label}
          </span>
          <TrainLogo name={train.trainGradeName} />
          <span className="text-sm font-semibold text-slate-500">
            {Number(train.trainNo) || train.trainNo}
          </span>
        </div>
        <span className="text-sm text-slate-500 shrink-0 tabular-nums">
          {fmtDateDots(train.depPlandTime)}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <div className="flex flex-col items-start min-w-0">
          <span className="text-base font-bold tabular-nums leading-none whitespace-nowrap text-slate-900">
            {fmtTime(train.depPlandTime)}
          </span>
          <span className="text-sm mt-1 whitespace-nowrap text-slate-600">
            {stationLabel(train.depPlaceName, lang)}
          </span>
        </div>
        <span className="h-px flex-1 bg-slate-200 self-start mt-2.5" aria-hidden />
        <span className="text-xs whitespace-nowrap self-start mt-1 text-slate-400">
          {durationL(min, lang)}
        </span>
        <span className="h-px flex-1 bg-slate-200 self-start mt-2.5" aria-hidden />
        <div className="flex flex-col items-end min-w-0">
          <span className="text-base font-bold tabular-nums leading-none whitespace-nowrap text-slate-900">
            {fmtTime(train.arrPlandTime)}
          </span>
          <span className="text-sm mt-1 whitespace-nowrap text-slate-600">
            {stationLabel(train.arrPlaceName, lang)}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { useI18n } from "../lib/i18n";

type AnimationData = Record<string, unknown>;

let cached: AnimationData | null = null;

export default function SearchLoading({ from, to }: { from: string; to: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<AnimationData | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch("/lottie/searching.json", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d: AnimationData) => {
        cached = d;
        setData(d);
      })
      .catch(() => {
        /* fallback: pulse circle */
      });
  }, []);

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col items-center justify-center px-6">
      <div className="w-64 h-44">
        {data ? (
          <Lottie animationData={data} loop autoplay style={{ width: "100%", height: "100%" }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-sky-400/30 animate-ping" />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-lg text-slate-700">
        <span className="font-semibold text-slate-900">{from}</span>
        <span className="mx-1.5 text-slate-400">→</span>
        <span className="font-semibold text-slate-900">{to}</span>
        <br />
        {t("sr.searching")}
      </p>
    </div>
  );
}

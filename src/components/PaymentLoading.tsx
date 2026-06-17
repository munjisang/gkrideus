"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { useI18n } from "../lib/i18n";

type AnimationData = Record<string, unknown>;

// Module-level cache so the JSON only flies over the wire once per session,
// even if the overlay mounts/unmounts several times across attempts.
let cached: AnimationData | null = null;

/**
 * Fullscreen Lottie overlay shown while the [결제하기] flow is in flight.
 * Mounts on top of every form section so the user can't double-submit or
 * mutate inputs while we're talking to Korail.
 */
export default function PaymentLoading() {
  const { t } = useI18n();
  const [data, setData] = useState<AnimationData | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch("/lottie/loading.json", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d: AnimationData) => {
        cached = d;
        setData(d);
      })
      .catch(() => {
        /* fallback animation handles the no-data case */
      });
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      // z-[70] so we sit above the sticky bottom payment bar (z-20) and
      // the bottom-sheet stack (z-[60]) used elsewhere in the app.
      className="fixed inset-0 z-[70] bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center px-6"
    >
      <div className="w-44 h-44">
        {data ? (
          <Lottie
            animationData={data}
            loop
            autoplay
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-action/30 animate-ping" />
          </div>
        )}
      </div>
      <p className="mt-4 text-lg font-semibold tracking-tight text-ink">
        {t("ord.processing.title")}
      </p>
      <p className="mt-1 text-sm text-ink-soft text-center max-w-xs">
        {t("ord.processing.sub")}
      </p>
    </div>
  );
}

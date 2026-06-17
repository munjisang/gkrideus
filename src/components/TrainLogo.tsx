"use client";

import Image from "next/image";

/** Map a Korail/TAGO train grade name (e.g. "KTX-산천", "SRT") to its
 *  brand-logo PNG under /public/trains. Returns null for any name we
 *  don't have a logo for (caller falls back to plain text). */
export function logoSrcFor(name: string): string | null {
  if (name.startsWith("KTX-산천")) return "/trains/ktx-sancheon.png";
  if (name.startsWith("KTX-이음")) return "/trains/ktx-eum.png";
  if (name.startsWith("KTX-청룡")) return "/trains/ktx-cheongryong.png";
  if (name.startsWith("KTX")) return "/trains/ktx.png";
  if (name === "SRT") return "/trains/srt.png";
  return null;
}

/** Inline brand logo. `dim` greys it out (used for sold-out cards). */
export function TrainLogo({ name, dim }: { name: string; dim?: boolean }) {
  const src = logoSrcFor(name);
  if (!src) {
    return (
      <span
        className={`text-sm font-bold ${
          dim ? "text-ink-faint" : "text-ink"
        }`}
      >
        {name}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={name}
      width={59}
      height={14}
      className={`h-3.5 w-auto select-none ${dim ? "opacity-40 grayscale" : ""}`}
      priority={false}
      unoptimized
    />
  );
}

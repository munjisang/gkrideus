"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Max height on desktop; on mobile the sheet uses up to 90vh. */
  maxHeight?: string;
};

const EXIT_MS = 220;

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxHeight = "90vh",
}: Props) {
  /**
   * `mounted` keeps the panel in the DOM briefly after `open` flips to false
   * so the slide-down transition can play, then it unmounts entirely. When
   * `open` is true we render normally; the panel only exists while mounted,
   * so a closed sheet leaves zero visual footprint.
   */
  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Trigger transition after mount so transform/opacity animate in.
      requestAnimationFrame(() => setAnimateIn(true));
    } else if (mounted) {
      setAnimateIn(false);
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          animateIn ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Sheet panel */}
      <div
        className={`absolute left-0 right-0 bottom-0 mx-auto w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl sm:mb-6 overflow-hidden shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          animateIn ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight }}
      >
        {/* Grabber on mobile */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 text-center text-base font-bold text-slate-900">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 pt-3 pb-5 border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  );
}

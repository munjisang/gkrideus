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
  // Desktop: anchor the panel below this element. Mobile uses the bottom sheet.
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Desktop popover width in px. */
  desktopWidth?: number;
  /** Desktop popover horizontal alignment relative to the anchor. */
  align?: "left" | "right";
};

const EXIT_MS = 220;

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxHeight = "90vh",
  anchorRef,
  desktopWidth = 460,
  align = "left",
}: Props) {
  /**
   * `mounted` keeps the panel in the DOM briefly after `open` flips to false
   * so the slide-down transition can play, then it unmounts entirely. When
   * `open` is true we render normally; the panel only exists while mounted,
   * so a closed sheet leaves zero visual footprint.
   */
  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

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

  // Track desktop breakpoint for anchored-popover vs bottom-sheet mode.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Measure the anchor when opening and on resize while open.
  useEffect(() => {
    if (!open || !anchorRef?.current) return;
    const measure = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, anchorRef]);

  if (!mounted) return null;

  const anchored = isDesktop && !!rect;
  const rawLeft = rect
    ? align === "right"
      ? rect.right - desktopWidth
      : rect.left
    : 0;
  const panelLeft = rect
    ? Math.max(16, Math.min(rawLeft, window.innerWidth - desktopWidth - 16))
    : 0;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop — dark on mobile, transparent click-catcher when anchored */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className={`absolute inset-0 transition-opacity duration-200 ${
          anchored ? "bg-transparent" : "bg-black/40"
        } ${animateIn ? "opacity-100" : "opacity-0"}`}
      />
      {/* Panel */}
      <div
        className={
          anchored
            ? `fixed bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200 ease-out ${
                animateIn ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
              }`
            : `absolute left-0 right-0 bottom-0 mx-auto w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl sm:mb-6 overflow-hidden shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                animateIn ? "translate-y-0" : "translate-y-full"
              }`
        }
        style={
          anchored && rect
            ? {
                top: rect.bottom + 8,
                left: panelLeft,
                width: desktopWidth,
                maxHeight: "70vh",
              }
            : { maxHeight }
        }
      >
        {/* Grabber on mobile */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="mx-auto h-1 w-10 rounded-full bg-hairline" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 text-center text-base font-semibold text-ink">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 pt-3 pb-5 border-t border-divider">{footer}</div>}
      </div>
    </div>
  );
}

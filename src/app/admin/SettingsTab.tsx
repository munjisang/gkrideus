"use client";

import { useEffect, useState } from "react";
import type { FeeSettings } from "../../lib/types";

type BasisKey = FeeSettings["bookingFeeBasis"];

const BASIS_OPTIONS: { key: BasisKey; label: string; sub: string }[] = [
  {
    key: "regular",
    label: "정상운임 기준",
    sub: "할인 전 운임 × 수수료율",
  },
  {
    key: "discounted",
    label: "결제운임 기준",
    sub: "할인 후 운임 × 수수료율",
  },
];

export default function SettingsTab() {
  const [settings, setSettings] = useState<FeeSettings | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Form draft (decoupled from settings so users can revert).
  const [bookingFeePct, setBookingFeePct] = useState("");
  const [bookingFeeBasis, setBookingFeeBasis] = useState<BasisKey>("discounted");
  const [cancelFeePct, setCancelFeePct] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load() {
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/service-settings", {
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok: boolean;
        settings?: FeeSettings & { updatedAt?: string | null };
        error?: string;
      };
      if (!res.ok || !j.ok || !j.settings) {
        setLoadErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSettings({
        bookingFeeRate: j.settings.bookingFeeRate,
        bookingFeeBasis: j.settings.bookingFeeBasis,
        cancelFeeRate: j.settings.cancelFeeRate,
      });
      setUpdatedAt(j.settings.updatedAt ?? null);
      setBookingFeePct(String(Math.round(j.settings.bookingFeeRate * 100)));
      setBookingFeeBasis(j.settings.bookingFeeBasis);
      setCancelFeePct(String(Math.round(j.settings.cancelFeeRate * 100)));
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function validate(): string | null {
    const bf = Number(bookingFeePct);
    const cf = Number(cancelFeePct);
    if (!Number.isFinite(bf) || bf < 0 || bf > 100) {
      return "발권수수료율은 0~100 사이의 숫자여야 합니다.";
    }
    if (!Number.isFinite(cf) || cf < 0 || cf > 100) {
      return "취소수수료율은 0~100 사이의 숫자여야 합니다.";
    }
    return null;
  }

  async function save() {
    const err = validate();
    if (err) {
      setSaveErr(err);
      return;
    }
    setSaveErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/service-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingFeeRate: Number(bookingFeePct) / 100,
          bookingFeeBasis,
          cancelFeeRate: Number(cancelFeePct) / 100,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setSaveErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    settings !== null &&
    (Number(bookingFeePct) / 100 !== settings.bookingFeeRate ||
      bookingFeeBasis !== settings.bookingFeeBasis ||
      Number(cancelFeePct) / 100 !== settings.cancelFeeRate);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-slate-800">서비스 설정</h2>
        {updatedAt && (
          <span className="text-[11px] text-slate-400 tabular-nums">
            마지막 저장 {new Date(updatedAt).toLocaleString("ko-KR")}
          </span>
        )}
      </div>

      {loadErr && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {loadErr}
        </div>
      )}

      {settings == null && !loadErr ? (
        <div className="py-6 text-center text-sm text-slate-400">불러오는 중…</div>
      ) : (
        <>
          {/* 발권수수료 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">발권수수료</h3>
            <div>
              <label className="block">
                <span className="text-xs font-medium text-slate-500 mb-1 block">
                  수수료율
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={1}
                    value={bookingFeePct}
                    onChange={(e) => setBookingFeePct(e.target.value)}
                    className="h-11 w-24 px-3 rounded-lg border border-slate-200 bg-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </label>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 mb-1 block">
                적용 기준
              </span>
              <div className="grid grid-cols-2 gap-2">
                {BASIS_OPTIONS.map((opt) => {
                  const active = bookingFeeBasis === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setBookingFeeBasis(opt.key)}
                      className={`px-3 py-2 rounded-lg border text-left transition ${
                        active
                          ? "border-sky-600 bg-sky-50 ring-1 ring-sky-200"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div
                        className={`text-sm font-semibold ${
                          active ? "text-sky-700" : "text-slate-700"
                        }`}
                      >
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {opt.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 취소수수료 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">취소수수료</h3>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 mb-1 block">
                수수료율 (총 결제금액 기준)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={1}
                  value={cancelFeePct}
                  onChange={(e) => setCancelFeePct(e.target.value)}
                  className="h-11 w-24 px-3 rounded-lg border border-slate-200 bg-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </label>
          </div>

          {saveErr && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveErr}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className={`h-10 px-4 rounded-lg font-semibold text-sm transition ${
                dirty && !saving
                  ? "bg-slate-900 hover:bg-slate-800 text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {saving ? "저장 중…" : "변경 저장"}
            </button>
            {savedAt && !dirty && (
              <span className="text-xs text-emerald-600">저장됨</span>
            )}
            <span className="ml-auto text-[11px] text-slate-400">
              저장 시점 이후 신규 예매부터 새 수수료가 적용됩니다.
            </span>
          </div>
        </>
      )}
    </section>
  );
}

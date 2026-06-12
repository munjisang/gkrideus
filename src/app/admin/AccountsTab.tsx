"use client";

import { useEffect, useMemo, useState } from "react";
import { readJson } from "../../lib/safeJson";

type ServiceKey = "korail" | "srt";

const SERVICE_LABEL: Record<ServiceKey, string> = {
  korail: "코레일",
  srt: "SRT",
};
const SERVICES: ServiceKey[] = ["korail", "srt"];

type Account = {
  id: string;
  service: ServiceKey;
  account_id: string;
  enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export default function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [subTab, setSubTab] = useState<ServiceKey>("korail");

  // Drag tracking — index within the current sub-tab's filtered list.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  async function load() {
    setErr(null);
    try {
      const res = await fetch("/api/admin/accounts", { cache: "no-store" });
      const j = await readJson<{
        ok: boolean;
        accounts?: Account[];
        error?: string;
      }>(res);
      if (!res.ok || !j.ok) {
        setErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setAccounts(j.accounts ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /** Accounts visible in the current sub-tab. Pre-sorted by display_order
   *  on the server, then by created_at as a tiebreaker. */
  const tabAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter((a) => a.service === subTab);
  }, [accounts, subTab]);

  async function toggleEnabled(acct: Account) {
    setBusyId(acct.id);
    try {
      const res = await fetch(`/api/admin/accounts/${acct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !acct.enabled }),
      });
      const j = await readJson<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) {
        alert(j.error ?? `HTTP ${res.status}`);
      } else {
        await load();
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeAccount(acct: Account) {
    if (
      !confirm(
        `${SERVICE_LABEL[acct.service]} 계정 ${acct.account_id}을(를) 삭제할까요?`,
      )
    ) {
      return;
    }
    setBusyId(acct.id);
    try {
      const res = await fetch(`/api/admin/accounts/${acct.id}`, {
        method: "DELETE",
      });
      const j = await readJson<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) {
        alert(j.error ?? `HTTP ${res.status}`);
      } else {
        await load();
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  /** Commit a reorder: PATCH every row in the tab whose display_order
   *  shifted. Fire concurrently for speed, then reload once. */
  async function commitReorder(reordered: Account[]) {
    const patches = reordered
      .map((a, i) => ({ a, newOrder: i }))
      .filter(({ a, newOrder }) => a.display_order !== newOrder);
    if (patches.length === 0) return;
    try {
      await Promise.all(
        patches.map(({ a, newOrder }) =>
          fetch(`/api/admin/accounts/${a.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayOrder: newOrder }),
          }),
        ),
      );
      await load();
    } catch (e) {
      alert(`순서 저장 실패: ${(e as Error).message}`);
      await load();
    }
  }

  function onDragStart(idx: number) {
    setDragFrom(idx);
  }
  function onDragOverIdx(idx: number, e: React.DragEvent) {
    e.preventDefault();
    if (dragFrom === null || dragFrom === idx) return;
    setDragOver(idx);
  }
  function onDragLeaveIdx(idx: number) {
    if (dragOver === idx) setDragOver(null);
  }
  function onDrop(idx: number, e: React.DragEvent) {
    e.preventDefault();
    if (dragFrom === null || dragFrom === idx) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    const next = [...tabAccounts];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(idx, 0, moved);
    // Optimistic local update — full list with this tab's slice swapped.
    if (accounts) {
      const others = accounts.filter((a) => a.service !== subTab);
      setAccounts([...others, ...next]);
    }
    setDragFrom(null);
    setDragOver(null);
    void commitReorder(next);
  }
  function onDragEnd() {
    setDragFrom(null);
    setDragOver(null);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-semibold text-slate-800">계정 설정</h2>
        <button
          onClick={() => setAdding(true)}
          className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
        >
          + 계정 추가
        </button>
      </div>

      {/* Service sub-tabs */}
      <nav className="flex gap-1 border-b border-slate-200 mb-3">
        {SERVICES.map((s) => {
          const active = s === subTab;
          const count = (accounts ?? []).filter((a) => a.service === s).length;
          return (
            <button
              key={s}
              onClick={() => setSubTab(s)}
              className={`relative h-9 px-3 text-sm font-semibold transition ${
                active
                  ? "text-slate-900"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {SERVICE_LABEL[s]}
              <span
                className={`ml-1 inline-block text-[11px] font-medium tabular-nums ${
                  active ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {count}
              </span>
              {active && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-slate-900 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {err && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {accounts == null ? (
        <div className="py-8 text-center text-sm text-slate-400">불러오는 중…</div>
      ) : tabAccounts.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          {SERVICE_LABEL[subTab]} 계정이 없습니다.
          <br />
          <span className="text-xs">우측 상단 &ldquo;계정 추가&rdquo;를 눌러 등록하세요.</span>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-slate-400">
            드래그해서 순서를 바꾸면 예매 시 위에서부터 차례로 시도합니다.
          </p>
          <ul className="divide-y divide-slate-100">
            {tabAccounts.map((acct, idx) => {
              const isDragging = dragFrom === idx;
              const isDragOver = dragOver === idx && dragFrom !== idx;
              return (
                <li
                  key={acct.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOverIdx(idx, e)}
                  onDragLeave={() => onDragLeaveIdx(idx)}
                  onDrop={(e) => onDrop(idx, e)}
                  onDragEnd={onDragEnd}
                  className={`flex items-center gap-3 py-3 px-2 -mx-2 rounded transition flex-wrap sm:flex-nowrap ${
                    isDragging ? "opacity-40" : ""
                  } ${
                    isDragOver
                      ? "bg-sky-50 ring-2 ring-sky-200"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {/* Drag handle */}
                  <span
                    className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none"
                    aria-label="순서 변경"
                    title="드래그해서 순서 변경"
                  >
                    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden>
                      <circle cx="4" cy="4" r="1.5" />
                      <circle cx="10" cy="4" r="1.5" />
                      <circle cx="4" cy="10" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="4" cy="16" r="1.5" />
                      <circle cx="10" cy="16" r="1.5" />
                    </svg>
                  </span>
                  <span className="shrink-0 inline-flex items-center justify-center w-7 h-6 text-[11px] font-bold rounded bg-slate-100 text-slate-500 tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate">
                    {acct.account_id}
                  </span>
                  <Toggle
                    checked={acct.enabled}
                    disabled={busyId === acct.id}
                    onChange={() => toggleEnabled(acct)}
                    label="사용 여부"
                  />
                  <button
                    onClick={() => removeAccount(acct)}
                    disabled={busyId === acct.id}
                    className="h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                    aria-label="삭제"
                    title="삭제"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {adding && (
        <AddAccountModal
          defaultService={subTab}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`shrink-0 relative h-6 w-11 rounded-full transition ${
        checked ? "bg-sky-600" : "bg-slate-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ─────────────────────────────────────────── Add Account Modal */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 grid place-items-center text-slate-400 hover:text-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddAccountModal({
  defaultService,
  onClose,
  onSaved,
}: {
  defaultService: ServiceKey;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [service, setService] = useState<ServiceKey>(defaultService);
  const [accountId, setAccountId] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = !!accountId.trim() && !!accountPassword.trim() && !submitting;

  async function save() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          accountId,
          accountPassword,
          enabled,
        }),
      });
      const j = await readJson<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) {
        setErr(j.error ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="계정 추가" onClose={onClose}>
      <div className="px-5 py-3 space-y-3">
        <div>
          <span className="text-xs font-medium text-slate-500 block mb-1">서비스</span>
          <div className="flex gap-2">
            {SERVICES.map((s) => {
              const active = service === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setService(s)}
                  className={`flex-1 h-10 rounded-lg border text-sm font-medium transition ${
                    active
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {SERVICE_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-slate-500 mb-1 block">회원번호 / ID</span>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            autoComplete="off"
            placeholder="0160346790"
            className="h-11 px-3 rounded-lg border border-slate-200 bg-white w-full focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500 mb-1 block">비밀번호</span>
          <input
            type="password"
            value={accountPassword}
            onChange={(e) => setAccountPassword(e.target.value)}
            autoComplete="off"
            className="h-11 px-3 rounded-lg border border-slate-200 bg-white w-full focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
        <label className="flex items-center justify-between pt-1">
          <span className="text-sm text-slate-700">사용 여부</span>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} label="사용 여부" />
        </label>
        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
      </div>
      <div className="px-5 pt-2 pb-5 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 h-11 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold"
        >
          취소
        </button>
        <button
          onClick={save}
          disabled={!canSave}
          className={`flex-1 h-11 rounded-xl font-semibold transition ${
            canSave
              ? "bg-slate-900 hover:bg-slate-800 text-white"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {submitting ? "추가 중…" : "추가"}
        </button>
      </div>
    </ModalShell>
  );
}

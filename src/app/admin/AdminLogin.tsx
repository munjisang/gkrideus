"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("비밀번호가 올바르지 않습니다.");
        setSubmitting(false);
        return;
      }
      // Server set the cookie; force a refresh so the layout re-renders
      // with the gate satisfied.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm card-apple p-6"
      >
        <h1 className="text-lg font-semibold tracking-tight text-ink mb-1">관리자 로그인</h1>
        <p className="text-xs text-ink-faint mb-4">
          관리자 페이지 접속을 위해 비밀번호를 입력해주세요.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          className="h-11 px-4 rounded-xl border border-hairline bg-white w-full text-ink placeholder:text-ink-faint focus:outline-none focus:border-action"
        />
        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!password || submitting}
          className="btn-action btn-lg w-full mt-4"
        >
          {submitting ? "확인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}

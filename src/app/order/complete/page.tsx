import { Suspense } from "react";
import CompleteView from "./CompleteView";

export const dynamic = "force-dynamic";

export default function CompletePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-10 text-slate-500">불러오는 중…</div>
      }
    >
      <CompleteView />
    </Suspense>
  );
}

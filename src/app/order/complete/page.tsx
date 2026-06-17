import { Suspense } from "react";
import CompleteView from "./CompleteView";

export const dynamic = "force-dynamic";

export default function CompletePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 sm:px-8 lg:px-12 py-10 text-ink-faint">불러오는 중…</div>
      }
    >
      <CompleteView />
    </Suspense>
  );
}

import { Suspense } from "react";
import BusSearchView from "./BusSearchView";

export const dynamic = "force-dynamic";

export default function BusPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1280px] px-4 py-10 text-ink-faint">
          불러오는 중…
        </div>
      }
    >
      <BusSearchView />
    </Suspense>
  );
}

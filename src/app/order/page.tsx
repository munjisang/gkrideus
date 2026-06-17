import { Suspense } from "react";
import OrderView from "./OrderView";

export const dynamic = "force-dynamic";

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12 py-10 text-ink-faint">불러오는 중…</div>
      }
    >
      <OrderView />
    </Suspense>
  );
}

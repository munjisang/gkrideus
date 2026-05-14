import { Suspense } from "react";
import OrderView from "./OrderView";

export const dynamic = "force-dynamic";

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-10 text-slate-500">불러오는 중…</div>
      }
    >
      <OrderView />
    </Suspense>
  );
}

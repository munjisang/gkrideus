import { Suspense } from "react";
import BusSearchView from "./BusSearchView";
import SearchLoading from "../../components/SearchLoading";

export const dynamic = "force-dynamic";

export default function BusPage() {
  return (
    <Suspense fallback={<SearchLoading />}>
      <BusSearchView />
    </Suspense>
  );
}

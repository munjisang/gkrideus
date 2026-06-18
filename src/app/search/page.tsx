import { Suspense } from "react";
import SearchView from "./SearchView";
import SearchLoading from "../../components/SearchLoading";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchLoading />}>
      <SearchView />
    </Suspense>
  );
}

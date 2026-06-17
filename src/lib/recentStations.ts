const KEY = "korail.recentStations";
const MAX = 8;

export type RecentStation = { id: string; name: string };

export function loadRecent(): RecentStation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentStation =>
        x && typeof x.id === "string" && typeof x.name === "string",
    );
  } catch {
    return [];
  }
}

export function pushRecent(station: RecentStation): void {
  if (typeof window === "undefined") return;
  const cur = loadRecent().filter((s) => s.id !== station.id);
  cur.unshift(station);
  window.localStorage.setItem(KEY, JSON.stringify(cur.slice(0, MAX)));
}

/* ─────────────────────────────── Recent searched routes (from → to) */

const ROUTE_KEY = "korail.recentRoutes";
const ROUTE_MAX = 5;

export type RecentRoute = { from: RecentStation; to: RecentStation };

function isStation(x: unknown): x is RecentStation {
  return (
    !!x &&
    typeof (x as RecentStation).id === "string" &&
    typeof (x as RecentStation).name === "string"
  );
}

export function loadRecentRoutes(): RecentRoute[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROUTE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentRoute =>
        x && isStation(x.from) && isStation(x.to) && x.from.id !== x.to.id,
    );
  } catch {
    return [];
  }
}

export function pushRecentRoute(route: RecentRoute): void {
  if (typeof window === "undefined") return;
  if (route.from.id === route.to.id) return;
  const cur = loadRecentRoutes().filter(
    (r) => !(r.from.id === route.from.id && r.to.id === route.to.id),
  );
  cur.unshift(route);
  window.localStorage.setItem(ROUTE_KEY, JSON.stringify(cur.slice(0, ROUTE_MAX)));
}

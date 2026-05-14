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

import "server-only";

const KEY =
  process.env.TAGO_SERVICE_KEY ??
  "0e848f66a2eb9f7868958c7b42d70a86d1cdcab5a30a62226f04b861ecb3c45b";

const BASE = "https://apis.data.go.kr/1613000/TrainInfo";
const TTL_MS = 24 * 60 * 60 * 1000;

export type RemoteStation = {
  id: string;
  name: string;
  cityCode: string;
  cityName: string;
};

type Cache = {
  fetchedAt: number;
  stations: RemoteStation[];
  byId: Map<string, RemoteStation>;
  byCity: { cityCode: string; cityName: string; stations: RemoteStation[] }[];
};

let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

type TagoEnvelope<T> = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: T | T[] } | string };
  };
};

function pickItems<T>(env: TagoEnvelope<T>): T[] {
  const items = env.response?.body?.items;
  if (!items || typeof items === "string") return [];
  const item = items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function tagoJson<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("_type", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "500");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`TAGO ${path} HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith("{")) throw new Error(`TAGO ${path} non-JSON: ${text.slice(0, 60)}`);
  const data = JSON.parse(text) as TagoEnvelope<T>;
  const code = data.response?.header?.resultCode;
  if (code && code !== "00") {
    throw new Error(`TAGO ${path} result ${code}: ${data.response?.header?.resultMsg ?? ""}`);
  }
  return pickItems(data);
}

type CityItem = { citycode: string | number; cityname: string };
type StationItem = { nodeid: string; nodename: string };

async function load(): Promise<Cache> {
  const cities = await tagoJson<CityItem>("GetCtyCodeList", {});
  const byCity: Cache["byCity"] = [];
  const all: RemoteStation[] = [];
  for (const c of cities) {
    const cityCode = String(c.citycode);
    const cityName = String(c.cityname);
    let stations: StationItem[] = [];
    try {
      stations = await tagoJson<StationItem>("GetCtyAcctoTrainSttnList", { cityCode });
    } catch {
      // skip a single city failure
      continue;
    }
    const mapped: RemoteStation[] = stations
      .filter((s) => s.nodeid && s.nodename)
      .map((s) => ({
        id: String(s.nodeid),
        name: String(s.nodename),
        cityCode,
        cityName,
      }));
    if (mapped.length > 0) {
      byCity.push({ cityCode, cityName, stations: mapped });
      all.push(...mapped);
    }
  }
  const byId = new Map(all.map((s) => [s.id, s]));
  return { fetchedAt: Date.now(), stations: all, byId, byCity };
}

export async function getStationsCache(): Promise<Cache> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const fresh = await load();
      cache = fresh;
      return fresh;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function lookupStation(id: string): Promise<RemoteStation | undefined> {
  try {
    const c = await getStationsCache();
    return c.byId.get(id);
  } catch {
    return undefined;
  }
}

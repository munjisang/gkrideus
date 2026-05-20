import { NextResponse } from "next/server";
import { lookupStation } from "../../../lib/stationsServer";
import type { TrainSchedule } from "../../../lib/types";

export const dynamic = "force-dynamic";

const TAGO_BASE = "https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo";
const SERVICE_KEY =
  process.env.TAGO_SERVICE_KEY ??
  "0e848f66a2eb9f7868958c7b42d70a86d1cdcab5a30a62226f04b861ecb3c45b";

type TagoItem = {
  trainno: string | number;
  traingradecode?: string;
  traingradename: string;
  depplaceid?: string;
  depplacename: string;
  arrplaceid?: string;
  arrplacename: string;
  /** YYYYMMDDHHMMSS (14 chars) */
  depplandtime: string | number;
  arrplandtime: string | number;
  adultcharge: string | number;
};

type TagoResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      // data.go.kr sometimes returns "" when empty.
      items?: { item?: TagoItem | TagoItem[] } | string;
      totalCount?: number;
    };
  };
};

function normalizeItems(raw: TagoResponse): TagoItem[] {
  const items = raw.response?.body?.items;
  if (!items || typeof items === "string") return [];
  const item = items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/** TAGO returns 14-digit YYYYMMDDHHMMSS — keep first 12 (YYYYMMDDHHmm) for display. */
function trimPlandTime(v: string | number): string {
  const s = String(v);
  return s.length >= 12 ? s.slice(0, 12) : s;
}

/** Merge KTX-산천(A-type)·(B-type) into "KTX-산천". */
function normalizeGradeName(raw: string): string {
  if (raw.startsWith("KTX-산천")) return "KTX-산천";
  return raw;
}

function toSchedule(it: TagoItem, fallbackFrom: string, fallbackTo: string): TrainSchedule {
  const code = String(it.traingradecode ?? "00");
  return {
    trainNo: String(it.trainno),
    trainGradeCode: code,
    trainGradeName: normalizeGradeName(String(it.traingradename ?? "KTX")),
    depPlaceId: String(it.depplaceid ?? fallbackFrom),
    depPlaceName: String(it.depplacename),
    arrPlaceId: String(it.arrplaceid ?? fallbackTo),
    arrPlaceName: String(it.arrplacename),
    depPlandTime: trimPlandTime(it.depplandtime),
    arrPlandTime: trimPlandTime(it.arrplandtime),
    adultCharge: Number(it.adultcharge ?? 0),
  };
}

/** Allowed train grade codes (per TAGO `GetVhcleKndList`):
 *  00 KTX, 07 KTX-산천(A-type), 10 KTX-산천(B-type),
 *  16 KTX-이음, 17 SRT, 19 KTX-청룡. */
const ALLOWED_CODES = new Set(["00", "07", "10", "16", "17", "19"]);
/** Fallback name match when TAGO omits `traingradecode` (rare). */
const ALLOWED_NAMES = new Set([
  "KTX",
  "KTX-산천",
  "KTX-이음",
  "KTX-청룡",
  "SRT",
]);

function isAllowedTrain(it: TagoItem): boolean {
  const code = it.traingradecode ? String(it.traingradecode) : "";
  if (code) return ALLOWED_CODES.has(code);
  // No code → fall back to (normalized) name.
  const name = normalizeGradeName(String(it.traingradename ?? ""));
  return ALLOWED_NAMES.has(name);
}

async function fetchTago(
  from: string,
  to: string,
  date: string,
): Promise<{ ok: true; trains: TrainSchedule[] } | { ok: false; reason: string }> {
  const url = new URL(TAGO_BASE);
  url.searchParams.set("serviceKey", SERVICE_KEY);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("_type", "json");
  url.searchParams.set("depPlaceId", from);
  url.searchParams.set("arrPlaceId", to);
  url.searchParams.set("depPlandTime", date);
  // No trainGradeCode → include KTX, KTX-이음, KTX-산천, SRT etc.

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, reason: `TAGO HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!text.trim().startsWith("{")) {
      return { ok: false, reason: `TAGO non-JSON: ${text.slice(0, 60)}` };
    }
    const data = JSON.parse(text) as TagoResponse;
    const resultCode = data.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      return {
        ok: false,
        reason: `TAGO result ${resultCode}: ${data.response?.header?.resultMsg ?? ""}`,
      };
    }
    const allMapped = normalizeItems(data)
      .filter(isAllowedTrain)
      .map((it) => toSchedule(it, from, to));
    // Dedupe: TAGO occasionally repeats the same train within one response.
    const seen = new Set<string>();
    const trains: TrainSchedule[] = [];
    for (const t of allMapped) {
      const sig = `${t.trainGradeName}|${t.trainNo}|${t.depPlandTime}|${t.arrPlandTime}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      trains.push(t);
    }
    trains.sort((a, b) => a.depPlandTime.localeCompare(b.depPlandTime));
    return { ok: true, trains };
  } catch (err) {
    return { ok: false, reason: `TAGO fetch failed: ${(err as Error).message}` };
  }
}

/** Deterministic PRNG so the same (from,to,date) yields the same mock schedule. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function addMinutes(yyyymmdd: string, totalMin: number): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(y, m, d);
  date.setMinutes(date.getMinutes() + totalMin);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
}

function buildMock(
  from: string,
  to: string,
  date: string,
  fromName: string,
  toName: string,
): TrainSchedule[] {
  const rng = mulberry32(hashStr(`${from}|${to}|${date}`));
  const travelMin = 60 + Math.floor(rng() * 120); // 60–180 min
  const basePrice = 20000 + Math.floor(rng() * 40) * 1000; // 20k–60k

  const departures: number[] = [];
  for (let i = 0; i < 10; i++) {
    const slotStart = 60 * 6 + i * 90;
    const jitter = Math.floor(rng() * 30);
    departures.push(slotStart + jitter);
  }

  return departures.map((depMin, i) => {
    const trainNo = String(100 + Math.floor(rng() * 800));
    const dep = addMinutes(date, depMin);
    const arr = addMinutes(date, depMin + travelMin);
    const price = basePrice + Math.floor(rng() * 5) * 100;
    return {
      trainNo: `${trainNo}${i.toString().padStart(2, "0")}`,
      trainGradeCode: "00",
      trainGradeName: "KTX",
      depPlaceId: from,
      depPlaceName: fromName,
      arrPlaceId: to,
      arrPlaceName: toName,
      depPlandTime: dep,
      arrPlandTime: arr,
      adultCharge: price,
    };
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const date = searchParams.get("date") ?? "";

  if (!from || !to || !date) {
    return NextResponse.json(
      { ok: false, error: "from, to, date are required" },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json(
      { ok: false, error: "출발지와 도착지가 동일합니다." },
      { status: 400 },
    );
  }

  const [fromStation, toStation] = await Promise.all([lookupStation(from), lookupStation(to)]);
  const fromName = fromStation?.name ?? from;
  const toName = toStation?.name ?? to;

  const live = await fetchTago(from, to, date);
  if (live.ok) {
    return NextResponse.json({
      ok: true,
      source: "tago",
      from: { id: from, name: fromName },
      to: { id: to, name: toName },
      date,
      trains: live.trains,
    });
  }

  const trains = buildMock(from, to, date, fromName, toName);
  return NextResponse.json({
    ok: true,
    source: "mock",
    reason: live.reason,
    from: { id: from, name: fromName },
    to: { id: to, name: toName },
    date,
    trains,
  });
}

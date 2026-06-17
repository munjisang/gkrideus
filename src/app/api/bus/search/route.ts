import { NextResponse } from "next/server";
import { busCityById } from "@/lib/busCities";
import { busTerminalById } from "@/lib/busTerminals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── tmoney (intercity) ───────────────────────────────────────────────────────
const TM_BASE = "https://intercitybus.tmoney.co.kr";
const TM_ENTRY = `${TM_BASE}/otck/trmlInfEnty.do`;
const TM_SEARCH = `${TM_BASE}/otck/readAlcnList.do`;

// ── KOBUS (express) ──────────────────────────────────────────────────────────
const KB_BASE = "https://www.kobus.co.kr";
const KB_MAIN = `${KB_BASE}/main.do`;
const KB_SEARCH = `${KB_BASE}/mrs/alcnSrch.do`;
const KB_FEE = `${KB_BASE}/mrs/satschc.do`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

// Bound fan-out / latency.
const MAX_TMONEY_PER_SIDE = 2; // ≤ 2×2 = 4 readAlcnList combos
const MAX_KOBUS_FEE_GRADES = 8; // distinct grades to price per terminal combo

export type BusMode = "intercity" | "express";

export type BusRun = {
  mode: BusMode;
  routeId: string;
  departTime: string; // HH:MM
  operator: string;
  grade: string; // 일반 / 우등 / 프리미엄 …
  fare: number | null;
  remaining: number | null;
  total: number | null;
  departName: string;
  arriveName: string;
};

function getCookie(res: Response): string {
  const setCookies =
    (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);

/**
 * Unified intercity (tmoney) + express (KOBUS) bus schedule search.
 *
 * Preferred:   GET /api/bus/search?from=<cityId>&to=<cityId>&date=YYYYMMDD
 * Back-compat: GET /api/bus/search?depart=<7digit>&arrive=<7digit>&date=YYYYMMDD
 *              (tmoney terminal codes only — single intercity pair)
 *
 * Both systems are queried in parallel; per-source failures are swallowed so a
 * working source still returns results. Runs are merged and sorted by depart
 * time.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ?? "";
  const from = sp.get("from");
  const to = sp.get("to");

  if (!date) {
    return NextResponse.json({ ok: false, error: "missing date" }, { status: 400 });
  }

  // ── Resolve terminal codes per system ──────────────────────────────────────
  type Pair = { dep: string; arr: string; depName: string; arrName: string };
  let tmoneyPairs: Pair[] = [];
  let kobusPairs: Pair[] = [];

  if (from && to) {
    const fromCity = busCityById(from);
    const toCity = busCityById(to);
    if (!fromCity || !toCity) {
      return NextResponse.json(
        { ok: false, error: "unknown city" },
        { status: 400 },
      );
    }

    const depTms = fromCity.tmoney.slice(0, MAX_TMONEY_PER_SIDE);
    const arrTms = toCity.tmoney.slice(0, MAX_TMONEY_PER_SIDE);
    for (const dep of depTms) {
      for (const arr of arrTms) {
        tmoneyPairs.push({
          dep,
          arr,
          depName: busTerminalById(dep)?.name ?? fromCity.name,
          arrName: busTerminalById(arr)?.name ?? toCity.name,
        });
      }
    }

    // KOBUS: Seoul has two terminals (경부 010 + 센트럴시티 021); try each
    // origin × destination combo (capped) so e.g. 호남선 (021) is covered.
    for (const dep of fromCity.kobus.slice(0, 2)) {
      for (const arr of toCity.kobus.slice(0, 2)) {
        kobusPairs.push({
          dep,
          arr,
          depName: fromCity.name,
          arrName: toCity.name,
        });
      }
    }
  } else {
    // Backward-compatible single intercity pair via raw tmoney codes.
    const depart = sp.get("depart") ?? "";
    const arrive = sp.get("arrive") ?? "";
    if (!depart || !arrive) {
      return NextResponse.json(
        { ok: false, error: "missing params (need from/to or depart/arrive)" },
        { status: 400 },
      );
    }
    tmoneyPairs = [
      {
        dep: depart,
        arr: arrive,
        depName: sp.get("departName") ?? busTerminalById(depart)?.name ?? "",
        arrName: sp.get("arriveName") ?? busTerminalById(arrive)?.name ?? "",
      },
    ];
  }

  // ── Query both systems in parallel; never let one fail the whole request ────
  const [tmoneyRuns, kobusRuns] = await Promise.all([
    searchTmoney(tmoneyPairs, date).catch(() => [] as BusRun[]),
    searchKobus(kobusPairs, date).catch(() => [] as BusRun[]),
  ]);

  const runs = [...tmoneyRuns, ...kobusRuns].sort((a, b) =>
    a.departTime.localeCompare(b.departTime),
  );

  return NextResponse.json({ ok: true, count: runs.length, runs });
}

// ── tmoney (intercity) ───────────────────────────────────────────────────────

async function searchTmoney(
  pairs: { dep: string; arr: string; depName: string; arrName: string }[],
  date: string,
): Promise<BusRun[]> {
  if (pairs.length === 0) return [];

  // Warm up once for session cookies.
  const entry = await fetch(TM_ENTRY, { headers: { "User-Agent": UA }, cache: "no-store" });
  const cookie = getCookie(entry);

  const results = await Promise.all(
    pairs.map((p) => searchTmoneyPair(p, date, cookie).catch(() => [] as BusRun[])),
  );
  return results.flat();
}

async function searchTmoneyPair(
  p: { dep: string; arr: string; depName: string; arrName: string },
  date: string,
  cookie: string,
): Promise<BusRun[]> {
  const body = new URLSearchParams({
    depr_Trml_Cd: p.dep,
    arvl_Trml_Cd: p.arr,
    depr_Trml_Nm: p.depName,
    arvl_Trml_Nm: p.arrName,
    ig: "1",
    im: "0",
    ic: "0",
    iv: "0",
    depr_Dt: date,
    depr_Time: "000000",
    bef_Aft_Dvs: "D",
    req_Rec_Num: "10",
  });

  const res = await fetch(TM_SEARCH, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Referer: TM_ENTRY,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
    cache: "no-store",
  });

  return parseTmoney(await res.text(), p);
}

/** Extract intercity runs from readSasFeeInf(...) onclick handlers. The schedule
 *  fields come from the call args; adult fare is the first "12,345원" cell in the
 *  HTML segment immediately preceding each handler. */
function parseTmoney(
  html: string,
  p: { depName: string; arrName: string },
): BusRun[] {
  const out: BusRun[] = [];
  const seen = new Set<string>(); // source HTML repeats each run (PC + mobile)
  const re = /readSasFeeInf\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let prev = 0;
  while ((m = re.exec(html))) {
    const seg = html.slice(prev, m.index);
    prev = re.lastIndex;
    const args = m[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
    if (args.length < 13) continue;
    const t = args[8] || "";
    const dedup = `${args[0]}|${t}|${args[12]}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    const fareM = seg.match(/([\d,]+)\s*원/);
    out.push({
      mode: "intercity",
      routeId: args[0] ?? "",
      departTime: t.length >= 4 ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : t,
      operator: args[11] ?? "",
      grade: args[12] ?? "",
      fare: fareM ? Number(fareM[1].replace(/,/g, "")) : null,
      remaining: num(args[16]),
      total: num(args[17]),
      departName: p.depName,
      arriveName: p.arrName,
    });
  }
  return out;
}

// ── KOBUS (express) ──────────────────────────────────────────────────────────

type KobusRow = {
  args: string[]; // fnSatsChc(...) arguments
  departTime: string; // HH:MM
  operator: string;
  grade: string;
  fare: number | null; // sometimes present inline (premium/discount rows)
  remaining: number | null;
};

async function searchKobus(
  pairs: { dep: string; arr: string; depName: string; arrName: string }[],
  date: string,
): Promise<BusRun[]> {
  if (pairs.length === 0) return [];
  // Warm up once for session cookies, then query each terminal combo.
  const warm = await fetch(KB_MAIN, { headers: { "User-Agent": UA }, cache: "no-store" });
  const cookie = getCookie(warm);
  const results = await Promise.all(
    pairs.map((p) => searchKobusPair(p, date, cookie).catch(() => [] as BusRun[])),
  );
  return results.flat();
}

async function searchKobusPair(
  p: { dep: string; arr: string; depName: string; arrName: string },
  date: string,
  cookie: string,
): Promise<BusRun[]> {
  const body = new URLSearchParams({
    deprCd: p.dep,
    arvlCd: p.arr,
    pathDvs: "sngl",
    pathStep: "1",
    deprDtm: date,
    busClsCd: "0",
    rtrpChc: "1",
    timeLinkMin: "00",
    timeLinkMax: "23",
  });

  const res = await fetch(KB_SEARCH, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Referer: KB_MAIN,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
    cache: "no-store",
  });

  const html = await res.text();
  const baseForm = parseKobusForm(html);
  const rows = parseKobusRows(html);

  // KOBUS fares are uniform per (route, grade) — a 우등 run costs the same
  // regardless of operator or departure time. So instead of one satschc.do
  // lookup per run (which left most rows fare-less under a small cap), do
  // ONE representative lookup per distinct grade and apply it to every run
  // of that grade. Per-run remaining seats stay from the inline list HTML.
  const gradesNeedingFee = [
    ...new Set(rows.filter((r) => r.fare === null).map((r) => r.grade)),
  ].slice(0, MAX_KOBUS_FEE_GRADES);
  const fareByGrade = new Map<string, number>();
  await Promise.all(
    gradesNeedingFee.map(async (g) => {
      const sample = rows.find((r) => r.grade === g && r.fare === null);
      if (!sample) return;
      const fee = await fetchKobusFee(baseForm, sample.args, cookie).catch(
        () => null,
      );
      if (fee && fee.fare !== null) fareByGrade.set(g, fee.fare);
    }),
  );

  return rows.map((row): BusRun => {
    const fare = row.fare ?? fareByGrade.get(row.grade) ?? null;
    return {
      mode: "express",
      routeId: `${p.dep}-${p.arr}-${row.args[1] ?? ""}`,
      departTime: row.departTime,
      operator: row.operator,
      grade: row.grade,
      fare,
      remaining: row.remaining,
      total: null,
      departName: p.depName,
      arriveName: p.arrName,
    };
  });
}

/** Read the alcnSrchFrm hidden fields into a base form-state map. satschc.do
 *  expects the full form (populated by the search) plus the per-row overrides. */
function parseKobusForm(html: string): Record<string, string> {
  const form: Record<string, string> = {};
  const start = html.indexOf('id="alcnSrchFrm"');
  if (start < 0) return form;
  const end = html.indexOf("</form>", start);
  const frm = html.slice(start, end < 0 ? undefined : end);
  for (const m of frm.matchAll(/<input[^>]*\bname="([^"]+)"[^>]*>/g)) {
    const value = (m[0].match(/\bvalue="([^"]*)"/) ?? [, ""])[1] ?? "";
    form[m[1]] = value;
  }
  return form;
}

/** Parse express schedule rows from the search HTML. Each row is a
 *  role="row" block carrying an onclick fnSatsChc(...) with positional args
 *  plus visible operator / grade / inline-fare / remaining-seats text. */
function parseKobusRows(html: string): KobusRow[] {
  const out: KobusRow[] = [];
  // Real handler calls have quoted args (skip the JS comment template).
  const blocks = html.split(/<p [^>]*role="row"/).slice(1);
  for (const b of blocks) {
    const call = b.match(/fnSatsChc\((('[^']*'(?:\s*,\s*'[^']*')*))\)/);
    if (!call) continue;
    const args = call[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    const t = args[1] ?? ""; // alcn depart time HHMMSS
    const operator =
      (b.match(/class="bus_com"[^>]*>\s*<span[^>]*>([^<]+)</) ??
        b.match(/class="dyexpress">([^<]+)</) ??
        [])[1] ?? "";
    const grade = (b.match(/class="grade"[^>]*>\s*([^<\n]+)/) ?? [])[1] ?? "";
    const fareM = b.match(/\(([\d,]+)\s*원\)/);
    const remM = b.match(/class="remain"[^>]*>\s*([\d]+)\s*석/);
    out.push({
      args,
      departTime: t.length >= 4 ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : t,
      operator: operator.trim(),
      grade: grade.trim(),
      fare: fareM ? Number(fareM[1].replace(/,/g, "")) : null,
      remaining: remM ? Number(remM[1]) : null,
    });
  }
  return out;
}

/** Resubmit the full alcnSrchFrm to satschc.do for one express run and scrape
 *  adltFee / rmnSatsNum / totSatsNum from the seat-selection HTML. */
async function fetchKobusFee(
  baseForm: Record<string, string>,
  args: string[],
  cookie: string,
): Promise<{ fare: number | null; remaining: number | null; total: number | null } | null> {
  // fnSatsChc(deprDt,deprTime,alcnDeprTime,alcnDeprTrmlNo,alcnArvlTrmlNo,
  //           indVBusClsCd,cacmCd,dcDvsCd,mrsPsbYn,alertYn,deprTrmlNo,arvlTrmlNo,…)
  const form: Record<string, string> = {
    ...baseForm,
    deprDtm: args[0] ?? baseForm.deprDtm,
    deprTime: args[1] ?? "",
    alcnDeprTime: args[2] ?? "",
    alcnDeprTrmlNo: args[3] ?? "",
    alcnArvlTrmlNo: args[4] ?? "",
    indVBusClsCd: args[5] ?? "",
    cacmCd: args[6] ?? "",
    dcDvsCd: args[7] ?? "0",
    deprCd: args[10] ?? baseForm.deprCd,
    arvlCd: args[11] ?? baseForm.arvlCd,
  };

  const res = await fetch(KB_FEE, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Referer: KB_SEARCH,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
  });

  const html = await res.text();
  const pick = (key: string): number | null => {
    const m =
      html.match(new RegExp(`id=["']${key}["'][^>]*value=["']([\\d,]+)`)) ??
      html.match(new RegExp(`name=["']${key}["'][^>]*value=["']([\\d,]+)`));
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };
  const fare = pick("adltFee");
  if (fare === null) return null;
  return { fare, remaining: pick("rmnSatsNum"), total: pick("totSatsNum") };
}

import data from "./busTerminals.json";

export type BusTerminal = { code: string; name: string; region: string };

export const BUS_TERMINALS: BusTerminal[] = data as BusTerminal[];

// Region display order (matches Tmoney's grouping; metro cities are lumped
// under "특별/광역/자치").
const REGION_ORDER = [
  "특별/광역/자치",
  "경기도",
  "강원도",
  "충청북도",
  "충청남도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
];

export type BusRegionGroup = { region: string; terminals: BusTerminal[] };

/** Terminals grouped by region, in display order, names sorted. */
export function busTerminalsByRegion(): BusRegionGroup[] {
  const map = new Map<string, BusTerminal[]>();
  for (const t of BUS_TERMINALS) {
    const arr = map.get(t.region);
    if (arr) arr.push(t);
    else map.set(t.region, [t]);
  }
  return REGION_ORDER.filter((r) => map.has(r)).map((r) => ({
    region: r,
    terminals: map.get(r)!.sort((a, b) => a.name.localeCompare(b.name, "ko")),
  }));
}

export function busTerminalById(code: string): BusTerminal | undefined {
  return BUS_TERMINALS.find((t) => t.code === code);
}

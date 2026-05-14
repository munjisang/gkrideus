import { NextResponse } from "next/server";
import { getStationsCache } from "../../../lib/stationsServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const c = await getStationsCache();
    return NextResponse.json({
      ok: true,
      count: c.stations.length,
      fetchedAt: c.fetchedAt,
      cities: c.byCity.map((g) => ({
        cityCode: g.cityCode,
        cityName: g.cityName,
        stations: g.stations.map((s) => ({ id: s.id, name: s.name })),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}

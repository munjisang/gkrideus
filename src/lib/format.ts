/** "YYYYMMDDHHmm" → "HH:mm" */
export function fmtTime(plandTime: string): string {
  if (plandTime.length < 12) return plandTime;
  return `${plandTime.slice(8, 10)}:${plandTime.slice(10, 12)}`;
}

/** "YYYYMMDDHHmm" → "YYYY-MM-DD HH:mm" */
export function fmtDateTime(plandTime: string): string {
  if (plandTime.length < 12) return plandTime;
  return `${plandTime.slice(0, 4)}-${plandTime.slice(4, 6)}-${plandTime.slice(6, 8)} ${plandTime.slice(8, 10)}:${plandTime.slice(10, 12)}`;
}

/** "YYYYMMDD" → "YYYY-MM-DD" */
export function fmtDate(d: string): string {
  if (d.length < 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Minutes between two "YYYYMMDDHHmm" strings (handles next-day arrival). */
export function durationMinutes(dep: string, arr: string): number {
  const toDate = (s: string) =>
    new Date(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
    );
  const diff = (toDate(arr).getTime() - toDate(dep).getTime()) / 60000;
  return Math.max(0, Math.round(diff));
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function fmtKRW(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** Today as YYYYMMDD in local time. */
export function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** YYYYMMDD ↔ YYYY-MM-DD helpers for <input type="date"> */
export function isoToYYYYMMDD(iso: string): string {
  return iso.replace(/-/g, "");
}
export function yyyymmddToIso(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

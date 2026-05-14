"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pushRecent } from "../lib/recentStations";
import StationPicker from "../components/StationPicker";
import DatePickerSheet, { type DateHour } from "../components/DatePickerSheet";
import PassengersSheet, { type Passengers } from "../components/PassengersSheet";
import type { TripType } from "../lib/types";

type Station = { id: string; name: string };
type CityGroup = { cityCode: string; cityName: string; stations: Station[] };
type StationsResponse =
  | { ok: true; count: number; cities: CityGroup[] }
  | { ok: false; error: string };

function fmtDateHourLabel(v: DateHour | null): string {
  if (!v) return "";
  const [y, m, d] = v.date.split("-");
  return `${y}.${m}.${d} · ${String(v.hour).padStart(2, "0")}시 이후`;
}

function passengersLabel(p: Passengers): string {
  const parts: string[] = [];
  if (p.adults) parts.push(`어른 ${p.adults}`);
  if (p.children) parts.push(`어린이 ${p.children}`);
  if (p.toddlers) parts.push(`유아 ${p.toddlers}`);
  if (p.seniors) parts.push(`경로 ${p.seniors}`);
  return parts.length ? parts.join(" · ") : "성인 1명";
}

function totalPassengers(p: Passengers): number {
  return p.adults + p.children + p.toddlers + p.seniors;
}

export default function HomePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<CityGroup[] | null>(null);

  const [tripType, setTripType] = useState<TripType>("oneway");
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [outbound, setOutbound] = useState<DateHour | null>(null);
  const [inbound, setInbound] = useState<DateHour | null>(null);
  const [passengers, setPassengers] = useState<Passengers>({
    adults: 1,
    children: 0,
    toddlers: 0,
    seniors: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"dep" | "arr" | null>(null);
  const [datePicker, setDatePicker] = useState<"outbound" | "inbound" | null>(null);
  const [passengerSheet, setPassengerSheet] = useState(false);

  useEffect(() => {
    fetch("/api/stations", { cache: "force-cache" })
      .then((r) => r.json())
      .then((j: StationsResponse) => {
        if (j.ok) setGroups(j.cities);
      })
      .catch(() => {
        /* silent */
      });
  }, []);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  // All required fields filled → enable the submit button.
  const isValid =
    !!from &&
    !!to &&
    from.id !== to.id &&
    !!outbound &&
    (tripType === "oneway" || !!inbound) &&
    totalPassengers(passengers) >= 1;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) {
      setError("출발역과 도착역을 선택해주세요.");
      return;
    }
    if (from.id === to.id) {
      setError("출발역과 도착역이 같습니다.");
      return;
    }
    if (!outbound) {
      setError("가는 날을 선택해주세요.");
      return;
    }
    if (tripType === "roundtrip" && !inbound) {
      setError("오는 날을 선택해주세요.");
      return;
    }
    if (tripType === "roundtrip" && inbound && inbound.date < outbound.date) {
      setError("돌아오는 날짜가 가는 날짜보다 빠를 수 없습니다.");
      return;
    }
    if (totalPassengers(passengers) < 1) {
      setError("탑승객을 1명 이상 선택해주세요.");
      return;
    }
    setError(null);
    pushRecent(from);
    pushRecent(to);
    const params = new URLSearchParams({
      from: from.id,
      fromName: from.name,
      to: to.id,
      toName: to.name,
      date: outbound.date.replace(/-/g, ""),
      hour: String(outbound.hour),
      passengers: String(totalPassengers(passengers)),
      adults: String(passengers.adults),
      children: String(passengers.children),
      toddlers: String(passengers.toddlers),
      seniors: String(passengers.seniors),
      tripType,
    });
    if (tripType === "roundtrip" && inbound) {
      params.set("returnDate", inbound.date.replace(/-/g, ""));
      params.set("returnHour", String(inbound.hour));
    }
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <form
        onSubmit={onSubmit}
        className="bg-white border border-slate-100 overflow-hidden"
      >
        {/* Trip type */}
        <div className="px-5 pt-5 pb-2 flex gap-2">
          {[
            { v: "oneway", label: "편도" },
            { v: "roundtrip", label: "왕복" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setTripType(o.v as TripType)}
              className={`px-4 h-9 rounded-full text-sm font-medium border transition ${
                tripType === o.v
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Station selectors */}
        <div className="px-5 py-4 relative">
          <button
            type="button"
            onClick={() => setPicker("dep")}
            className="w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50 rounded-xl px-2 -mx-2 transition"
          >
            <span aria-hidden className="w-2.5 h-2.5 rounded-full border-2 border-slate-700 shrink-0" />
            <span className="flex-1">
              <span className="text-xs text-slate-400 block">출발</span>
              <span
                className={`text-xl font-semibold ${
                  from ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {from?.name ?? "출발역"}
              </span>
            </span>
          </button>

          <div className="h-px bg-slate-100 my-1 ml-6" />

          <button
            type="button"
            onClick={() => setPicker("arr")}
            className="w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50 rounded-xl px-2 -mx-2 transition"
          >
            <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <span className="flex-1">
              <span className="text-xs text-slate-400 block">도착</span>
              <span
                className={`text-xl font-semibold ${
                  to ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {to?.name ?? "도착역"}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={swap}
            aria-label="역 바꾸기"
            className="absolute right-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-500 hover:text-slate-900 hover:border-slate-300 transition shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {/* Up arrow */}
              <path d="M7 19V5" />
              <path d="M4 8l3-3 3 3" />
              {/* Down arrow */}
              <path d="M17 5v14" />
              <path d="M14 16l3 3 3-3" />
            </svg>
          </button>
        </div>

        <div className="h-px bg-slate-100 mx-5" />

        {/* Date rows — each on its own line, opens DatePickerSheet */}
        <div className="px-5">
          <DateRow
            label="가는 날"
            value={outbound}
            onOpen={() => setDatePicker("outbound")}
          />
          {tripType === "roundtrip" && (
            <>
              <DateRow
                label="오는 날"
                value={inbound}
                onOpen={() => setDatePicker("inbound")}
              />
            </>
          )}
        </div>

        <div className="h-px bg-slate-100 mx-5" />

        {/* Passengers row — opens PassengersSheet */}
        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => setPassengerSheet(true)}
            className="w-full flex items-center justify-between py-3.5 text-left hover:bg-slate-50 rounded-xl px-2 -mx-2 transition"
          >
            <span className="text-sm text-slate-500">인원</span>
            <span className="text-[15px] font-medium text-slate-900">
              {passengersLabel(passengers)}
              <svg
                className="inline-block ml-1 -mt-0.5 text-slate-400"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </button>
        </div>

        {error && (
          <div className="mx-5 mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="px-5 py-4">
          <button
            type="submit"
            disabled={!isValid}
            className={`w-full h-12 rounded-xl font-semibold transition ${
              isValid
                ? "bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.99]"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            열차 조회
          </button>
        </div>
      </form>

      <StationPicker
        open={picker !== null}
        groups={groups}
        onClose={() => setPicker(null)}
        onPick={(s) => {
          if (picker === "dep") setFrom(s);
          else if (picker === "arr") setTo(s);
          pushRecent(s);
          setPicker(null);
        }}
      />

      <DatePickerSheet
        open={datePicker === "outbound"}
        title="가는 날 선택"
        value={outbound}
        onClose={() => setDatePicker(null)}
        onPick={(v) => {
          setOutbound(v);
          // Auto-clamp inbound if it's now earlier
          if (inbound && inbound.date < v.date) setInbound(null);
          setDatePicker(null);
        }}
      />

      <DatePickerSheet
        open={datePicker === "inbound"}
        title="오는 날 선택"
        value={inbound}
        minDate={outbound?.date}
        onClose={() => setDatePicker(null)}
        onPick={(v) => {
          setInbound(v);
          setDatePicker(null);
        }}
      />

      <PassengersSheet
        open={passengerSheet}
        value={passengers}
        onClose={() => setPassengerSheet(false)}
        onPick={(v) => {
          setPassengers(v);
          setPassengerSheet(false);
        }}
      />
    </div>
  );
}

function DateRow({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: DateHour | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between py-3.5 text-left hover:bg-slate-50 rounded-xl px-2 -mx-2 transition"
    >
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-[15px] font-medium ${
          value ? "text-slate-900" : "text-slate-400"
        }`}
      >
        {value ? fmtDateHourLabel(value) : "탑승일"}
        <svg
          className="inline-block ml-1 -mt-0.5 text-slate-400"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </span>
    </button>
  );
}

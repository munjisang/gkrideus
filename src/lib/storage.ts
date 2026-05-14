import type { Order } from "./types";
import { getSupabase } from "./supabaseClient";

const KEY = "korail.orders";

// ───────────────────────────────────────── ID generator (still sync)
export function newOrderId(): string {
  return `OD${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0")}`;
}

// ───────────────────────────────────────── localStorage fallback
function lsLoad(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}
function lsWrite(orders: Order[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(orders));
}

// ───────────────────────────────────────── Supabase row mapping
type Row = {
  id: string;
  created_at: string;
  trip_type: Order["tripType"];
  seat_type: Order["seatType"];
  inbound_seat_type: Order["seatType"] | null;
  passenger_count: number;
  total_price: number;
  outbound: Order["outbound"];
  inbound: Order["inbound"] | null;
  passengers: Order["passengers"];
  reservation: Order["reservation"] | null;
};

function rowToOrder(r: Row): Order {
  return {
    id: r.id,
    createdAt: r.created_at,
    tripType: r.trip_type,
    seatType: r.seat_type,
    inboundSeatType: r.inbound_seat_type ?? undefined,
    passengerCount: r.passenger_count,
    totalPrice: r.total_price,
    outbound: r.outbound,
    inbound: r.inbound ?? undefined,
    passengers: r.passengers,
    reservation: r.reservation ?? undefined,
  };
}
function orderToRow(o: Order): Row {
  return {
    id: o.id,
    created_at: o.createdAt,
    trip_type: o.tripType,
    seat_type: o.seatType,
    inbound_seat_type: o.inboundSeatType ?? null,
    passenger_count: o.passengerCount,
    total_price: o.totalPrice,
    outbound: o.outbound,
    inbound: o.inbound ?? null,
    passengers: o.passengers,
    reservation: o.reservation ?? null,
  };
}

// ───────────────────────────────────────── Public API (async)

export async function loadOrders(): Promise<Order[]> {
  const sb = getSupabase();
  if (!sb) return lsLoad();
  const { data, error } = await sb
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Supabase loadOrders failed, falling back to localStorage:", error.message);
    return lsLoad();
  }
  return (data ?? []).map((r) => rowToOrder(r as Row));
}

export async function saveOrder(order: Order): Promise<Order> {
  const sb = getSupabase();
  if (!sb) {
    const all = lsLoad();
    all.unshift(order);
    lsWrite(all);
    return order;
  }
  const { error } = await sb.from("orders").insert(orderToRow(order));
  if (error) {
    console.warn("Supabase saveOrder failed, falling back to localStorage:", error.message);
    const all = lsLoad();
    all.unshift(order);
    lsWrite(all);
  }
  return order;
}

export async function deleteOrder(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    lsWrite(lsLoad().filter((o) => o.id !== id));
    return;
  }
  const { error } = await sb.from("orders").delete().eq("id", id);
  if (error) console.warn("Supabase deleteOrder failed:", error.message);
}

export async function clearOrders(): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    lsWrite([]);
    return;
  }
  const { error } = await sb.from("orders").delete().neq("id", "");
  if (error) console.warn("Supabase clearOrders failed:", error.message);
}

export async function updateOrder(
  id: string,
  patch: Partial<Order>,
): Promise<Order | undefined> {
  const sb = getSupabase();
  if (!sb) {
    const all = lsLoad();
    const idx = all.findIndex((o) => o.id === id);
    if (idx < 0) return undefined;
    const next = { ...all[idx], ...patch } as Order;
    all[idx] = next;
    lsWrite(all);
    return next;
  }
  // Only the patched fields go to the DB; mirror camelCase → snake_case.
  const dbPatch: Record<string, unknown> = {};
  if (patch.tripType !== undefined) dbPatch.trip_type = patch.tripType;
  if (patch.seatType !== undefined) dbPatch.seat_type = patch.seatType;
  if (patch.inboundSeatType !== undefined)
    dbPatch.inbound_seat_type = patch.inboundSeatType ?? null;
  if (patch.passengerCount !== undefined) dbPatch.passenger_count = patch.passengerCount;
  if (patch.totalPrice !== undefined) dbPatch.total_price = patch.totalPrice;
  if (patch.outbound !== undefined) dbPatch.outbound = patch.outbound;
  if (patch.inbound !== undefined) dbPatch.inbound = patch.inbound ?? null;
  if (patch.passengers !== undefined) dbPatch.passengers = patch.passengers;
  if (patch.reservation !== undefined) dbPatch.reservation = patch.reservation ?? null;

  const { data, error } = await sb
    .from("orders")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.warn("Supabase updateOrder failed:", error.message);
    return undefined;
  }
  return data ? rowToOrder(data as Row) : undefined;
}

-- KORAIL PoC — Supabase schema
-- Run this in Supabase SQL Editor on a fresh project.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- orders table
-- Each row is a single order made from the user-facing flow.
-- Train legs / passenger info / reservation result are stored as JSONB
-- to keep the schema flexible during PoC. Promote to normalized columns
-- when moving to production.
create table if not exists public.orders (
    id            text primary key,
    created_at    timestamptz not null default now(),

    trip_type     text not null check (trip_type in ('oneway','roundtrip')),
    seat_type     text not null check (seat_type in ('standard','first')),
    inbound_seat_type text check (inbound_seat_type in ('standard','first')),

    passenger_count int  not null check (passenger_count >= 1),
    total_price     int  not null check (total_price >= 0),

    outbound      jsonb not null,
    inbound       jsonb,
    passengers    jsonb not null default '[]'::jsonb,

    -- Result of the admin [예매하기] action; null until reserved.
    reservation         jsonb,
    inbound_reservation jsonb
);

-- Idempotent migration for existing projects that created the table before
-- this column existed.
alter table public.orders
    add column if not exists inbound_reservation jsonb;

create index if not exists orders_created_at_idx
    on public.orders (created_at desc);


-- ─────────────────────────────────────────────────────────────────
-- Row Level Security
-- For the PoC we allow anonymous read/write so the demo works end-to-end
-- without an auth layer. Tighten this before shipping to real users.
alter table public.orders enable row level security;

drop policy if exists "anon_all" on public.orders;
create policy "anon_all"
    on public.orders
    for all
    using (true)
    with check (true);


-- ─────────────────────────────────────────────────────────────────
-- Optional: keep created_at consistent on updates
create or replace function public.touch_orders_updated()
returns trigger language plpgsql as $$
begin
    return new;
end;
$$;

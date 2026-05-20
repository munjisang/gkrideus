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
    pax_breakdown   jsonb,
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
alter table public.orders
    add column if not exists pax_breakdown jsonb;

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


-- ─────────────────────────────────────────────────────────────────
-- korail_credentials — single-row table holding the Korail account used by
-- the Python serverless functions for live booking. Editable from the
-- admin UI; the Python side falls back to KORAIL_ID / KORAIL_PASSWORD env
-- vars when this row is empty.
create table if not exists public.korail_credentials (
    id              text primary key default 'default',
    korail_id       text not null,
    korail_password text not null,
    updated_at      timestamptz not null default now()
);

alter table public.korail_credentials enable row level security;

-- Block every anon access — reads/writes go through Next.js API routes
-- using the service role key, which bypasses RLS by design.
drop policy if exists "no_anon" on public.korail_credentials;
create policy "no_anon"
    on public.korail_credentials
    for all
    to anon
    using (false)
    with check (false);


-- ─────────────────────────────────────────────────────────────────
-- service_accounts — multi-row credentials table. Replaces the older
-- single-row `korail_credentials` table. Holds Korail and (future) SRT
-- accounts, with an enabled flag so the admin can toggle without
-- deleting. The Python serverless functions pick the first enabled row
-- for the requested service.
create table if not exists public.service_accounts (
    id               uuid primary key default gen_random_uuid(),
    service          text not null check (service in ('korail', 'srt')),
    account_id       text not null,
    account_password text not null,
    enabled          boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (service, account_id)
);

create index if not exists service_accounts_service_enabled_idx
    on public.service_accounts (service, enabled);

alter table public.service_accounts enable row level security;

drop policy if exists "no_anon" on public.service_accounts;
create policy "no_anon"
    on public.service_accounts
    for all
    to anon
    using (false)
    with check (false);

-- One-shot migration from the older single-row table — copies any
-- existing Korail credentials into the new structure. Safe to re-run.
insert into public.service_accounts (service, account_id, account_password, enabled)
select 'korail', korail_id, korail_password, true
from public.korail_credentials
where korail_id is not null and korail_password is not null
on conflict (service, account_id) do nothing;

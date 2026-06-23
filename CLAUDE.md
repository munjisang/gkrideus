# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> ⚠️ This is **Next.js 16.2.6 + React 19.2** (see [package.json](package.json)). App Router APIs and conventions differ from older training data. Before writing framework code, read the relevant guide under `node_modules/next/dist/docs/` and heed deprecation notices (per AGENTS.md above).

## What this is

A transportation booking app for **GROUNDK / K.Rideus** (the `package.json` name `korail` is legacy — this is not Korail's site). It books **trains** (KTX family via Korail, plus SRT) and **buses** (intercity + express), with a customer flow and an `/admin` console that performs the actual carrier reservations.

Two distinct things live in one repo and one deployment:

1. **The Next.js reservation app** — [src/app/](src/app/) (App Router). The real search → order → booking flow.
2. **The static prototype site** — [krideus-prototype/](krideus-prototype/). Hand-authored HTML marketing/category microsites (airport, event, leisure, sports-shuttle, theme-park, …). Served as static files, *not* React.

## Commands

```bash
npm run dev      # sync-prototype --link  +  next dev   (http://localhost:3000)
npm run build    # sync-prototype --copy  +  next build
npm start        # next start (prod server)
npm run lint     # eslint (flat config, eslint-config-next)
vercel dev       # full local env INCLUDING the Python booking functions
```

There is **no test suite** in this repo — don't assume one exists.

The Python booking endpoints ([api/booking/](api/booking/)) only run under `vercel dev` or on Vercel, **not** under `npm run dev`. To exercise live/dry-run booking locally, use `vercel dev` with env pulled (`vercel env pull .env.local`).

## The prototype sync step (don't skip it)

[scripts/sync-prototype.mjs](scripts/sync-prototype.mjs) runs automatically before `dev`/`build` and materializes the prototype's served directories into `public/` so Next can serve them. Both modes are intentional:

- `--link` (dev): symlinks `public/<dir>` → `krideus-prototype/<dir>` so edits in `krideus-prototype/` are live.
- `--copy` (build): real recursive copies — `next build` chokes on symlinks pointing back into the repo.

The materialized dirs (`public/prototype`, `public/assets`, `public/event`, …) are **gitignored and generated** — never edit them or commit them. Edit the originals under `krideus-prototype/`. If you add a new top-level served directory to the prototype, add it to the `DIRS` array in the sync script.

The landing page `/` is a **runtime route handler** ([src/app/route.ts](src/app/route.ts)), not a React page: it reads `krideus-prototype/prototype/index.html` at request time, injects `<base href="/prototype/">`, and serves it so the prototype hub appears at `/` with the address bar unchanged. [next.config.ts](next.config.ts) bundles that HTML into the serverless function via `outputFileTracingIncludes`.

## Booking automation (the core/risky part)

Carrier reservations run as **Vercel Python serverless functions** under [api/booking/](api/booking/) (`reserve.py`, `cancel.py`, `availability.py`, `sync.py`) — *not* Next.js API routes. (Node can't `spawn` Python on Vercel.) Configured in [vercel.json](vercel.json) with `@vercel/python` runtime, `maxDuration: 60`, region `icn1`. See [docs/booking-setup.md](docs/booking-setup.md) for the operational runbook.

Key facts when touching booking:

- **Two carriers, one envelope.** Korail/KTX goes through the unofficial `korail2-ncard` lib; SRT goes through `SRTrain`. [api/booking/reserve.py](api/booking/reserve.py) branches on the carrier (`_resolve_service`) but normalizes both into the **same response shape** (`{ ok, stage, mode, train, reservation? }`) and the same reservation dict keys, so the front-end ([src/app/order/OrderView.tsx](src/app/order/OrderView.tsx)) needs no carrier-specific code.
- **Shared Python helpers** live in [scripts/](scripts/): `ktx_booking.py` (the `PatchedKorail` class), `korail_tls.py` (legacy TLS shim). These are imported by the `api/` functions, not run standalone.
- **Two-gate live safety.** A real `reserve()` only fires when **both** `KORAIL_RESERVE_LIVE=1` (env) **and** request `live: true` (admin toggle + confirm). Otherwise it's a dry-run (search + match only). Never weaken this without explicit instruction.
- **Multi-account retry.** Credentials come from the Supabase `service_accounts` table ordered by `display_order` ([api/_lib/creds.py](api/_lib/creds.py)). `reserve.py` retries each enabled account on failure, except deterministic `_NON_RETRY_STAGES` (`input`, `import`, `match`, `dry-run`).

## Data sources & persistence

- **Trains**: TAGO open API (`data.go.kr`, `TAGO_SERVICE_KEY`) in [src/app/api/trains/route.ts](src/app/api/trains/route.ts); falls back to a **deterministic mock schedule** when TAGO fails (`source: "mock"` in the response). Station list is fetched + cached server-side in [src/lib/stationsServer.ts](src/lib/stationsServer.ts).
- **Buses**: live HTML/endpoint scraping of tmoney (intercity) and KOBUS (express) in [src/app/api/bus/search/route.ts](src/app/api/bus/search/route.ts).
- **Orders**: Supabase `orders` table via [src/lib/storage.ts](src/lib/storage.ts), which **falls back to `localStorage`** when Supabase env vars are absent (local dev / preview). JSONB-heavy schema (PoC). See [supabase/schema.sql](supabase/schema.sql) — apply it manually in the Supabase SQL editor.
- **RLS posture**: `orders` allows anon read/write (PoC convenience). `service_accounts` / `service_settings` / `korail_credentials` **block anon entirely** — they're reached only via the `service_role` key, server-side.

## Server-side access patterns

- **Browser → Supabase**: [src/lib/supabaseClient.ts](src/lib/supabaseClient.ts) (`anon` key, returns `null` when env missing).
- **Admin API routes → Supabase**: [src/lib/supabaseAdmin.ts](src/lib/supabaseAdmin.ts) (`service_role` key, bypasses RLS). Every admin route must call `requireAdmin()` first.
- **Admin auth** is a stateless **HMAC-signed cookie** ([src/lib/adminSession.ts](src/lib/adminSession.ts)) — no session table. Requires `ADMIN_SESSION_SECRET` (≥16 chars, throws otherwise) and `ADMIN_PASSWORD`.

## Conventions

- **Path alias**: `@/*` → `./src/*` ([tsconfig.json](tsconfig.json)). Many older files use deep relative imports (`../../lib/...`) — both work.
- **i18n**: custom provider, not a library. `LangProvider` + `useI18n()` in [src/lib/i18n.tsx](src/lib/i18n.tsx), flat `ko`/`en` dictionary; persisted to `localStorage`. Server-callable label helpers (`stationLabel`, `gradeLabel`, `romanize`, …) live in [src/lib/labels.ts](src/lib/labels.ts) and are re-exported from `i18n.tsx`.
- **Design system**: Apple-inspired tokens defined as Tailwind v4 `@theme` variables in [src/app/globals.css](src/app/globals.css) (single Action Blue `#0066cc`, near-black ink, exactly one shadow, Pretendard font). The source spec is [DESIGN-apple.md](DESIGN-apple.md). Style new UI with these tokens (`text-ink`, `bg-parchment`, `shadow-product`, etc.).
- Carrier API responses use a `{ ok, stage, error? }` envelope throughout (both Python and TS) — preserve it.

## Environment variables

| Var | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser Supabase client |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | admin routes + Python functions |
| `TAGO_SERVICE_KEY` | train schedule + station lookup (a hardcoded fallback key exists) |
| `KORAIL_RESERVE_LIVE` | live-booking master switch (`1` to allow) |
| `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD` | `/admin` auth |
| `KORAIL_ID` / `KORAIL_PASSWORD` | bootstrap carrier creds (DB `service_accounts` is preferred) |

Python deps for the booking functions are in [requirements.txt](requirements.txt) (`korail2-ncard`, `pycryptodome`, `SRTrain`); Vercel installs them at build.

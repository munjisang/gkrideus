/**
 * Server-only Supabase helpers for admin API routes.
 *
 * Uses the service_role key (NEVER expose this to the browser). All admin
 * routes share these helpers so the env-var resolution + base URL
 * normalisation lives in one place.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "./adminSession";

export type SupaCfg = { base: string; key: string };

export function supabaseConfig(): SupaCfg | null {
  const base =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}

/** Returns null when the request is admin-authenticated, or a 401 response otherwise. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const jar = await cookies();
  if (!verifyAdminToken(jar.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** Thin REST wrapper around PostgREST with the service_role key. */
export async function supaFetch(
  cfg: SupaCfg,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${cfg.base}${path}`, { ...init, headers, cache: "no-store" });
}

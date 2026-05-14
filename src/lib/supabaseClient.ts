import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let cached: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client. Returns null when env vars are missing so
 * callers can gracefully fall back to localStorage during local dev / preview.
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (cached) return cached;
  cached = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cached;
}

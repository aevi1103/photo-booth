"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Ask the booth administrator to set it up.");
  client ??= createClient(url, key);
  return client;
}

export type Background = { id: string; name: string; path: string };
export type Photo = { id: string; path: string; created_at: string };

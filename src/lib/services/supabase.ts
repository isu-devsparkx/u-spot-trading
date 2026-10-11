// ─── U-SPOT Supabase Client Singleton ──────────────────────────────────
// Phase 8: Signal Persistence
// Spec Section 35: Free-first constraint — Supabase free tier
// Gracefully handles missing credentials so dev/test runs smoothly

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

let cachedClient: SupabaseClient | null = null;

/**
 * Returns true if valid Supabase URL and key are configured in environment
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      supabaseUrl.startsWith('http') &&
      !supabaseUrl.includes('placeholder')
  );
}

/**
 * Get or initialize the Supabase client singleton.
 * Returns null if Supabase credentials are not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedClient;
}

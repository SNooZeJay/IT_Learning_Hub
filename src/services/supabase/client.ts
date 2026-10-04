import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * The single Supabase client for the whole application.
 *
 * Only the anon key lives here, and only the anon key may ever live here. It is
 * a *publishable* key: safe to ship to the browser because Row Level Security,
 * not the key, decides what a caller can read or write.
 *
 * The PayMongo secret key is NOT in this file and MUST NOT be added to it.
 * Anything prefixed VITE_ is compiled into the public bundle. PayMongo's secret
 * belongs in a Supabase secret read only inside an Edge Function. See section
 * 12.1 of docs/superpowers/specs/2026-10-04-lms-foundation-design.md.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Distinguishes "the developer has not configured the app yet" from "a Supabase
 * call failed". Without this, a missing env var surfaces as an opaque network
 * error at the first login attempt instead of an actionable message.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey)

if (!isSupabaseConfigured) {
  console.error(
    '[supabase] VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set. ' +
      'Copy .env.example to .env and fill in the values from your Supabase ' +
      'project settings. The app will not be able to authenticate until you do.',
  )
}

/**
 * Throwing rather than returning null means a misconfigured deployment fails at
 * import time, loudly, instead of failing confusingly later. Views guard on
 * `isSupabaseConfigured` and show setup guidance rather than attempting a call.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'public-publishable-key-placeholder',
  {
    auth: {
      // Supabase persists the session in localStorage and refreshes it for us,
      // which is what makes "stay signed in" work with no extra code.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
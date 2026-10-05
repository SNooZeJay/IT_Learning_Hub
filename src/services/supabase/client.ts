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
 * Distinguishes "this deployment was never configured" from "a Supabase call
 * failed".
 *
 * Without this, a missing env var surfaces as `TypeError: Failed to fetch` at the
 * first login attempt. On a deployed site that message is actively misleading: it
 * looks like the server is down, when in fact the bundle was built with no
 * database address at all.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey)

if (!isSupabaseConfigured) {
  console.error(
    '[supabase] VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set.\n' +
      'Locally: copy .env.example to .env and fill in the values from Supabase project settings.\n' +
      'On Vercel: add both as Environment Variables and REDEPLOY. Vite inlines VITE_* at\n' +
      'build time, so setting them after the first deploy has no effect until a rebuild.',
  )
}

/**
 * The message shown when the app has no database configured.
 *
 * Kept here rather than repeated per view so it says the same thing everywhere,
 * and so a demo that hits this reads as a diagnosis instead of a crash.
 */
export const NOT_CONFIGURED_MESSAGE =
  'This deployment is not connected to a database yet. Add VITE_SUPABASE_URL and ' +
  'VITE_SUPABASE_PUBLISHABLE_KEY to the Vercel environment variables, then redeploy.'

/**
 * Turn a thrown value into something a person can act on.
 *
 * A raw `TypeError: Failed to fetch` is the single most common thing this app
 * shows when something is wrong, and it names no cause and no next step. This maps
 * the two cases worth distinguishing — misconfigured, and genuinely offline — and
 * passes anything that already reads as a sentence straight through.
 */
export function describeSupabaseError(error: unknown): string {
  if (!isSupabaseConfigured) return NOT_CONFIGURED_MESSAGE

  const raw = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return raw
}

/**
 * Pulls the real message out of a failed Edge Function call.
 *
 * `supabase.functions.invoke` wraps any non-2xx response in a FunctionsHttpError
 * whose message is "Edge Function returned a non-2xx status code". The actual
 * message the function wrote is in `error.context`, already parsed when the
 * response was JSON. Reading `error.message` alone throws away the only useful
 * sentence - which on this project is usually the exact reason the mail or the
 * payment could not be processed.
 *
 * Returns null when there is nothing better to say, so the caller can fall back
 * to its own wording.
 */
export function readFunctionError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null

  const context = (error as { context?: unknown }).context
  if (typeof context === 'string' && context.trim()) return context.trim()

  if (typeof context === 'object' && context !== null) {
    const body = context as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  }

  return null
}

/**
 * The client is still constructed when unconfigured, because throwing at import
 * time takes down the whole app including the page that would explain the problem.
 *
 * The placeholder host is deliberately a name that cannot resolve, rather than
 * `http://localhost:54321`. The localhost fallback looked plausible and was
 * actively harmful on a deployed site: the browser tried to reach the visitor's
 * own machine, so every request failed with a network error that pointed at
 * nothing. A non-resolving host fails the same way but says so when read.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url || 'https://not-configured.supabase.invalid',
  publishableKey || 'publishable-key-not-configured',
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

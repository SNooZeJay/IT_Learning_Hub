import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { humanizeError } from '../errors'
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
 * Kept here rather than repeated per view so it says the same thing everywhere.
 *
 * It used to be deployment instructions addressed to whoever was deploying:
 *
 *     This deployment is not connected to a database yet. Add VITE_SUPABASE_URL and
 *     VITE_SUPABASE_PUBLISHABLE_KEY to the Vercel environment variables, then redeploy.
 *
 * That is the right sentence for a person holding the deployment, and `console.error`
 * above already says it - including which file to copy and which dashboard to read. A
 * visitor who lands on a site in this state is not going to fix it, and the four public
 * pages that render this were showing it to anyone at all. So the page says what the
 * reader can act on, and the console keeps the diagnosis for the operator.
 */
export const NOT_CONFIGURED_MESSAGE =
  'This site cannot reach its data right now. Please try again shortly, and contact the site ' +
  'administrator if it keeps happening.'

/**
 * The last-resort wording when a failure has nothing more specific to say.
 *
 * Deliberately actionable. It is what a caller gets when the thrown value was database
 * output with no agreed plain-language meaning, and it is the last thing standing
 * between a raw refusal and the screen.
 */
const GENERIC_ERROR_MESSAGE =
  'Something went wrong and the request did not complete. Please try again in a moment.'

/**
 * Turn a thrown value into something a person can act on.
 *
 * A raw `TypeError: Failed to fetch` is the single most common thing this app
 * shows when something is wrong, and it names no cause and no next step. This maps
 * the two cases worth distinguishing — misconfigured, and genuinely offline — and
 * passes anything that already reads as a sentence straight through.
 *
 * Everything else goes through `humanizeError`, which is the whole point of this
 * change. This function was the last route by which a Supabase message could reach a
 * screen unwashed: it handled exactly two shapes and returned `error.message` for
 * every other one, so a `42501` from PostgREST or a constraint name from GoTrue arrived
 * verbatim. All seven public pages call it — the landing page, the catalogue, the course
 * page, and the four auth screens — which made it the widest path this project had from
 * a database refusal to a stranger.
 *
 * `fallback` is the caller's own wording, used whenever the failure is database output
 * with no agreed meaning. It is optional so the existing call sites keep working, and
 * they should each pass something that names what failed.
 */
export function describeSupabaseError(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE,
): string {
  if (!isSupabaseConfigured) return NOT_CONFIGURED_MESSAGE

  const raw = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return humanizeError(raw, fallback)
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
 * How long an Edge Function call may take before it is abandoned.
 *
 * A hung function is indistinguishable from a slow one if you wait forever, and
 * the user only sees a spinner. `create-checkout` waits on a third-party payment
 * provider; `send-email` waits on an SMTP relay. Both can hang on a connection
 * that never resolves, and without a deadline the button they were pressed from
 * spins until the tab is closed.
 *
 * Not a value the server reads. It aborts the client's own request.
 */
export const FUNCTION_TIMEOUT_MS = 20_000

/**
 * A real message for a call that hit the deadline.
 *
 * Named rather than generic because the caller's own error text for a failed
 * fetch is `TypeError: Failed to fetch`, which names neither the cause nor the
 * next step - and on this project it is the single most common message a user
 * sees for an unrelated problem.
 */
export const FUNCTION_TIMEOUT_MESSAGE =
  'The request took too long and was stopped. Nothing was saved. Please try again in a moment.'

/**
 * Invoke an Edge Function with a deadline that actually aborts the request.
 *
 * `supabase.functions.invoke` returns `{ data, error }` and never throws, so the
 * abort has to be signalled by us: the SDK wraps the underlying `fetch`
 * rejection in a `FunctionsFetchError` whose message is the same
 * `TypeError: Failed to fetch` a genuine network failure produces. This wraps
 * the call in its own `AbortController` so a timeout is distinguishable from a
 * dead network and can be reported as what it is.
 *
 * Returns the same `{ data, error }` shape as the underlying call, so callers
 * keep their existing error handling; `error` is a `FunctionTimeoutError` when
 * the deadline is what ended it.
 */
export interface FunctionResult<T> {
  data: T | null
  error: unknown
}

export class FunctionTimeoutError extends Error {
  constructor(
    readonly functionName: string,
    readonly timeoutMs: number,
  ) {
    super(
      `"${functionName}" did not answer within ${Math.round(timeoutMs / 1000)} seconds. ${FUNCTION_TIMEOUT_MESSAGE}`,
    )
    this.name = 'FunctionTimeoutError'
  }
}

export async function invokeFunction<T>(
  functionName: string,
  options: { body?: unknown } = {},
  timeoutMs: number = FUNCTION_TIMEOUT_MS,
): Promise<FunctionResult<T>> {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  // Both call sites pass a plain object, which is the one body type the SDK
  // accepts alongside the binary ones. Omitting the key entirely when there is
  // no body keeps this typed, rather than casting `unknown` into the union.
  const request: Parameters<typeof supabase.functions.invoke>[1] = {
    signal: controller.signal,
    ...(options.body === undefined ? {} : { body: options.body as Record<string, unknown> }),
  }

  try {
    const result = await supabase.functions.invoke(functionName, request)

    // A response that arrived after the deadline is still a response. Handing it
    // back is correct - the caller asked a question and got an answer - and
    // discarding it would report a failure for a call that in fact succeeded.
    if (timedOut && result.error) {
      return { data: null, error: new FunctionTimeoutError(functionName, timeoutMs) }
    }

    return { data: (result.data ?? null) as T | null, error: result.error }
  } catch (error) {
    // The SDK resolves `{ error }` rather than throwing, so this is only reached
    // if something above it does throw. A timeout here is still a timeout.
    if (timedOut) {
      return { data: null, error: new FunctionTimeoutError(functionName, timeoutMs) }
    }
    return { data: null, error }
  } finally {
    // Cleared whether the call resolved, failed or aborted. Without this the
    // timer holds the closure - and the signal it aborts - for another 20s after
    // every successful call.
    clearTimeout(timer)
  }
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

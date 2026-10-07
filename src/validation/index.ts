/**
 * The application's entry point into the shared validation rules.
 *
 * Everything lives in `supabase/functions/_shared/validation.ts` because that is the
 * only directory guaranteed to be deployed alongside an Edge Function. This module
 * re-exports it and adds the two things that are genuinely browser-only - file handling
 * and the Supabase error-message cleanup that nine services were each carrying a copy of.
 *
 * A rule behaves the same wherever it is called. `isSameOriginUrl` is the clearest
 * example: `create-checkout` uses it to refuse a redirect off this deployment, and the
 * catalog can use it for a `?next=` parameter, from the same function body.
 */

export * from '../../supabase/functions/_shared/validation'

// `export *` puts these on the module's public surface but not in this file's own scope,
// so anything used below has to be named explicitly as well.
import { MAX_TEXT_LENGTH, isUuid } from '../../supabase/functions/_shared/validation'
import type { Result } from '../../supabase/functions/_shared/validation'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Strip the decoration PostgREST puts on a Postgres message.
 *
 * `ERROR: ` and `23505: ` arrive in front of the sentence a person needs to read, and the
 * nine copies of this regex across the services had already drifted into two variants -
 * some taking `unknown`, some not. One definition, one behaviour.
 */
export function messageOf(error: { message: string } | null, fallback: string): string {
  const raw = error?.message?.replace(/^(?:ERROR:\s*|[A-Z]{5}:\s*)/, '').trim()
  return raw ? raw : fallback
}

/** The same, for a caught value that is not known to be a PostgREST error. */
export function messageOfUnknown(error: unknown, fallback: string): string {
  if (error instanceof Error) return messageOf(error, fallback)
  if (typeof error === 'string') return messageOf({ message: error }, fallback)
  return fallback
}

// ---------------------------------------------------------------------------
// Route and query parameters
// ---------------------------------------------------------------------------

/**
 * A route parameter that must be a UUID, or `null`.
 *
 * Eleven call sites read `String(route.params.id ?? '')` and passed the result straight
 * to a `.eq('id', value)`. A malformed value came back as `22P02 invalid input syntax for
 * type uuid`, which is a database data-type error shown to somebody who did nothing
 * wrong. Returning `null` instead sends the caller down the path it already has - the
 * not-found branch every one of those pages implements.
 *
 * `null` rather than a thrown error is deliberate: a bad URL is not an exceptional
 * condition, it is a link that does not resolve, and the pages are already written to
 * render that.
 */
export function uuidParam(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return isUuid(trimmed) ? trimmed : null
}

/**
 * A query parameter, read only when it is a single usable string.
 *
 * `?q=a&q=b` arrives as an array; `Number.isFinite`, `.replace` and `.trim` all throw on
 * one. Every call site in the project already guarded with `typeof x === 'string'` -
 * this is that guard, named.
 */
export function stringQuery(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.slice(0, maxLength)
}

/**
 * A query parameter that must name a member of a closed set.
 *
 * `auth/Catalog.vue` already did this by hand for `level`, and the reasoning it records
 * is the reason this is shared: `/courses?level=wizard` should render the full catalogue,
 * not an error page. An unrecognised value falls back to the default rather than failing.
 */
export function enumQuery<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback
}

// ---------------------------------------------------------------------------
// The one validator services and forms both call
// ---------------------------------------------------------------------------

/**
 * Run a check and throw a named error when it fails.
 *
 * For the boundary of a service function, where returning a Result would only mean the
 * caller has to remember to look. The service layer throws; forms call the rule
 * functions directly and read the Result, because a form needs to place the message
 * beside a field and an exception cannot do that.
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    /** Which rule failed, for a caller that wants to branch. */
    readonly rule: string,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function assertValid(result: Result, rule: string): void {
  if (!result.ok) throw new ValidationError(result.reason, rule)
}

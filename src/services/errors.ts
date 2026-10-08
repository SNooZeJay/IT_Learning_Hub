/**
 * The one place a database failure becomes a sentence.
 *
 * Every service in this folder reads from Postgres through Supabase, and every
 * refusal - a duplicate slug, a missing row, a permission denial, a length
 * limit - arrives as the exact text the database chose to say. Several of those
 * messages were written for somebody reading a log:
 *
 *     duplicate key value violates unique constraint "categories_slug_key"
 *     update or delete on table course_categories violates foreign key constraint ...
 *     permission denied for function set_user_role
 *
 * Passing those to a view means an administrator clicking "Save" is told about
 * a constraint name. That is the developer's implementation showing through the
 * product, and it is the same class of problem as printing a trigger name in the
 * profile page: the enforcement stays where it belongs, in the database, and the
 * interface states the behaviour in the language of the task.
 *
 * So the rule this module enforces is narrow and deliberate:
 *
 *   1. A message this codebase wrote itself passes through untouched. Those are
 *      already written for a person - "Give the notice a title.", "Cannot demote
 *      the last administrator." - and rewriting them would throw away the only
 *      useful sentence in the response.
 *   2. A database message with a known meaning becomes that meaning in plain
 *      words, so the person still learns what happened.
 *   3. Any other database message becomes the caller's own fallback, which is
 *      written in product language and always actionable.
 *
 * Point 3 is the important one. The safe default is *not* to show the raw text,
 * because an unmapped message is by definition one nobody has read to check it.
 */

/**
 * Database refusals this app can actually produce, and what they mean.
 *
 * Order matters only where one pattern is a superset of another; none are. Each
 * pattern is tested against the whole message and the first match wins.
 */
const TRANSLATIONS: ReadonlyArray<{ pattern: RegExp; meaning: string }> = [
  // --- Authorisation ------------------------------------------------------
  {
    pattern: /permission denied for|row-level security|row level security|not authorized/i,
    meaning: 'You do not have access to that.',
  },

  // --- Uniqueness ---------------------------------------------------------
  {
    pattern: /duplicate key value|unique constraint|already exists/i,
    meaning: 'That already exists.',
  },
  {
    pattern: /unique constraint failed/i,
    meaning: 'That already exists.',
  },

  // --- Referenced rows ----------------------------------------------------
  // Postgres phrases these two differently and they mean different things.
  // `update or delete on table "courses" violates foreign key` means other rows
  // still point at this one, so it cannot go. `insert or update on table
  // "enrollments"` means the row being written names something that is not there.
  // Matching on the shared `violates foreign key constraint` alone would answer
  // both with the delete message, so the verb pair is what is tested - and the
  // `insert or update` case is tested first, because its verb pair contains the
  // other one. Without that order every failed insert answered "you cannot remove
  // this", which is the opposite of what happened.
  {
    pattern: /\binsert or update on table\b[^]*violates foreign key constraint/i,
    meaning: 'That refers to something that no longer exists.',
  },
  {
    pattern: /\b(?:update or delete|delete|update) on table\b[^]*violates foreign key constraint/i,
    meaning: 'That is still in use, so it cannot be removed.',
  },
  {
    pattern: /violates foreign key constraint/i,
    meaning: 'That refers to something that no longer exists.',
  },

  // --- Required values ----------------------------------------------------
  {
    pattern: /null value in column|violates not-null constraint|not-null constraint/i,
    meaning: 'Please complete every required field.',
  },

  // --- Check constraints, which carry the app's own rules -----------------
  {
    pattern: /violates check constraint|check constraint/i,
    meaning: 'That value is not allowed.',
  },

  // --- Types and ranges ---------------------------------------------------
  {
    pattern: /value too long|string_data_right_truncation|character varying/i,
    meaning: 'That is longer than this field allows.',
  },
  {
    pattern: /invalid input syntax for type/i,
    meaning: 'That value is not valid.',
  },
  {
    pattern: /numeric field overflow|value out of range|out of range/i,
    meaning: 'That number is outside the allowed range.',
  },
  {
    pattern: /division by zero/i,
    meaning: 'Those numbers cannot be used together.',
  },
  {
    pattern: /cannot cast|must be of type/i,
    meaning: 'That value is not valid.',
  },

  // --- Sessions -----------------------------------------------------------
  {
    pattern: /jwt expired|invalid jwt|token is expired|session (?:not found|missing)/i,
    meaning: 'Your session has ended. Sign in again.',
  },
  {
    pattern: /email not confirmed|user not found|invalid login credentials/i,
    meaning: 'That email address and password do not match an account.',
  },

  // --- Time and load ------------------------------------------------------
  {
    pattern: /statement timeout|deadlock|canceling statement/i,
    meaning: 'That took too long and was stopped. Try again.',
  },
  {
    pattern: /too many requests|rate limit/i,
    meaning: 'Too many attempts in a row. Wait a moment and try again.',
  },
  {
    pattern:
      /failed to fetch|networkerror|network request failed|load failed|econnreset|socket hang up|econnrefused/i,
    meaning: 'Cannot reach the server. Check your connection and try again.',
  },

  // --- Storage ------------------------------------------------------------
  {
    pattern: /bucket not found|object not found|storage object not found/i,
    meaning: 'That file could not be found.',
  },
  {
    pattern: /exceeded the maximum allowed size|file size|payload too large/i,
    meaning: 'That file is too large to upload.',
  },
] as const

/**
 * Text that means the message came out of the database rather than out of this
 * codebase.
 *
 * This is the backstop for a message no rule above recognised. It is deliberately
 * broad: a false positive costs one generic sentence, while a false negative
 * prints a constraint name at a user. It is also deliberately narrow enough that
 * this codebase's own sentences do not match - every message in the services
 * folder is checked against this in `errors.test.ts`.
 *
 * `trigger` and `plpgsql` are in the list for the reason the whole module exists:
 * "A database trigger refuses any attempt to change your own role." is precisely
 * the sentence that must never reach a person. It now returns the fallback.
 */
const DATABASE_TELLTALE =
  /violates|permission denied|duplicate key|null value in|invalid input syntax|relation "|column "|table "|pg_catalog|pg_|postgres|sqlstate|statement timeout|row-level|row level security|unique index|foreign key|not-null|schema "|public\.|auth\.|trigger|plpgsql|procedure|raised exception|^[a-z_]+ \(|^(?:ERROR|PGRST|23|42|22|25|28)\d{2}\b|undefined|NULL|stack|at \w+ \(/i

/**
 * Turn a failure into a sentence a person can act on.
 *
 * @param raw      What the failure said, verbatim.
 * @param fallback This codebase's own wording, used whenever `raw` is database
 *                 output that has no agreed plain-language meaning here.
 */
export function humanizeError(raw: unknown, fallback: string): string {
  const fallbackText = (fallback ?? '').trim()
  const text =
    typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw ?? '')
  const trimmed = text
    // `ERROR: ` and a bare SQLSTATE are prefixes, not content.
    .replace(/^(?:ERROR:\s*|[A-Z]{5}:\s*)/, '')
    .trim()

  if (!trimmed) return fallbackText

  for (const { pattern, meaning } of TRANSLATIONS) {
    if (pattern.test(trimmed)) return meaning
  }

  // A message from this codebase: it was written for a person, so let it stand.
  if (!DATABASE_TELLTALE.test(trimmed)) return trimmed

  // Database output with no agreed plain-language meaning. The fallback is
  // written for this exact situation, so it is the honest thing to say.
  return fallbackText
}

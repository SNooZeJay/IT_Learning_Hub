import { describe, expect, it } from 'vitest'
import { humanizeError } from './errors'

/**
 * The contract this module exists to keep.
 *
 * Two directions, and the second is the one that is easy to break: a database
 * refusal must never reach a view verbatim, and a sentence this codebase wrote
 * for a person must never be replaced by a generic one. Replacing "Cannot demote
 * the last administrator." with "Something went wrong." would satisfy the first
 * rule and destroy the product.
 */
describe('humanizeError', () => {
  const FALLBACK = 'The course could not be saved.'

  describe('database refusals become plain sentences', () => {
    const cases: ReadonlyArray<[name: string, raw: string, expected: string]> = [
      [
        'a permission denial on a table',
        'permission denied for table profiles',
        'You do not have access to that.',
      ],
      [
        'a permission denial on a function',
        'permission denied for function set_user_role',
        'You do not have access to that.',
      ],
      [
        'a row-level security refusal',
        'new row violates row-level security policy for table "profiles"',
        'You do not have access to that.',
      ],
      [
        'a duplicate unique constraint',
        'duplicate key value violates unique constraint "categories_slug_key"',
        'That already exists.',
      ],
      [
        'a delete blocked by a referencing row',
        'update or delete on table "course_categories" violates foreign key constraint "course_categories_id_fkey" on table "courses"',
        'That is still in use, so it cannot be removed.',
      ],
      [
        'an insert pointing at a missing row',
        'insert or update on table "enrollments" violates foreign key constraint "enrollments_course_id_fkey" on table "courses"',
        'That refers to something that no longer exists.',
      ],
      [
        'a missing required value',
        'null value in column "full_name" violates not-null constraint "profiles_full_name_not_null"',
        'Please complete every required field.',
      ],
      [
        'a check constraint',
        'new row for relation "courses" violates check constraint "courses_price_non_negative"',
        'That value is not allowed.',
      ],
      [
        'text over a column length',
        'value too long for type character varying(120)',
        'That is longer than this field allows.',
      ],
      [
        'an unparseable identifier',
        'invalid input syntax for type uuid: "not-a-uuid"',
        'That value is not valid.',
      ],
      [
        'a number out of range',
        'numeric field overflow',
        'That number is outside the allowed range.',
      ],
      [
        'a dead connection',
        'TypeError: Failed to fetch',
        'Cannot reach the server. Check your connection and try again.',
      ],
      ['an expired session', 'JWT expired', 'Your session has ended. Sign in again.'],
    ]

    it.each(cases)('translates %s', (_name, raw, expected) => {
      expect(humanizeError(raw, FALLBACK)).toBe(expected)
    })

    it('strips the ERROR prefix and the SQLSTATE before deciding', () => {
      expect(
        humanizeError(
          'ERROR:  23505: duplicate key value violates unique constraint "x"',
          FALLBACK,
        ),
      ).toBe('That already exists.')
      expect(humanizeError('PGRST301: permission denied for table profiles', FALLBACK)).toBe(
        'You do not have access to that.',
      )
    })

    /**
     * The backstop. An unmapped database message has never been read by anybody,
     * so showing it is how a constraint name ends up on a page.
     */
    it('falls back rather than showing database text it cannot explain', () => {
      expect(
        humanizeError(
          'relation "public.wat" does not exist and an extension is required to continue',
          FALLBACK,
        ),
      ).toBe(FALLBACK)
      expect(humanizeError('internal error in trigger procedure', FALLBACK)).toBe(FALLBACK)
      expect(humanizeError('plpgsql function f() raised exception', FALLBACK)).toBe(FALLBACK)
    })

    it('reports a cancelled statement as the timeout it is', () => {
      // Not a fallback case: this one has an agreed meaning, and saying "try again"
      // is more use to a person than "the course could not be saved".
      expect(humanizeError('canceling statement due to lock timeout', FALLBACK)).toBe(
        'That took too long and was stopped. Try again.',
      )
    })
  })

  describe("this codebase's own sentences survive untouched", () => {
    /**
     * Collected from the `throw new *Error(...)` sites in `src/services`. These
     * are already written for a person, and the rule that keeps the app honest
     * about *why* something was refused depends on them arriving intact.
     */
    const own = [
      'Cannot demote the last administrator.',
      'Give the notice a title.',
      'Write what people need to know.',
      'A title and a slug are the only required fields. Everything else can be filled in later.',
      'The server returned an unreadable answer key.',
      'A quiz needs at least two answerable questions before it can be published.',
      'That quiz has already been published, so its questions cannot be removed.',
      'This work has already been marked, so it cannot be replaced.',
      'That file is not one of the kinds this site accepts.',
      'Give the course a title.',
      'Give the module a title.',
      'Give the lesson a title.',
      'A lesson cannot be shorter than a minute.',
      'You already have a certificate for this course.',
      'You have already used every attempt at this quiz.',
      'This quiz has no published questions yet.',
      'You cannot enrol in a course you have already finished.',
    ]

    it.each(own)('passes through: %s', (message) => {
      expect(humanizeError(message, FALLBACK)).toBe(message)
    })

    it('does not mistake a sentence about data for database output', () => {
      // "limit" appears here as ordinary English. Rewriting a sentence the app wrote
      // itself, because a word in it also appears in a database message, would be
      // the module doing its job too well.
      expect(
        humanizeError('You have reached the size limit for a quiz description.', FALLBACK),
      ).toBe('You have reached the size limit for a quiz description.')
      expect(humanizeError('That email address is already registered.', FALLBACK)).toBe(
        'That email address is already registered.',
      )
    })
  })

  describe('empty and odd input', () => {
    it('uses the fallback when there is nothing to say', () => {
      expect(humanizeError('', FALLBACK)).toBe(FALLBACK)
      expect(humanizeError('   ', FALLBACK)).toBe(FALLBACK)
      expect(humanizeError(null, FALLBACK)).toBe(FALLBACK)
      expect(humanizeError(undefined, FALLBACK)).toBe(FALLBACK)
    })

    it('reads an Error object as readily as a string', () => {
      expect(humanizeError(new Error('permission denied for table profiles'), FALLBACK)).toBe(
        'You do not have access to that.',
      )
    })

    it('never returns an empty string', () => {
      expect(humanizeError('   ', FALLBACK)).not.toBe('')
    })
  })
})

import { describe, expect, it } from 'vitest'
import { describeSupabaseError, isSupabaseConfigured } from './client'

/**
 * The last route from a database refusal to a stranger's screen.
 *
 * `describeSupabaseError` is called by the landing page, the catalogue, the public
 * course page and the four auth screens — every surface a signed-out visitor can see.
 * It used to handle exactly two shapes (misconfigured, offline) and return
 * `error.message` for everything else, so a `42501` from PostgREST or a constraint name
 * from GoTrue arrived on the page verbatim. The catalogue shipped a whole page reading
 *
 *     Could not load the catalogue
 *     permission denied for function is_admin
 *
 * because of it. These are the cases that keep it from doing that again.
 *
 * Skipped entirely when the deployment has no configuration at all, because then the
 * function short-circuits and there is nothing to assert about its wording.
 */
describe.skipIf(!isSupabaseConfigured)('describeSupabaseError', () => {
  const FALLBACK = 'The catalogue could not be loaded.'

  it('never returns a permission refusal with a function name in it', () => {
    // The exact message the catalogue was showing. `humanizeError` recognises the
    // "permission denied for" shape and answers in plain words.
    expect(
      describeSupabaseError(new Error('permission denied for function is_admin'), FALLBACK),
    ).toBe('You do not have access to that.')
    expect(
      describeSupabaseError(new Error('PGRST301: permission denied for table profiles'), FALLBACK),
    ).toBe('You do not have access to that.')
  })

  it('never returns a constraint name', () => {
    expect(
      describeSupabaseError(
        new Error('duplicate key value violates unique constraint "categories_slug_key"'),
        FALLBACK,
      ),
    ).toBe('That already exists.')
  })

  it('never returns SQLSTATE-prefixed output', () => {
    const raw = 'ERROR:  42501: permission denied for function is_admin'
    const message = describeSupabaseError(raw, FALLBACK)
    expect(message).not.toMatch(/\d{5}/)
    expect(message).not.toMatch(/is_admin/)
  })

  it('falls back to the caller’s wording for output with no agreed meaning', () => {
    expect(describeSupabaseError(new Error('internal error in trigger procedure'), FALLBACK)).toBe(
      FALLBACK,
    )
    // A SQLSTATE whose fourth character is a letter - the class every exclusion and
    // foreign-key violation reports under. It used to pass straight through as itself.
    expect(describeSupabaseError(new Error('23P01 some exclusion constraint'), FALLBACK)).toBe(
      FALLBACK,
    )
    expect(describeSupabaseError(new Error('23505 duplicate key value'), FALLBACK)).toBe(
      'That already exists.',
    )
  })

  it('keeps the refusals worth reading', () => {
    // A sentence this codebase wrote for a person must survive. Replacing
    // "That email address and password do not match an account." with a generic
    // fallback would satisfy the rule above and destroy the product.
    expect(
      describeSupabaseError(
        new Error('That email address and password do not match an account.'),
        FALLBACK,
      ),
    ).toBe('That email address and password do not match an account.')
  })

  it('still names the two failures it is there to distinguish', () => {
    expect(describeSupabaseError(new TypeError('Failed to fetch'), FALLBACK)).toBe(
      'Cannot reach the server. Check your connection and try again.',
    )
    expect(
      describeSupabaseError(new Error('NetworkError when attempting to fetch'), FALLBACK),
    ).toBe('Cannot reach the server. Check your connection and try again.')
  })

  it('has a usable default, so a call site that forgets its own still says something', () => {
    const message = describeSupabaseError(new Error('23P01 some exclusion constraint'))
    expect(message.length).toBeGreaterThan(10)
    expect(message).toMatch(/try again|not allowed|complete every required field/i)
  })
})

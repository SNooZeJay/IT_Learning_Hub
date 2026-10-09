import { describe, it, expect } from 'vitest'
import { parseNumericField, MAX_COURSE_PRICE_PESOS } from './numericField'

/**
 * A number typed into a field, or a sentence saying why it cannot be one.
 *
 * `type="number"` is not validation. It is a hint, and it behaves differently in
 * different browsers: Chrome refuses a letter, Firefox accepts it and marks the field
 * invalid. Neither clamps. Two faults came out of trusting it, both found by hand:
 *
 *   - the course price field bound with `v-model` on a number input, so Vue cast what
 *     was typed to a **number**; the view then called `.trim()` on it and the
 *     component threw during render, leaving a blank page. On the edit route the
 *     field loaded correctly as a string and died on the first keystroke, taking
 *     every unsaved edit with it.
 *
 *   - the grading field accepted `sadasdasdasda` silently and only objected when
 *     Save was pressed.
 *
 * These pin the behaviour rather than the markup: a field is not fixed by changing
 * its type attribute, it is fixed by what happens to what was typed.
 */
describe('parseNumericField', () => {
  it('accepts a plain number', () => {
    const result = parseNumericField('50', { min: 0, max: 100, label: 'Grade' })

    expect(result).toEqual({ ok: true, value: 50, empty: false })
  })

  it('treats a blank field as not set, which is a real state', () => {
    expect(parseNumericField('', { label: 'Price' })).toEqual({
      ok: true,
      value: null,
      empty: true,
    })
  })

  it('can require a value when there is no sensible empty state', () => {
    const result = parseNumericField('', { label: 'Grade', allowEmpty: false })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe('Grade is required.')
  })

  it('refuses letters rather than reading them as a number', () => {
    // parseFloat('12abc') is 12. That must never happen to a grade.
    const result = parseNumericField('12abc', { label: 'Grade', min: 0, max: 50 })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe('Grade must be a number.')
  })

  it('refuses a grade above the maximum instead of clamping it', () => {
    const result = parseNumericField('999', { label: 'Grade', min: 0, max: 50 })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe('Grade cannot be above 50.')
  })

  it('refuses a negative grade', () => {
    const result = parseNumericField('-5', { label: 'Grade', min: 0, max: 50 })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe('Grade cannot be below 0.')
  })

  it('refuses more decimals than the field allows rather than rounding', () => {
    // This one used to become a two-peso course.
    const result = parseNumericField('1.999', { label: 'Price', min: 0, decimals: 2 })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe('Price allows at most 2 decimal places.')
  })

  it('accepts the two decimals a price legitimately has', () => {
    expect(parseNumericField('1499.50', { min: 0, decimals: 2 })).toEqual({
      ok: true,
      value: 1499.5,
      empty: false,
    })
  })

  it('caps a price rather than storing a twelve digit typo', () => {
    const result = parseNumericField('99999999', {
      label: 'Price',
      min: 0,
      max: MAX_COURSE_PRICE_PESOS,
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe('Price cannot be above 1000000.')
  })

  it('never returns a number alongside an error', () => {
    for (const bad of ['abc', '-1', '999999', '1.999', '']) {
      const result = parseNumericField(bad, { min: 0, max: 50, allowEmpty: false })
      if (!result.ok) expect(result.value).toBeNull()
    }
  })
})

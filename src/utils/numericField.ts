/**
 * Numbers typed into a text field.
 *
 * `type="number"` is not validation. It is a hint to the browser: some browsers
 * refuse a letter outright and others - Firefox among them - accept it and simply
 * mark the field invalid. Neither clamps a value, and neither complains until the
 * form is submitted. Two real faults came out of trusting it:
 *
 *   - `pesoInput` in the course editor is bound with `v-model` on a `type="number"`
 *     input, so Vue casts whatever is typed to a **number** (`castToNumber` is true
 *     whenever the input's type is number). The code then called `.trim()` on it,
 *     which numbers do not have, and the component threw on render - a blank page
 *     with the sidebar still drawn, because the chrome lives outside the component
 *     that crashed.
 *
 *   - The grading field accepted letters silently and only objected on Save.
 *
 * So a numeric field in this codebase is bound explicitly with `:value` and an
 * `@input` handler that keeps the raw **string**, and the helpers here turn that
 * string into a number or an explanation of why it cannot be one.
 *
 * Nothing here silently coerces. A grade typed as `999` against a maximum of 50 is
 * refused with a message, not clamped to 50 - a mark that quietly becomes a different
 * mark is worse than one that was not accepted.
 */

export interface NumericFieldOptions {
  /** Smallest accepted value. */
  min?: number
  /** Largest accepted value. */
  max?: number
  /** How many decimal places are allowed. */
  decimals?: number
  /** Used to name the field in the message, e.g. "Grade". */
  label?: string
  /** Allow a blank field. The default, because "not set yet" is a real state. */
  allowEmpty?: boolean
}

export type NumericResult =
  | { ok: true; value: number | null; empty: boolean }
  | { ok: false; value: null; empty: false; message: string }

/**
 * Read whatever is in an `<input>` as a string.
 *
 * `event.target.value` on a number input is always a string, which is the whole
 * point: the value never silently becomes a number on the way in. Unparseable text
 * arrives here as `''` because the browser refuses to hold it, so a letter typed
 * into a number field is simply not there - which is why the caller needs no special
 * case for it.
 */
export function readNumericInput(event: Event): string {
  return (event.target as HTMLInputElement | null)?.value ?? ''
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/**
 * Turn typed text into a number, or into the reason it cannot be one.
 *
 * Deliberately rejects rather than rounds. `1.999` pesos is not a price anyone
 * meant; it used to be silently rounded to a two-peso course.
 */
export function parseNumericField(raw: string, options: NumericFieldOptions = {}): NumericResult {
  const { min, max, decimals = 2, label = 'This value', allowEmpty = true } = options
  const text = raw.trim()

  if (text === '') {
    return allowEmpty
      ? { ok: true, value: null, empty: true }
      : { ok: false, value: null, empty: false, message: `${label} is required.` }
  }

  // Number() rather than parseFloat: parseFloat('12abc') is 12, which would accept
  // text the instructor never intended as a number.
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) {
    return { ok: false, value: null, empty: false, message: `${label} must be a number.` }
  }

  const places = text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0
  if (places > decimals) {
    return {
      ok: false,
      value: null,
      empty: false,
      message: `${label} allows at most ${decimals} decimal place${decimals === 1 ? '' : 's'}.`,
    }
  }

  if (min !== undefined && parsed < min) {
    return {
      ok: false,
      value: null,
      empty: false,
      message: `${label} cannot be below ${formatNumber(min)}.`,
    }
  }

  if (max !== undefined && parsed > max) {
    return {
      ok: false,
      value: null,
      empty: false,
      message: `${label} cannot be above ${formatNumber(max)}.`,
    }
  }

  return { ok: true, value: parsed, empty: false }
}

/**
 * A maximum that keeps a price plausible.
 *
 * Not a business rule the application needs - a course costing more than this is
 * almost certainly a typo, and a typo that is caught beats one that is charged.
 */
export const MAX_COURSE_PRICE_PESOS = 1_000_000

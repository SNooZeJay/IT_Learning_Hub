import { describe, expect, it } from 'vitest'
import { MAX_RAW_PAYLOAD_CHARS, RAW_PAYLOAD_KEY, parseOrWrap } from './safe-payload'

/**
 * A recovery path that throws is not a recovery path.
 *
 * `paymongo-webhook` calls `recordAsUnusable` from inside the `catch` of a `JSON.parse`, and
 * that function parsed the same body again. So for a malformed body the handler threw inside
 * its own recovery, escaped the request handler, and never returned the 200 it promises -
 * and the ledger row that exists to make a forged or broken webhook visible was the row
 * that could not be written.
 *
 * Everything here is about a property rather than a shape: `parseOrWrap` must never throw,
 * for any input at all, and must always preserve what was actually received.
 */
describe('parseOrWrap', () => {
  it('returns a JSON object unchanged', () => {
    expect(parseOrWrap('{"data":{"attributes":{"type":"payment"}}}')).toEqual({
      data: { attributes: { type: 'payment' } },
    })
  })

  it('returns an empty object unchanged', () => {
    expect(parseOrWrap('{}')).toEqual({})
  })

  it('never throws on a body that is not JSON - the case that motivated it', () => {
    expect(() => parseOrWrap('not json at all')).not.toThrow()
    expect(parseOrWrap('not json at all')[RAW_PAYLOAD_KEY]).toBe('not json at all')
  })

  it('records why it could not parse, so the row is diagnosable', () => {
    expect(parseOrWrap('<html>502 Bad Gateway</html>').reason).toBe('body was not JSON')
  })

  it('keeps a truncated POST body whole rather than discarding it', () => {
    // A very common malformed webhook: the provider or a proxy cut the body.
    const clipped = '{"data":{"attributes":{"type":"payme'
    const result = parseOrWrap(clipped)
    expect(result[RAW_PAYLOAD_KEY]).toBe(clipped)
  })

  it('wraps valid JSON that is not an object', () => {
    // `record_payment_event` takes a jsonb payload. A scalar is not usable there, and
    // passing it one is how a second surprise gets in.
    expect(parseOrWrap('"just a string"').reason).toBe('body was JSON but not an object')
    expect(parseOrWrap('42').reason).toBe('body was JSON but not an object')
    expect(parseOrWrap('null').reason).toBe('body was JSON but not an object')
  })

  it('wraps an array, which is valid JSON but not a payload shape', () => {
    const result = parseOrWrap('[{"a":1}]')
    expect(result[RAW_PAYLOAD_KEY]).toBe('[{"a":1}]')
  })

  it('survives an empty body', () => {
    expect(() => parseOrWrap('')).not.toThrow()
    expect(parseOrWrap('')[RAW_PAYLOAD_KEY]).toBe('')
  })

  it('marks a truncated body rather than letting it read as complete', () => {
    // An unbounded body from an anonymous caller is a cheap way to fill the ledger, so
    // there is a cap. Silently clipping would be worse than not capping at all: an
    // operator would read a clipped body as the whole one.
    const huge = `{"x":"${'a'.repeat(MAX_RAW_PAYLOAD_CHARS + 500)}"}`
    const stored = String(parseOrWrap(huge)[RAW_PAYLOAD_KEY])

    expect(stored.length).toBeLessThan(huge.length)
    expect(stored).toContain('truncated')
  })

  it('never returns anything that is not a plain object', () => {
    for (const body of ['{}', '[]', '"x"', '1', 'null', 'garbage', '']) {
      expect(typeof parseOrWrap(body)).toBe('object')
      expect(Array.isArray(parseOrWrap(body))).toBe(false)
    }
  })
})

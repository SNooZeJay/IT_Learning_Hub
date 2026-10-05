import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The paid enrol path.
 *
 * The bug these tests exist for: `handleEnrol` called `enrollInFreeCourse` for
 * every course, so a paid course threw "This course is paid. Payment is required
 * before enrolling." from behind a button labelled "Enrol for ₱1,500.00". The
 * price rendered, the copy mentioned PayMongo, and nothing in the frontend called
 * `create-checkout` at all.
 *
 * A screenshot of that exact page is what surfaced it. No gate would have: the
 * function existed, the type was right, and the code compiled.
 */

const invoke = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
  readFunctionError: (e: unknown) => {
    // Mirrors the real helper, which hands back the function's JSON body. The
    // earlier version of this mock returned only `.error`, so a test asserting on
    // providerStatus and providerCode could never match - a mock that understates
    // what the code receives makes the test pass for the wrong reason.
    if (typeof e === 'object' && e !== null) {
      const c = (e as { context?: unknown }).context
      if (typeof c === 'object' && c !== null) {
        return JSON.stringify(c)
      }
    }
    return null
  },
}))

import { CheckoutError, courseNeedsPayment, startCheckout } from '@/services/checkout.service'

const ok = (body: unknown) => ({ data: body, error: null })
const fail = (status: number, body: unknown) => ({ data: null, error: { status, context: body } })

beforeEach(() => {
  invoke.mockReset()
})

describe('startCheckout', () => {
  it('sends the course id and both return URLs', async () => {
    invoke.mockResolvedValue(
      ok({
        requiresPayment: true,
        amountCentavos: 150000,
        checkoutUrl: 'https://paymongo.test/cs/1',
      }),
    )

    await startCheckout('course-1')

    const body = invoke.mock.calls[0][1].body
    expect(body.courseId).toBe('course-1')
    // Both URLs are built from the current origin, never accepted from a caller,
    // so this cannot bounce a learner to a third-party page after paying.
    //
    // The origin is absent under vitest, which has no window.location, so the URL
    // comes out relative. What matters is the path, the marker, and that no
    // third-party host can appear - the provider is where the learner goes next,
    // never where they are returned to.
    expect(body.successUrl).toMatch(/\/student\/courses\/course-1\?payment=success$/)
    expect(body.cancelUrl).toMatch(/\/student\/courses\/course-1\?payment=cancelled$/)
    expect(body.successUrl).not.toMatch(/paymongo/i)
    expect(body.cancelUrl).not.toMatch(/paymongo/i)
  })

  it('returns the checkout URL for a paid course', async () => {
    invoke.mockResolvedValue(
      ok({
        requiresPayment: true,
        amountCentavos: 150000,
        checkoutUrl: 'https://paymongo.test/cs/1',
      }),
    )

    const result = await startCheckout('course-1')
    expect(result.requiresPayment).toBe(true)
    expect(result.checkoutUrl).toBe('https://paymongo.test/cs/1')
    expect(result.amountCentavos).toBe(150000)
  })

  it('surfaces a reused pending payment rather than charging twice', async () => {
    invoke.mockResolvedValue(
      ok({
        requiresPayment: true,
        amountCentavos: 150000,
        checkoutUrl: 'https://paymongo.test/cs/1',
        reused: true,
      }),
    )

    const result = await startCheckout('course-1')
    expect(result.reused).toBe(true)
    expect(result.checkoutUrl).toBeTruthy()
  })

  it('reports a free course without a checkout', async () => {
    invoke.mockResolvedValue(ok({ requiresPayment: false, amountCentavos: 0 }))
    const result = await startCheckout('course-free')
    expect(result.requiresPayment).toBe(false)
    expect(result.checkoutUrl).toBeUndefined()
  })

  it('treats a paid course with no URL as a failure, not a soft no', async () => {
    // The function only omits checkoutUrl when the provider refused. Treating
    // that as success leaves the learner on a button that does nothing.
    invoke.mockResolvedValue(ok({ requiresPayment: true, amountCentavos: 150000 }))
    await expect(startCheckout('course-1')).rejects.toThrow(/did not return a checkout link/)
  })

  it('returns a reused payment that has no URL, so the page can explain it', async () => {
    // The bug behind "the payment provider did not return a checkout link" on a
    // course whose payment was sitting there pending. Throwing here made the
    // view's own reused-branch unreachable, so the learner was told the provider
    // had failed when their earlier payment was still open.
    invoke.mockResolvedValue(
      ok({ requiresPayment: true, amountCentavos: 150000, reused: true, checkoutUrl: null }),
    )
    const result = await startCheckout('course-1')
    expect(result.reused).toBe(true)
    expect(result.checkoutUrl).toBeUndefined()
  })

  it('returns the stored checkout URL when a pending payment is reused', async () => {
    // The fix: the function stores PayMongo's URL, so an abandoned payment can be
    // resumed rather than dead-ended.
    invoke.mockResolvedValue(
      ok({
        requiresPayment: true,
        amountCentavos: 150000,
        reused: true,
        checkoutUrl: 'https://checkout.paymongo.com/abc123',
      }),
    )
    const result = await startCheckout('course-1')
    expect(result.reused).toBe(true)
    expect(result.checkoutUrl).toBe('https://checkout.paymongo.com/abc123')
  })

  it('names the cause for an expired session', async () => {
    invoke.mockResolvedValue(fail(401, { error: 'not authenticated' }))
    await expect(startCheckout('course-1')).rejects.toMatchObject({
      reason: 'not_authenticated',
    })
    // Says nothing was charged, because nothing was.
    await expect(startCheckout('course-1')).rejects.toThrow(/nothing has been charged/i)
  })

  it('names the cause for a course that is gone', async () => {
    invoke.mockResolvedValue(fail(404, { error: 'no such published course' }))
    await expect(startCheckout('course-1')).rejects.toMatchObject({ reason: 'no_such_course' })
  })

  it('says payments are unconfigured rather than showing a raw status', async () => {
    // The failure a demo is most likely to hit, and the one that must not read
    // as "Edge Function returned a non-2xx status code".
    invoke.mockResolvedValue(fail(503, { error: 'payments are not configured' }))
    await expect(startCheckout('course-1')).rejects.toThrow(/payments are not configured/i)
  })

  it('keeps the function`s own message when it supplies one', async () => {
    invoke.mockResolvedValue(fail(502, { error: 'checkout could not be created' }))
    await expect(startCheckout('course-1')).rejects.toThrow(/checkout could not be created/i)
  })

  it('falls back to its own wording when the body says nothing useful', async () => {
    // An empty body. readFunctionError returns '{}' rather than null, so the
    // fallback wording must still win over a detail that names nothing.
    invoke.mockResolvedValue(fail(500, {}))
    await expect(startCheckout('course-1')).rejects.toThrow(/nothing has been charged/i)
  })

  it('falls back when the function could not be reached at all', async () => {
    // A transport failure: no status, no body. This is what the CORS bug looked
    // like from the browser, and the message must not blame the network.
    invoke.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await expect(startCheckout('course-1')).rejects.toThrow(/could not be opened/i)
  })

  it('names the credential when the provider rejects the key', async () => {
    // The failure that actually happened: a 502 whose body says PayMongo refused
    // the merchant key. A generic "could not open checkout" would leave an
    // administrator hunting for a network fault.
    invoke.mockResolvedValue(
      fail(502, {
        error: 'checkout could not be created',
        providerStatus: 401,
        providerCode: 'authentication_failed',
      }),
    )
    await expect(startCheckout('course-1')).rejects.toThrow(/PAYMONGO_SECRET_KEY/)
    // Says the API key, not the webhook secret - they are different credentials
    // and confusing them is the whole problem.
    await expect(startCheckout('course-1')).rejects.toThrow(/not the webhook secret/i)
    await expect(startCheckout('course-1')).rejects.toThrow(/nothing has been charged/i)
  })

  it('is a CheckoutError, so a caller can branch on the reason', async () => {
    invoke.mockResolvedValue(fail(404, { error: 'gone' }))
    await expect(startCheckout('course-1')).rejects.toBeInstanceOf(CheckoutError)
  })
})

describe('courseNeedsPayment', () => {
  it('treats zero as free and anything above as paid', () => {
    // Mirrors the function's own rule, so the button label and its behaviour
    // cannot disagree.
    expect(courseNeedsPayment({ priceCentavos: 0 })).toBe(false)
    expect(courseNeedsPayment({ priceCentavos: 150000 })).toBe(true)
  })

  it('never treats a negative price as free', () => {
    // A negative price is nonsense data, and treating it as free would hand out
    // a paid course.
    expect(courseNeedsPayment({ priceCentavos: -1 })).toBe(false)
  })
})

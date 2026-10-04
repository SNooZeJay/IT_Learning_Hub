import { describe, expect, it } from 'vitest'
import { parsePayMongoEvent, resolveEventId, sha256Hex } from './paymongo-envelope.ts'

/**
 * Tests for the PayMongo envelope reader.
 *
 * These exist because a bug here is invisible until real money moves. A parser
 * that reads the wrong field does not throw, does not log an error, and does not
 * look broken — it simply never settles a payment, or settles the wrong one.
 *
 * The fixtures below are shaped from PayMongo's documented payloads for both
 * products, because reading only one shape is the single most damaging mistake
 * available in this file.
 */

/** Events API shape: everything nested under data.attributes. */
function eventsApiPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'evt_ABC123',
      attributes: {
        type: 'checkout_session.payment.paid',
        livemode: false,
        data: {
          id: 'cs_TEST123',
          attributes: {
            reference_number: 'ITH-2026-0001',
            payments: [{ id: 'pay_TEST123', attributes: { amount: 150000, currency: 'PHP' } }],
          },
        },
      },
    },
    ...overrides,
  }
}

/** Hosted Checkout shape: the same fields, directly under data. */
function hostedCheckoutPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'evt_XYZ789',
      type: 'checkout_session.payment.paid',
      livemode: true,
      data: {
        id: 'cs_TEST999',
        attributes: {
          reference_number: 'ITH-2026-0002',
          payments: [{ id: 'pay_TEST999', attributes: { amount: 250000, currency: 'PHP' } }],
        },
      },
    },
    ...overrides,
  }
}

describe('envelope shapes', () => {
  it('reads the Events API shape', async () => {
    const raw = JSON.stringify(eventsApiPayload())
    const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)

    expect(parsed).not.toBeNull()
    expect(parsed?.eventType).toBe('checkout_session.payment.paid')
    expect(parsed?.referenceNumber).toBe('ITH-2026-0001')
    expect(parsed?.resourceId).toBe('cs_TEST123')
    // The `pay_` id must come from the payments list, not from the session id.
    expect(parsed?.providerPaymentId).toBe('pay_TEST123')
    expect(parsed?.amountMinor).toBe(150000)
    expect(parsed?.currency).toBe('PHP')
    expect(parsed?.livemode).toBe(false)
  })

  it('reads the Hosted Checkout shape', async () => {
    const raw = JSON.stringify(hostedCheckoutPayload())
    const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)

    expect(parsed).not.toBeNull()
    expect(parsed?.eventType).toBe('checkout_session.payment.paid')
    expect(parsed?.referenceNumber).toBe('ITH-2026-0002')
    expect(parsed?.providerPaymentId).toBe('pay_TEST999')
    expect(parsed?.amountMinor).toBe(250000)
    expect(parsed?.livemode).toBe(true)
  })

  it('returns null for a payload that is not a PayMongo event', async () => {
    const raw = JSON.stringify({ hello: 'world' })
    expect(await parsePayMongoEvent(JSON.parse(raw), raw)).toBeNull()
  })

  it('ignores an empty string where a field does not apply', async () => {
    const payload = hostedCheckoutPayload()
    // Simulate a product that sends blank strings rather than omitting fields.
    const raw = JSON.stringify(payload).replace('ITH-2026-0002', '')
    const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)
    expect(parsed?.referenceNumber).toBeNull()
  })
})

describe('correlation key', () => {
  it('reads external_reference_number on a payment level event', async () => {
    // A payment level event carries our value under a different name. Reading
    // only reference_number makes every declined payment look unmatched.
    const payload = {
      data: {
        id: 'evt_FAIL01',
        type: 'payment.failed',
        data: {
          id: 'pay_FAIL01',
          attributes: {
            external_reference_number: 'ITH-2026-0003',
            amount: 150000,
            currency: 'PHP',
            last_error: { code: 'card_declined', message: 'Your card was declined.' },
          },
        },
      },
    }
    const raw = JSON.stringify(payload)
    const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)

    expect(parsed?.referenceNumber).toBe('ITH-2026-0003')
    expect(parsed?.failureCode).toBe('card_declined')
    expect(parsed?.failureMessage).toBe('Your card was declined.')
    expect(parsed?.providerPaymentId).toBe('pay_FAIL01')
  })

  it('prefers reference_number when both positions are present', async () => {
    const payload = {
      data: {
        id: 'evt_BOTH',
        type: 'payment.paid',
        data: {
          id: 'pay_BOTH',
          attributes: {
            reference_number: 'FIRST',
            external_reference_number: 'SECOND',
            amount: 100,
            currency: 'PHP',
          },
        },
      },
    }
    const raw = JSON.stringify(payload)
    const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)
    expect(parsed?.referenceNumber).toBe('FIRST')
  })
})

describe('payloads taken from PayMongo published docs', () => {
  /**
   * Fixtures lifted from PayMongo's own event reference rather than invented here.
   *
   * This project offers GCash and PayMaya, and both appear in those docs with the
   * correlation key in `external_reference_number` AND mirrored in
   * `metadata.pm_reference_number`. The mirrored copy is why the metadata path
   * exists: PayMongo's documented card payload shows `external_reference_number`
   * as null with the value only in metadata, so a parser reading just the obvious
   * field returns null, the webhook matches no payment, and a successful purchase
   * silently never activates the enrolment.
   */

  const documented = {
    gcash: {
      data: {
        id: 'evt_XNQTT6J64gkTwBhrJiZmf9BZ',
        type: 'event',
        attributes: {
          type: 'payment.paid',
          livemode: true,
          data: {
            id: 'pay_vNQdh3edhpd8MJdPmHjYqPMB',
            type: 'payment',
            attributes: {
              amount: 150000,
              currency: 'PHP',
              status: 'paid',
              external_reference_number: 'ITH-gcash-0001',
              metadata: { pm_reference_number: 'ITH-gcash-0001' },
            },
          },
        },
      },
    },
    maya: {
      data: {
        id: 'evt_bUkG123qE',
        type: 'event',
        attributes: {
          type: 'payment.paid',
          livemode: true,
          data: {
            id: 'pay_Z5e5iabccB3KbmC9wTbUaSBo',
            type: 'payment',
            attributes: {
              amount: 250000,
              currency: 'PHP',
              status: 'paid',
              external_reference_number: 'ITH-maya-0002',
              metadata: { pm_reference_number: 'ITH-maya-0002' },
            },
          },
        },
      },
    },
    checkout: {
      data: {
        id: 'evt_CHECKOUT01',
        type: 'event',
        attributes: {
          type: 'checkout_session.payment.paid',
          livemode: true,
          data: {
            id: 'cs_TEST01',
            type: 'checkout_session',
            attributes: {
              reference_number: 'ITH-checkout-0003',
              payments: [{ id: 'pay_TEST01', attributes: { amount: 150000, currency: 'PHP' } }],
            },
          },
        },
      },
    },
  }

  it.each([
    ['GCash', documented.gcash, 'ITH-gcash-0001', 150000],
    ['PayMaya', documented.maya, 'ITH-maya-0002', 250000],
    ['checkout session', documented.checkout, 'ITH-checkout-0003', 150000],
  ])(
    'reads the reference and amount from a %s payment',
    async (_name, payload, reference, amount) => {
      const raw = JSON.stringify(payload)
      const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)
      expect(parsed?.referenceNumber).toBe(reference)
      expect(parsed?.amountMinor).toBe(amount)
      expect(parsed?.currency).toBe('PHP')
    },
  )

  it('falls back to metadata when external_reference_number is null', async () => {
    // PayMongo's documented card payload. Not a method this project offers, but
    // the shape is real and the parser must not silently return null for it.
    const payload = {
      data: {
        id: 'evt_9w6KTxQY3hmuDQaALHoAZnRp',
        type: 'event',
        attributes: {
          type: 'payment.paid',
          livemode: false,
          data: {
            id: 'pay_JMg1rgaUtg5U79rRSjiDUvLr',
            type: 'payment',
            attributes: {
              amount: 150000,
              currency: 'PHP',
              status: 'paid',
              external_reference_number: null,
              metadata: { pm_reference_number: 'ITH-card-0004' },
            },
          },
        },
      },
    }
    const raw = JSON.stringify(payload)
    expect((await parsePayMongoEvent(JSON.parse(raw), raw))?.referenceNumber).toBe('ITH-card-0004')
  })

  it('finds the reference in metadata when external_reference_number is null', async () => {
    // Shape of PayMongo's documented payment.paid for a card.
    const payload = {
      data: {
        id: 'evt_9w6KTxQY3hmuDQaALHoAZnRp',
        type: 'event',
        attributes: {
          type: 'payment.paid',
          livemode: false,
          data: {
            id: 'pay_JMg1rgaUtg5U79rRSjiDUvLr',
            type: 'payment',
            attributes: {
              amount: 150000,
              currency: 'PHP',
              status: 'paid',
              external_reference_number: null,
              metadata: { pm_reference_number: 'ITH-abc-1234' },
            },
          },
        },
      },
    }
    const raw = JSON.stringify(payload)
    const parsed = await parsePayMongoEvent(JSON.parse(raw), raw)

    expect(parsed?.referenceNumber).toBe('ITH-abc-1234')
    expect(parsed?.providerPaymentId).toBe('pay_JMg1rgaUtg5U79rRSjiDUvLr')
    expect(parsed?.amountMinor).toBe(150000)
  })

  it('never mistakes a refund id for an event id', async () => {
    // Refunds arrive repeatedly against one payment. Storing ref_ as the event id
    // would make the second refund suppress itself as a duplicate.
    const payload = {
      data: {
        id: 'ref_ABC123',
        type: 'event',
        attributes: {
          type: 'refund.succeeded',
          livemode: true,
          data: {
            id: 'ref_ABC123',
            type: 'refund',
            attributes: { amount: 150000, currency: 'PHP', status: 'succeeded' },
          },
        },
      },
    }
    const raw = JSON.stringify(payload)
    await expect(resolveEventId(JSON.parse(raw), raw)).resolves.toMatch(/^sha256:/)
  })

  it('never mistakes a QR resource id for an event id', async () => {
    // QR Ph is not offered by this project, but the guard is free and this pins
    // it: if QR support is ever added, a qr_ id must not become an event id.
    const payload = {
      data: {
        id: 'qr_ABC123',
        type: 'event',
        attributes: { type: 'qr.paid', livemode: true, data: { id: 'qr_ABC123' } },
      },
    }
    const raw = JSON.stringify(payload)
    await expect(resolveEventId(JSON.parse(raw), raw)).resolves.toMatch(/^sha256:/)
  })
})

describe('idempotency key', () => {
  it('uses the provider event id when it looks like an event id', async () => {
    await expect(resolveEventId(eventsApiPayload(), '{}')).resolves.toBe('evt_ABC123')
  })

  it('never stores a resource id as the event id', async () => {
    // Storing cs_/pay_ as the event id makes a redelivered event collide with a
    // different one, and the real event is then discarded as a duplicate.
    const payload = { data: { id: 'cs_MISLABELLED', attributes: { type: 'payment.paid' } } }
    const raw = JSON.stringify(payload)
    const resolved = await resolveEventId(payload, raw)

    expect(resolved.startsWith('sha256:')).toBe(true)
  })

  it('falls back to a hash of the raw body, stable across replays', async () => {
    const raw = '{"some":"body","with":"spacing"}'
    const first = await resolveEventId({}, raw)
    const replay = await resolveEventId({}, raw)
    const different = await resolveEventId({}, '{"some":"other"}')

    expect(first).toBe(replay)
    expect(first).not.toBe(different)
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('hashes bytes, not a re-serialised object', async () => {
    // The reason rawBody is passed in at all. These parse to the same object but
    // are different bytes, so they must produce different keys.
    const a = '{"a":1,"b":2}'
    const b = '{"b":2,"a":1}'
    expect(JSON.parse(a)).toEqual(JSON.parse(b))
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(b))
  })
})

describe('amount handling', () => {
  it('accepts a numeric string, which a proxy can introduce', async () => {
    const payload = {
      data: {
        id: 'evt_STR',
        type: 'payment.paid',
        data: { id: 'pay_STR', attributes: { amount: '150000', currency: 'PHP' } },
      },
    }
    const raw = JSON.stringify(payload)
    expect((await parsePayMongoEvent(JSON.parse(raw), raw))?.amountMinor).toBe(150000)
  })

  it('treats a non-integer amount as absent rather than rounding it', async () => {
    // An amount has to be exact to compare. 150000.5 must not become 150000 and
    // silently pass a settlement check.
    const payload = {
      data: {
        id: 'evt_FLOAT',
        type: 'payment.paid',
        data: { id: 'pay_FLOAT', attributes: { amount: 150000.5, currency: 'PHP' } },
      },
    }
    const raw = JSON.stringify(payload)
    expect((await parsePayMongoEvent(JSON.parse(raw), raw))?.amountMinor).toBeNull()
  })

  it('treats a non-numeric amount as absent', async () => {
    const payload = {
      data: {
        id: 'evt_WORD',
        type: 'payment.paid',
        data: { id: 'pay_WORD', attributes: { amount: 'many', currency: 'PHP' } },
      },
    }
    const raw = JSON.stringify(payload)
    expect((await parsePayMongoEvent(JSON.parse(raw), raw))?.amountMinor).toBeNull()
  })
})

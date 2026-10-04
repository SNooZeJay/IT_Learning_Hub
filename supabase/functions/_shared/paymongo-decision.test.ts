import { describe, expect, it } from 'vitest'
import { decidePaymentAction, isMoneyEvent } from './paymongo-decision.ts'
import type { PayMongoEnvelope } from './paymongo-envelope.ts'

/**
 * The decision layer decides whether real money state changes. Matching on the
 * shape of the event type rather than an exact allow list means a new PayMongo
 * event is recorded and visibly ignored, instead of silently doing nothing and
 * looking identical to a payment that worked.
 */

function envelope(overrides: Partial<PayMongoEnvelope> = {}): PayMongoEnvelope {
  return {
    eventId: 'evt_1',
    eventType: 'payment.paid',
    resourceId: 'pay_1',
    referenceNumber: 'ITH-1',
    providerPaymentId: 'pay_1',
    amountMinor: 150000,
    currency: 'PHP',
    livemode: false,
    failureCode: null,
    failureMessage: null,
    ...overrides,
  }
}

describe('settling', () => {
  it.each([
    'payment.paid',
    'checkout_session.payment.paid',
    'PAYMENT.PAID',
    'some.prefix.checkout_session.payment.paid',
  ])('settles on %s', (eventType) => {
    expect(decidePaymentAction(envelope({ eventType })).action).toBe('settle')
  })
})

describe('failure', () => {
  it.each(['payment.failed', 'checkout_session.payment.failed'])(
    'records a failure on %s',
    (eventType) => {
      expect(decidePaymentAction(envelope({ eventType })).action).toBe('record_failure')
    },
  )
})

describe('cancellation', () => {
  it.each([
    'checkout_session.expired',
    'payment.cancelled',
    'checkout_session.cancelled',
    'payment.canceled',
  ])('cancels on %s', (eventType) => {
    // Not shared with 'failed'. An abandoned checkout is not an error, but
    // leaving it pending forever fills the admin ledger with ghosts.
    expect(decidePaymentAction(envelope({ eventType })).action).toBe('cancel')
  })
})

describe('unknown events', () => {
  it.each(['payment.refunded', 'payout.paid', 'balance.updated', 'something.new'])(
    'ignores %s without erroring',
    (eventType) => {
      const decision = decidePaymentAction(envelope({ eventType }))
      expect(decision.action).toBe('ignore')
      expect(isMoneyEvent(envelope({ eventType }))).toBe(false)
    },
  )

  it('ignores an event with no type at all', () => {
    expect(decidePaymentAction(envelope({ eventType: null })).action).toBe('ignore')
  })

  it('refunds are visible rather than silently settling', () => {
    // A refund must never be read as a payment. Treating it as one would give a
    // learner their course back for free, or re-activate a dropped enrolment.
    expect(decidePaymentAction(envelope({ eventType: 'payment.refunded' })).action).not.toBe(
      'settle',
    )
  })
})

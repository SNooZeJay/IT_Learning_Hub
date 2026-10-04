/**
 * Turns a parsed PayMongo event into a decision.
 *
 * Kept separate from the Edge Function so the rules can be read and tested
 * without a database. The function layer below this is plumbing; this file is
 * where the behaviour actually lives.
 */

import type { PayMongoEnvelope } from './paymongo-envelope.ts'

export type PaymentDecision =
  | 'ignore'
  | 'record_failure'
  | 'settle'
  | 'cancel'

export interface Decision {
  action: PaymentDecision
  /** Short machine-readable outcome, stored on the event row. */
  outcome: string
  reason: string
}

/**
 * Event types are matched on their full dotted path, not on a suffix.
 *
 * This is not fussiness. PayMongo sends `payout.paid` when it moves money TO the
 * merchant, and that string also ends with `.paid`. A suffix rule therefore
 * treats a merchant payout as a learner paying for a course, which hands out an
 * enrolment nobody bought. Anchoring on the resource name is what separates
 * "a payment was taken" from "a payment was sent out".
 */
const SETTLE_PATTERN = /(^|\.)(checkout_session\.)?payment\.paid$/
const FAILURE_PATTERN = /(^|\.)(checkout_session\.)?payment\.(failed|charge_failed)$/
const CANCEL_PATTERN = /(^|\.)(checkout_session\.)?(payment|checkout_session)\.(cancelled|canceled|expired)$/

/**
 * Decide what an event means.
 *
 * Unknown types are recorded and marked ignored rather than dropped, so a new
 * PayMongo event is visible in the admin ledger instead of looking identical to
 * a payment that worked.
 */
export function decidePaymentAction(envelope: PayMongoEnvelope): Decision {
  const type = (envelope.eventType ?? '').trim().toLowerCase()

  if (SETTLE_PATTERN.test(type)) {
    return { action: 'settle', outcome: 'settle', reason: 'payment settled' }
  }

  if (FAILURE_PATTERN.test(type)) {
    return { action: 'record_failure', outcome: 'record_failure', reason: 'payment failed' }
  }

  if (CANCEL_PATTERN.test(type)) {
    // A checkout nobody completes is not an error, but leaving it 'pending'
    // forever fills the admin ledger with ghosts, so it gets its own terminal
    // state rather than sharing 'failed'.
    return { action: 'cancel', outcome: 'cancel', reason: 'checkout cancelled or expired' }
  }

  return {
    action: 'ignore',
    outcome: 'ignored',
    reason: 'no learner payment state change in this event type',
  }
}

/** True when the event is one we recognise as carrying a money outcome. */
export function isMoneyEvent(envelope: PayMongoEnvelope): boolean {
  return decidePaymentAction(envelope).action !== 'ignore'
}

export { SETTLE_PATTERN, FAILURE_PATTERN, CANCEL_PATTERN }

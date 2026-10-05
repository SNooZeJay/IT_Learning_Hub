import { supabase, readFunctionError } from './supabase/client'
import type { Course } from '@/types'

/**
 * Paid enrolment.
 *
 * The browser never talks to PayMongo. It calls the `create-checkout` Edge
 * Function, which verifies the caller's JWT, creates the payment record and opens
 * a hosted session in one place, so the two cannot disagree. The secret key lives
 * in that function's environment and never reaches here.
 *
 * What comes back is deliberately thin. The browser is told where to send the
 * learner and nothing else - no amount it could display as authoritative, no
 * status it could treat as proof of payment. Payment is confirmed by the webhook,
 * not by this response, and the page reflects that by re-reading the enrolment
 * rather than assuming success.
 */

/** Why the function declined, in terms the page can act on. */
export type CheckoutFailure =
  'not_authenticated' | 'no_such_course' | 'not_configured' | 'enrolment_unavailable' | 'unknown'

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly reason: CheckoutFailure,
    /** HTTP status from the function, when there was one. */
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export interface CheckoutStart {
  /** False for a free course, which needs no payment at all. */
  requiresPayment: boolean
  amountCentavos: number
  /** Present only when `requiresPayment` is true. */
  checkoutUrl?: string
  paymentId?: string
  /**
   * True when a pending payment already existed and was reused. The learner is
   * sent back to the same checkout rather than charged twice, which is the whole
   * point of the idempotency check in the function.
   */
  reused?: boolean
}

const FAILURES: Record<number, CheckoutFailure> = {
  401: 'not_authenticated',
  404: 'no_such_course',
  409: 'enrolment_unavailable',
  500: 'unknown',
  502: 'unknown',
  503: 'not_configured',
}

/**
 * Opens a hosted checkout for a paid course.
 *
 * `returnUrl` is where the learner lands after paying or cancelling. It is built
 * from the current origin rather than accepted from a caller, so this cannot be
 * used to bounce someone to a third-party page after a payment.
 */
export async function startCheckout(courseId: string): Promise<CheckoutStart> {
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      courseId,
      successUrl: `${origin}/student/courses/${courseId}?payment=success`,
      cancelUrl: `${origin}/student/courses/${courseId}?payment=cancelled`,
    },
  })

  if (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined

    // readFunctionError pulls the message the function actually wrote. Without it
    // every failure reads as "Edge Function returned a non-2xx status code",
    // which names neither the cause nor the way out.
    const detail = readFunctionError(error)
    const reason = (status && FAILURES[status]) || 'unknown'

    throw new CheckoutError(messageFor(reason, detail), reason, status)
  }

  const body = (data ?? {}) as Partial<CheckoutStart>

  // A paid course that comes back without a URL is a failure, not a soft no. The
  // function only omits checkoutUrl when the provider refused, and treating that
  // as success would leave the learner staring at a button that does nothing.
  if (body.requiresPayment && !body.checkoutUrl) {
    throw new CheckoutError(
      'The payment provider did not return a checkout link. Nothing has been charged - please try again.',
      'unknown',
    )
  }

  return {
    requiresPayment: body.requiresPayment === true,
    amountCentavos: Number(body.amountCentavos ?? 0),
    checkoutUrl: body.checkoutUrl,
    paymentId: body.paymentId,
    reused: body.reused === true,
  }
}

/** Messages that name the problem and the next step, per failure kind. */
function messageFor(reason: CheckoutFailure, detail: string | null): string {
  switch (reason) {
    case 'not_authenticated':
      return 'Your session has expired. Sign in again and retry - nothing has been charged.'
    case 'no_such_course':
      return 'That course is no longer available for enrolment.'
    case 'not_configured':
      return (
        detail ??
        'Payments are not set up on this deployment yet, so nothing can be charged. Ask an administrator.'
      )
    case 'enrolment_unavailable':
      return 'Your place on this course could not be prepared, so nothing was charged. Please try again.'
    default:
      return detail ?? 'Checkout could not be opened. Nothing has been charged - please try again.'
  }
}

/**
 * Whether this course needs payment at all.
 *
 * Mirrors the function's own rule - zero centavos means free - so the button
 * label and the function's behaviour cannot disagree.
 */
export function courseNeedsPayment(course: Pick<Course, 'priceCentavos'>): boolean {
  return course.priceCentavos > 0
}

import { FunctionTimeoutError, invokeFunction, readFunctionError } from './supabase/client'
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
  /**
   * What the function said it would charge, or undefined when it said nothing.
   *
   * Optional because the function only sends it on the free branch
   * (`{ requiresPayment: false, amountCentavos: 0 }`). Both paid branches - a
   * fresh session and a reused pending payment - omit the field entirely, so a
   * required `number` here was typed as a promise the server never kept: every
   * paid checkout evaluated it to 0 and any caller reading it would show a paid
   * course as costing nothing.
   *
   * The amount is not derived here. This file has the course id and could read
   * the price, but a locally-read price is not what the learner is about to be
   * charged - the function is the authority on that, and substituting a second
   * source is how a page ends up quoting one number and charging another. A
   * missing amount is reported as missing.
   */
  amountCentavos?: number
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

/**
 * Why the provider refused, when it said.
 *
 * `authentication_failed` is by far the most common and the least obvious: the
 * function authenticates with PAYMONGO_SECRET_KEY, and that value is easily
 * confused with the webhook secret, which signs payloads and cannot open a
 * session. Naming it saves a long debugging session over a 502.
 */
function providerMessage(code: string | undefined, status: number | undefined): string | null {
  if (code === 'authentication_failed' || status === 401) {
    return (
      'The payment provider rejected this deployment’s credentials, so checkout is unavailable. ' +
      'Nothing has been charged. An administrator needs to check PAYMONGO_SECRET_KEY - it must ' +
      'be the API secret key from PayMongo’s API Keys page, not the webhook secret.'
    )
  }
  return null
}

/**
 * Recognise a provider rejection inside a function error body.
 *
 * The function returns the provider's own code alongside its 502, because a bare
 * 502 is undiagnosable: it looks equally like a bad key, a malformed amount, or
 * PayMongo being down.
 */
function providerNamed(detail: string): string | null {
  if (/authentication_failed|"providerStatus":\s*401/i.test(detail)) {
    return providerMessage('authentication_failed', 401)
  }
  return null
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
export async function startCheckout(courseId: string, returnSlug?: string): Promise<CheckoutStart> {
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  // The return path must carry the SLUG, not the id.
  //
  // `/student/courses/:id` is resolved by slug everywhere else - CourseCard, the
  // lesson breadcrumb, the sidebar highlight - because CourseDetail looks the
  // course up with `.eq('slug', ...)`. This function used to build the return URL
  // from `courseId`, so a learner who had just paid landed on a lookup for a slug
  // equal to a UUID: no match, "That course does not exist", and the
  // `?payment=success` notice never rendered. The one link in the product built
  // from the wrong identifier was the one after payment.
  const slug = returnSlug ?? courseId

  // Through the timeout wrapper rather than `supabase.functions.invoke`
  // directly. `create-checkout` makes up to four network calls of its own -
  // PayMongo's session API among them - so a provider that accepts the
  // connection and never answers leaves the Enrol button spinning with no
  // message and no way to tell whether a payment was started.
  const { data, error } = await invokeFunction<Partial<CheckoutStart>>('create-checkout', {
    body: {
      courseId,
      successUrl: `${origin}/student/courses/${slug}?payment=success`,
      cancelUrl: `${origin}/student/courses/${slug}?payment=cancelled`,
    },
  })

  if (error) {
    // Named before the status is read: a timeout has no status, and without
    // this it falls through to `messageFor('unknown')` and the learner is told
    // checkout "could not be opened" when in fact the provider simply did not
    // answer in time. `details` is null because there is no response body.
    if (error instanceof FunctionTimeoutError) {
      throw new CheckoutError(error.message, 'unknown')
    }

    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined

    // readFunctionError pulls the message the function actually wrote. Without it
    // every failure reads as "Edge Function returned a non-2xx status code",
    // which names neither the cause nor the way out.
    const detail = readFunctionError(error)
    const reason = (status && FAILURES[status]) || 'unknown'

    // A provider rejection arrives inside a 502 body, so it is recognised from
    // the detail rather than the status. This is the one failure a learner cannot
    // fix and an administrator can, so it has to name the credential.
    const named = detail ? providerNamed(detail) : null

    throw new CheckoutError(named ?? messageFor(reason, detail), reason, status)
  }

  const body = (data ?? {}) as Partial<CheckoutStart>

  // A paid course with no URL is a failure UNLESS the function says it reused an
  // existing payment. That exception matters and was previously missing: the
  // function returns `reused: true` with no URL for a pending payment it could not
  // resurrect, and throwing here turned that into a generic provider error, so the
  // view's own branch for the case was unreachable. The learner was told the
  // provider had failed when the truth was that their earlier payment was still
  // waiting.
  if (body.requiresPayment && !body.checkoutUrl && body.reused !== true) {
    throw new CheckoutError(
      'The payment provider did not return a checkout link. Nothing has been charged - please try again.',
      'unknown',
    )
  }

  return {
    requiresPayment: body.requiresPayment === true,
    // `undefined` when the function did not send it, rather than a `Number(... ?? 0)`
    // that made a ₱1,500 course look free. `Number('')` is 0 and
    // `Number('abc')` is NaN, so both of those are dropped too: a caller must
    // have to handle "the server did not say" rather than be handed a zero it
    // cannot distinguish from a genuinely free course.
    amountCentavos:
      typeof body.amountCentavos === 'number' && Number.isFinite(body.amountCentavos)
        ? body.amountCentavos
        : undefined,
    // Normalised to undefined rather than passed through. The function sends
    // `checkoutUrl: null` when it could not resurrect a session, and `null`
    // flowing into the view would read as falsy in the same branch but break
    // every `=== undefined` check and every falsy check written later.
    checkoutUrl: body.checkoutUrl ?? undefined,
    paymentId: body.paymentId,
    reused: body.reused === true,
  }
}

/** Messages that name the problem and the next step, per failure kind. */
function messageFor(reason: CheckoutFailure, detail: string | null): string {
  // A body that is empty, or just an empty JSON object, names nothing. Preferring
  // it over real wording is how "Failed to fetch" reached a page as the entire
  // explanation - truthy, useless, and more specific-looking than the fallback.
  const useful = detail && detail !== '{}' && detail !== 'null' ? detail : null

  switch (reason) {
    case 'not_authenticated':
      return 'Your session has expired. Sign in again and retry - nothing has been charged.'
    case 'no_such_course':
      return 'That course is no longer available for enrollment.'
    case 'not_configured':
      return (
        useful ??
        'Payments are not set up on this deployment yet, so nothing can be charged. Ask an administrator.'
      )
    case 'enrolment_unavailable':
      return 'Your place on this course could not be prepared, so nothing was charged. Please try again.'
    default:
      return useful ?? 'Checkout could not be opened. Nothing has been charged - please try again.'
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

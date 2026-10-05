/**
 * PayMongo checkout session creation.
 *
 * Creates the payment record and the hosted checkout in one place, because the
 * two must agree: the reference number PayMongo echoes back on the webhook is the
 * only thing that ties an incoming event to a row here. If these were separate
 * calls, a failure between them would produce a checkout whose payment could
 * never be found.
 *
 * The secret key is read from the environment and never appears in a response, a
 * log line, or a client bundle. The browser talks only to this function.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handlePreflight, jsonWithCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SECRET_KEY = Deno.env.get('PAYMONGO_SECRET_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Every response carries CORS headers, and the preflight is answered before
 * anything else.
 *
 * Without this the browser blocks the request at the preflight and the page shows
 * "Failed to fetch" - which is what happened, and which reads like a network fault
 * rather than a missing header. See `_shared/cors.ts`.
 */
function json(body: unknown, status = 200, request?: Request): Response {
  return jsonWithCors(body, status, request)
}

interface CheckoutRequest {
  courseId: string
  /** Returned to PayMongo so the learner lands back on the right page. */
  successUrl: string
  cancelUrl: string
  /** Set false for a free course, which needs no payment at all. */
  paid?: boolean
}

Deno.serve(async (request) => {
  // Answered first, and before the method check: a preflight is an OPTIONS, and
  // letting it fall through to the 405 below is what made the browser give up.
  const preflight = handlePreflight(request)
  if (preflight) return preflight

  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, request)

  // The caller's identity comes from the verified JWT, not from the body. A body
  // carrying a student id would let anyone enrol anyone.
  const user = await authenticate(request)
  if (!user) return json({ error: 'not authenticated' }, 401, request)

  let body: CheckoutRequest
  try {
    body = await request.json()
  } catch {
    return json({ error: 'body must be JSON' }, 400, request)
  }

  const courseId = String(body.courseId ?? '')
  if (!courseId) return json({ error: 'courseId is required' }, 400, request)

  const course = await loadPublishedCourse(courseId)
  if (!course) return json({ error: 'no such published course' }, 404, request)

  const amountCentavos = course.price_centavos
  if (amountCentavos <= 0) {
    // A free course is enrolled directly, not paid for. Sending it to a checkout
    // would create a payment of zero and a learner waiting on a payment provider
    // for something that costs nothing.
    return json({ requiresPayment: false, amountCentavos: 0 }, 200, request)
  }

  if (!SECRET_KEY) {
    console.error('PAYMONGO_SECRET_KEY is not set')
    return json({ error: 'payments are not configured' }, 503, request)
  }

  // Idempotency. A double-tapped button must not create two payments, or the
  // learner is charged twice for one enrolment.
  const existing = await findPendingPayment(user.id, courseId)
  if (existing) {
    // A pending payment that still has its hosted checkout URL means the learner
    // already has an open session. Send them back to it.
    //
    // This is why the URL is stored. An earlier version kept only the session id
    // and returned nothing, so a learner who started paying, walked away, and came
    // back got "the payment provider did not return a checkout link" - a dead
    // button on a payment that was sitting there waiting for them. The URL cannot
    // be reconstructed from the id with any confidence, so it is kept.
    if (existing.provider_checkout_url) {
      return json(
        {
          requiresPayment: true,
          paymentId: existing.id,
          reused: true,
          checkoutUrl: existing.provider_checkout_url,
        },
        200,
        request,
      )
    }

    // A pending payment with no usable session behind it - the first attempt died
    // before PayMongo answered, or it predates the stored URL. Retire it so it
    // cannot sit in the admin ledger forever, and open a fresh session.
    await supabase
      .from('payments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  }

  const enrollmentId = await findOrCreatePendingEnrollment(user.id, courseId)
  if (!enrollmentId) return json({ error: 'enrolment could not be prepared' }, 409, request)

  // Our own correlation key. Short, unique, and not guessable enough to let one
  // learner read another's payment by changing it.
  const reference = makeReference(courseId, user.id)

  const paymentId = await createPendingPayment({
    studentId: user.id,
    courseId,
    amountCentavos,
    reference,
    enrollmentId,
  })
  if (!paymentId) return json({ error: 'payment could not be recorded' }, 500, request)

  const checkout = await createPayMongoSession({
    reference,
    amountCentavos,
    courseTitle: course.title,
    description: course.description ?? course.title,
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl,
  })

  if (!checkout.checkout_url) {
    // The payment row exists with no provider session behind it. Mark it cancelled
    // rather than leaving a pending payment that can never settle, which would
    // otherwise sit in the admin ledger forever.
    await supabase
      .from('payments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', paymentId)
    return json(
      {
        error: 'checkout could not be created',
        // Passed through from createPayMongoSession so the page can say whether
        // this is a credential problem or a malformed request.
        providerStatus: checkout.error ? checkout.providerStatus : undefined,
        providerCode: checkout.error ? checkout.providerCode : undefined,
        providerDetail: checkout.error ? checkout.providerDetail : undefined,
      },
      502,
      request,
    )
  }

  // Both handles are stored: the id for reconciliation against PayMongo's API and
  // the ledger, and the URL so a learner who abandons payment can return to the
  // same session instead of being handed a dead button.
  await supabase
    .from('payments')
    .update({
      provider_checkout_id: checkout.id,
      provider_checkout_url: checkout.checkout_url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)

  return json(
    { requiresPayment: true, paymentId, checkoutUrl: checkout.checkout_url },
    200,
    request,
  )
})

/**
 * Verify the caller's JWT with Supabase rather than trusting the header.
 *
 * The client sends the same anon key everyone has, so the header proves nothing on
 * its own; only the server-side verification does.
 */
async function authenticate(request: Request): Promise<{ id: string } | null> {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  const { data, error } = await supabase.auth.getUser(header.slice('Bearer '.length))
  if (error || !data.user) return null
  return { id: data.user.id }
}

interface CourseRow {
  id: string
  title: string
  description: string | null
  price_centavos: number
  status: string
}

async function loadPublishedCourse(courseId: string): Promise<CourseRow | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, description, price_centavos, status')
    .eq('id', courseId)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    console.error('create-checkout: course lookup failed:', error.message)
    return null
  }
  return (data as CourseRow | null) ?? null
}

async function findPendingPayment(
  studentId: string,
  courseId: string,
): Promise<{
  id: string
  provider_checkout_id: string | null
  provider_checkout_url: string | null
} | null> {
  const { data } = await supabase
    .from('payments')
    .select('id, provider_checkout_id, provider_checkout_url')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (
    (data as {
      id: string
      provider_checkout_id: string | null
      provider_checkout_url: string | null
    } | null) ?? null
  )
}

/**
 * The enrolment exists before payment so the learner has something to wait on and
 * the webhook has something to activate. It is `pending`, which grants no access.
 */
async function findOrCreatePendingEnrollment(
  studentId: string,
  courseId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('enrollments')
    .select('id, status')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .maybeSingle()

  if (existing) {
    const row = existing as { id: string; status: string }

    // A dropped enrolment is reused as-is, which used to be a trap.
    //
    // `enrollments` has unique (course_id, student_id), so a retry cannot create
    // a second row: it has to reuse this one. If a previous payment failed,
    // `fail_payment` set the row to 'dropped', and the retry attached a new
    // payment to a dropped enrolment. settle_payment then updated nothing while
    // still reporting success, so the learner paid and got no course.
    //
    // The learner is paying again, so the withdrawal is over. Reviving it to
    // 'pending' gives the retry somewhere valid to land. An already-active
    // enrolment is left alone: a payment for a course they hold is an admin
    // action, not something a stray click should quietly reopen.
    if (row.status === 'dropped') {
      const { data: revived, error: reviveError } = await supabase
        .from('enrollments')
        .update({ status: 'pending', cancelled_at: null, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'dropped')
        .select('id')
        .maybeSingle()

      if (reviveError) {
        console.error('create-checkout: could not revive dropped enrolment:', reviveError.message)
        return null
      }
      if (revived) return (revived as { id: string }).id
    }

    return row.id
  }

  const { data, error } = await supabase
    .from('enrollments')
    .insert({ student_id: studentId, course_id: courseId, status: 'pending' })
    .select('id')
    .single()

  if (error) {
    console.error('create-checkout: enrolment insert failed:', error.message)
    return null
  }
  return (data as { id: string }).id
}

async function createPendingPayment(input: {
  studentId: string
  courseId: string
  amountCentavos: number
  reference: string
  enrollmentId: string
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      student_id: input.studentId,
      course_id: input.courseId,
      enrollment_id: input.enrollmentId,
      amount_centavos: input.amountCentavos,
      currency: 'PHP',
      status: 'pending',
      provider: 'paymongo',
      reference_number: input.reference,
    })
    .select('id')
    .single()

  if (error) {
    console.error('create-checkout: payment insert failed:', error.message)
    return null
  }
  return (data as { id: string }).id
}

/** Call PayMongo. The secret goes in the Authorization header and nowhere else. */
async function createPayMongoSession(input: {
  reference: string
  amountCentavos: number
  courseTitle: string
  description: string
  successUrl: string
  cancelUrl: string
}): Promise<{
  id?: string
  checkout_url?: string
  error?: true
  providerStatus?: number
  providerCode?: string
  providerDetail?: string
}> {
  const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${SECRET_KEY}:`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          // `line_items`, not `billing_line_items`, and not a bare `amount`.
          //
          // PayMongo's own 400 named both missing parameters, which is the only
          // reason this is right:
          //   Parameter line_items is required          /data/attributes/line_items
          //   Parameter payment_method_types is required /data/attributes/payment_method_types
          //
          // Two earlier shapes were guesses - a top-level amount, then
          // billing_line_items - and both produced the same undifferentiated
          // invalid_request_body. The code here also carried a comment asserting
          // where the redirect URLs belonged, which was itself wrong. Comments are
          // not evidence; the provider's error is.
          line_items: [
            {
              // Integer minor units. A float peso is both a rounding bug and a
              // rejection, so the conversion happens here and nowhere else.
              currency: 'PHP',
              amount: input.amountCentavos,
              name: input.courseTitle.slice(0, 255),
              quantity: 1,
            },
          ],
          // GCash and PayMaya only, deliberately. QR Ph is excluded because it is
          // asynchronous - and PayMongo's own testing documentation warns that
          // test-mode QR codes are real and will process a real transaction if
          // scanned, which is not a risk worth carrying into a classroom.
          payment_method_types: ['gcash', 'paymaya'],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          // The value PayMongo echoes back on the webhook, as reference_number or
          // external_reference_number depending on the event type.
          reference_number: input.reference,
          metadata: { course_title: input.courseTitle },
        },
      },
    }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // Logged in full, server-side. The provider's own text is the only thing that
    // explains a failure here, and it named both missing parameters when the
    // request schema was wrong - which is how `line_items` and
    // `payment_method_types` were found.
    console.error(
      `create-checkout: PayMongo refused with ${response.status}:`,
      JSON.stringify(body?.errors ?? body)?.slice(0, 800),
    )

    // Only the status and the provider's code cross back to the browser. The full
    // body echoed the request and is not the browser's business.
    const first = Array.isArray(body?.errors) ? body.errors[0] : undefined
    return {
      error: 'paymongo_refused',
      providerStatus: response.status,
      providerCode: typeof first?.code === 'string' ? first.code : undefined,
      // The `detail` names the offending parameter, which is what makes a 400
      // actionable. It is provider-authored prose about our own request, and it
      // names no credential.
      providerDetail: typeof first?.detail === 'string' ? first.detail.slice(0, 200) : undefined,
    }
  }

  return {
    id: body?.data?.id,
    checkout_url: body?.data?.attributes?.checkout_url,
  }
}

/**
 * The correlation key we send and receive back.
 *
 * Deliberately not a bare sequence: it carries the course and the user so a
 * support conversation can be traced from a payment back to both, and the random
 * tail stops one learner enumerating another's payment ids.
 */
function makeReference(courseId: string, userId: string): string {
  const course = courseId.slice(0, 8)
  const user = userId.slice(0, 8)
  const tail = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()
  return `ITH-${course}-${user}-${tail}`
}

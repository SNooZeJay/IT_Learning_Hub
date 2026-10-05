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
    return json({ requiresPayment: true, paymentId: existing.id, reused: true }, 200, request)
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
      },
      502,
      request,
    )
  }

  await supabase
    .from('payments')
    .update({ provider_checkout_id: checkout.id, updated_at: new Date().toISOString() })
    .eq('id', paymentId)

  return json({ requiresPayment: true, paymentId, checkoutUrl: checkout.checkout_url }, 200, request)
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
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('payments')
    .select('id')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .eq('status', 'pending')
    .maybeSingle()
  return (data as { id: string } | null) ?? null
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
    .select('id')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .maybeSingle()

  if (existing) return (existing as { id: string }).id

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
          // Integer minor units. A float peso here is a rounding bug waiting to
          // happen, and PayMongo rejects it.
          amount: input.amountCentavos,
          currency: 'PHP',
          description: input.description.slice(0, 255),
          // This is the value PayMongo echoes back on the webhook, as
          // reference_number or external_reference_number depending on the event.
          reference_number: input.reference,
          metadata: { course_title: input.courseTitle },
        },
        // Not nested under data.attributes: the Checkout Sessions API takes the
        // redirect URLs at the top level of data.
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // Logged without the secret. The provider's own error text is safe and is the
    // only thing that explains a failure here.
    console.error(
      `create-checkout: PayMongo refused with ${response.status}:`,
      JSON.stringify(body?.errors ?? body)?.slice(0, 500),
    )
    // The status and PayMongo's own code are returned to the caller so a wrong
    // merchant key is distinguishable from a malformed amount. The detail string
    // is not: it is the provider echoing the request, and it has no business
    // reaching a browser.
    const first = Array.isArray(body?.errors) ? body.errors[0] : undefined
    return {
      error: 'paymongo_refused',
      providerStatus: response.status,
      providerCode: typeof first?.code === 'string' ? first.code : undefined,
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

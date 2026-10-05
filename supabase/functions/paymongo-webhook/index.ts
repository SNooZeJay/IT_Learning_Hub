/**
 * PayMongo webhook receiver.
 *
 * A Supabase Edge Function. This is the only public endpoint that writes payment
 * state, so it is written to be boring and auditable.
 *
 * Three properties, in order of importance:
 *
 * 1. Verify the signature before anything else. An unverified body cannot change
 *    payment state, but it is still recorded, so an attack is visible rather than
 *    invisible.
 * 2. Be idempotent. PayMongo retries until it receives a 200, so duplicate
 *    deliveries are routine rather than exceptional. The event id is the key, and
 *    `record_payment_event` owns that.
 * 3. Answer 200 for any well-formed request, including one that could not be
 *    acted on. Returning 500 for an unmatched event makes the provider retry
 *    forever, and a provider that gives up is a payment that never settles.
 *
 * The parsing, signature and decision logic live in `_shared/` as pure modules
 * with their own suites. Only this file touches the database, and it does so
 * through the same SECURITY DEFINER functions the rest of the system uses.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parsePayMongoEvent } from '../_shared/paymongo-envelope.ts'
import { readSignatureHeader, verifySignature } from '../_shared/paymongo-signature.ts'
import { decidePaymentAction } from '../_shared/paymongo-decision.ts'
import type { PayMongoEnvelope } from '../_shared/paymongo-envelope.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const WEBHOOK_SECRET = Deno.env.get('PAYMONGO_WEBHOOK_SECRET') ?? ''

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!WEBHOOK_SECRET) {
    // Loudly unconfigured. Accepting anything would be far worse than failing.
    console.error('PAYMONGO_WEBHOOK_SECRET is not set; refusing to trust any payload')
    return json({ error: 'webhook not configured' }, 500)
  }

  // The raw body is captured BEFORE parsing. The signature covers the exact bytes
  // PayMongo sent; re-serialising a parsed object changes whitespace and key order,
  // which fails every check.
  const rawBody = await request.text()

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.warn('paymongo webhook: body was not JSON')
    await recordAsUnusable(rawBody, false, 'unparseable_payload')
    return json({ received: true, matched: false })
  }

  const verified = await verifySignature(
    rawBody,
    readSignatureHeader(request.headers),
    WEBHOOK_SECRET,
  )

  const envelope = await parsePayMongoEvent(payload, rawBody)

  if (!envelope) {
    console.warn('paymongo webhook: payload carried no event type')
    await recordAsUnusable(rawBody, verified, 'no_event_type')
    return json({ received: true, matched: false })
  }

  if (!verified) {
    // Recorded, never acted on. Deleting an unverified event would hide the
    // attempt; the record is the evidence.
    console.error(`paymongo webhook: signature failed for ${envelope.eventId}`)
    await recordAsUnusable(rawBody, false, 'signature_unverified', envelope)
    return json({ received: true, verified: false })
  }

  const decision = decidePaymentAction(envelope)

  const paymentId = await findPayment(envelope.referenceNumber)
  const recorded = await recordEvent(rawBody, envelope, paymentId)
  if (!recorded.ok) return json({ received: true, matched: false, error: recorded.error })
    // A duplicate is only a duplicate if the row holding the id was itself verified.
    //
    // Any delivery that failed verification is still recorded, and still claims the
    // event id. Treating "the id is taken" as "we already handled it" meant that a
    // retry arriving with a corrupt or missing signature header claimed the id, and
    // PayMongo next, correctly signed, retry was swallowed as a duplicate: 200, no
    // settlement, the learner charged and the payment stuck at pending with nothing to
    // show for it. The endpoint is deliberately unauthenticated because the provider
    // cannot send a JWT, and the id comes from the request body, so an unverified
    // pre-claim is also reachable by anyone who learns or guesses one.
    //
    // Falling through instead is safe: settle_payment refuses to run twice, so the
    // genuinely-already-handled case re-runs and is refused idempotently.
    if (recorded.isNew === false && recorded.storedVerified) {
      return json({ received: true, duplicate: true })
    }
    if (recorded.isNew === false) {
      console.warn(
        'paymongo webhook: event id was already claimed by an unverified row; continuing so the genuine event can settle',
      )
    }

  if (!paymentId) {
    console.warn(
      `paymongo webhook: no payment matches reference ${envelope.referenceNumber ?? '(none)'}`,
    )
    await setStatus(envelope.eventId, 'failed', 'unmatched_reference')
    return json({ received: true, matched: false })
  }

  if (decision.action === 'ignore') {
    // Visible rather than dropped. An event this code does not understand should
    // appear in the ledger as ignored, not vanish.
    await setStatus(envelope.eventId, 'ignored')
    return json({ received: true, action: 'ignored' })
  }

  const outcome =
      decision.action === 'settle'
        ? await settle(paymentId, envelope)
        : await fail(paymentId, envelope, decision.action === 'cancel')

    // A failure to settle is a failure, and it has to reach the provider as one.
    //
    // Returning 200 here told PayMongo the delivery succeeded, so it stopped retrying,
    // and the learner was left charged with the payment stuck at pending and the
    // enrolment never activated. 500 makes the provider try again, which is the only
    // thing that can fix a transient fault.
    //
    // This is deliberately different from the unmatched-event case above, which does
    // return 200. An event we cannot match is a permanent condition and retrying it
    // forever achieves nothing; a settlement that failed is not, and the difference is
    // the whole reason the status code is not uniform.
    if (outcome === 'settle_failed' || outcome === 'fail_failed') {
      console.error(
        'paymongo webhook: could not apply the event; asking the provider to retry',
      )
      return json({ received: true, matched: true, outcome }, 500)
    }

    return json({ received: true, matched: true, outcome })
  })
/**
 * Find the payment by the reference number we sent when creating the checkout.
 *
 * PayMongo calls the same value `reference_number` on a checkout event and
 * `external_reference_number` on a payment-level event. The envelope parser
 * already reads both positions, so this queries one column.
 */
async function findPayment(reference: string | null): Promise<string | null> {
  if (!reference) return null
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('reference_number', reference)
    .maybeSingle()

  if (error) {
    console.error('paymongo webhook: payment lookup failed:', error.message)
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}

/**
 * Store the event through the same function the rest of the system uses.
 *
 * `record_payment_event` owns the idempotency rule — `ON CONFLICT DO NOTHING` on
 * the event id — and returns whether this was a first sighting. Reimplementing that
 * here would create a second, subtly different answer to "have I seen this before".
 */
async function recordEvent(
  rawBody: string,
  envelope: PayMongoEnvelope,
  paymentId: string | null,
  ): Promise<
    { ok: true; isNew: boolean; storedVerified: boolean } | { ok: false; error: string }
  > {
  const { data, error } = await supabase.rpc('record_payment_event', {
    in_event_id: envelope.eventId,
    in_event_type: envelope.eventType,
    in_resource_id: envelope.resourceId,
    in_payload: JSON.parse(rawBody),
    in_signature_verified: true,
  })

  if (error) {
    console.error('paymongo webhook: could not record event:', error.message)
    return { ok: false, error: 'record_failed' }
  }

    const rows = (data ?? []) as Array<
      { id: string; is_new: boolean; payment_id: string | null; stored_signature_verified: boolean | null }
    >
  const row = rows[0]
  if (!row) return { ok: false, error: 'record_returned_nothing' }

  // Link the payment onto the event row. The RPC deliberately does not take it,
  // because at insert time the payment may not be known yet.
  if (paymentId && row.payment_id !== paymentId) {
    await supabase.from('payment_events').update({ payment_id: paymentId }).eq('id', row.id)
  }

    // Whether the row that already held this id was itself verified. The RPC reads it from
    // the *stored* row rather than from the argument, which is the whole point: a correctly
    // signed event that collides with an unverified pre-claim has to be able to tell that
    // apart from a genuine provider retry.
    return { ok: true, isNew: row.is_new, storedVerified: row.stored_signature_verified === true }
}

/**
 * Settle a paid payment and activate its enrolment.
 *
 * The amount and currency comparison lives inside `settle_payment`. The HMAC has
 * already proved the event came from PayMongo, so that check is not about forgery —
 * it is about a provider bug, a misconfigured checkout, or a partial payment
 * unlocking a course nobody paid for.
 */
async function settle(paymentId: string, envelope: PayMongoEnvelope): Promise<string> {
  const { data, error } = await supabase.rpc('settle_payment', {
    in_payment_id: paymentId,
    in_provider_payment_id: envelope.providerPaymentId,
    in_amount_centavos: envelope.amountMinor,
    in_currency: envelope.currency,
    in_event_id: envelope.eventId,
  })

  if (error) {
    console.error('paymongo webhook: settle failed:', error.message)
    return 'settle_failed'
  }
  return String(data)
}

async function fail(
  paymentId: string,
  envelope: PayMongoEnvelope,
  cancelled: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('fail_payment', {
    in_payment_id: paymentId,
    in_provider_payment_id: envelope.providerPaymentId,
    in_failure_code: envelope.failureCode,
    in_failure_message: envelope.failureMessage,
    in_event_id: envelope.eventId,
    in_cancelled: cancelled,
  })

  if (error) {
    console.error('paymongo webhook: failure record failed:', error.message)
    return 'record_failure_failed'
  }
  return String(data)
}

async function setStatus(
  eventId: string,
  status: 'ignored' | 'failed' | 'processed',
  failureCode?: string,
): Promise<void> {
  await supabase
    .from('payment_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      ...(failureCode ? { failure_code: failureCode } : {}),
    })
    .eq('event_id', eventId)
}

/** Record something that cannot be reconciled, keyed so a retry does not duplicate it. */
async function recordAsUnusable(
  rawBody: string,
  verified: boolean,
  failureCode: string,
  envelope?: PayMongoEnvelope,
): Promise<void> {
  const eventId = envelope?.eventId ?? `unusable:${await sha256(rawBody)}`
  await supabase.rpc('record_payment_event', {
    in_event_id: eventId,
    in_event_type: envelope?.eventType ?? null,
    in_resource_id: envelope?.resourceId ?? null,
    in_payload: JSON.parse(rawBody),
    in_signature_verified: verified,
  })
  await setStatus(eventId, 'failed', failureCode)
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

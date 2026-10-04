/**
 * Reads a PayMongo webhook payload.
 *
 * Pure TypeScript on purpose: no Deno, no Supabase, no framework. That is what
 * makes it unit-testable in Node, and it is the one place where a silent bug is
 * most expensive, because a misread field means a payment that was never taken
 * looks like one that was.
 *
 * Two facts drive the whole shape of this file:
 *
 * 1. PayMongo documents TWO envelope shapes for the same endpoint. The Events API
 *    nests under `data.attributes`, while Hosted Checkout puts the same fields
 *    directly under `data`. Reading only one shape means every event of the other
 *    product is rejected as malformed.
 *
 * 2. The correlation key is spelled differently depending on the event. A
 *    checkout session event carries `reference_number`; a payment level event
 *    carries `external_reference_number`. Reading only the first makes every
 *    `payment.failed` look unmatched, so a declined card is never reflected
 *    anywhere.
 *
 * Nothing is guessed. Each field lists the exact paths the provider documents
 * and the first usable value wins.
 */

export interface PayMongoEnvelope {
  /** Idempotency key. Provider event id, or a hash of the raw body. */
  eventId: string
  /** e.g. `checkout_session.payment.paid`, `payment.failed`. */
  eventType: string | null
  /** The thing the event is about: `cs_`, `pay_`, `pi_` or `pm_`. */
  resourceId: string | null
  /** Our own reference number, from either documented position. */
  referenceNumber: string | null
  /** The `pay_...` id specifically, not whichever resource the event names. */
  providerPaymentId: string | null
  /** Minor units, as an integer. Null means "not reported", never guessed. */
  amountMinor: number | null
  currency: string | null
  /** True for real money. A test event against live data is a provider bug. */
  livemode: boolean | null
  failureCode: string | null
  failureMessage: string | null
}

const TYPE_PATHS = ['data.attributes.type', 'data.type'] as const

const RESOURCE_ID_PATHS = [
  'data.attributes.data.id',
  'data.data.id',
] as const

/**
 * Our correlation key, in the order the provider documents it.
 *
 * `reference_number` is what we sent when creating the session.
 * `external_reference_number` is what the same value is called on a payment level
 * event. Without the second position, every declined payment looks unmatched.
 */
const REFERENCE_PATHS = [
  'data.attributes.data.attributes.reference_number',
  'data.data.attributes.reference_number',
  'data.attributes.data.attributes.external_reference_number',
  'data.data.attributes.external_reference_number',
] as const

/**
 * A Hosted Checkout event carries a LIST of payment attempts rather than one
 * payment, so the amount is read from the first attempt in that list.
 */
const PAYMENT_LIST_PATHS = [
  'data.attributes.data.attributes.payments',
  'data.data.attributes.payments',
] as const

const AMOUNT_PATHS = [
  'data.attributes.data.attributes.payments.0.attributes.amount',
  'data.data.attributes.payments.0.attributes.amount',
  'data.attributes.data.attributes.amount',
  'data.data.attributes.amount',
] as const

const CURRENCY_PATHS = [
  'data.attributes.data.attributes.payments.0.attributes.currency',
  'data.data.attributes.payments.0.attributes.currency',
  'data.attributes.data.attributes.currency',
  'data.data.attributes.currency',
] as const

const FAILURE_CODE_PATHS = [
  'data.attributes.data.attributes.last_error.code',
  'data.data.attributes.last_error.code',
] as const

const FAILURE_MESSAGE_PATHS = [
  'data.attributes.data.attributes.last_error.message',
  'data.data.attributes.last_error.message',
] as const

const LIVEMODE_PATHS = ['data.attributes.livemode', 'data.livemode'] as const

const EVENT_ID_CANDIDATES = ['data.id', 'id'] as const

/**
 * Prefixes that mark a RESOURCE id rather than an event id.
 *
 * This distinction is load bearing. Storing `cs_...` or `pay_...` as the event id
 * would make a redelivered event collide with a completely different event, and
 * the second one would be discarded as a duplicate.
 */
const RESOURCE_PREFIXES = ['cs_', 'pay_', 'pi_', 'pm_'] as const

type Json = unknown

/** Reads a dotted path, tolerating numeric segments for array indices. */
function dig(payload: Json, path: string): Json {
  let current: Json = payload
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, Json>)[segment]
  }
  return current
}

/**
 * First usable string at any of these positions.
 *
 * A blank string is treated as absent rather than as a value, because PayMongo
 * sends empty strings for fields that do not apply to a given product.
 */
function firstString(payload: Json, paths: readonly string[]): string | null {
  for (const path of paths) {
    const value = dig(payload, path)
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/**
 * First usable whole number at any of these positions.
 *
 * The provider sends a JSON number, but a value that has been through a proxy or
 * a spreadsheet can arrive as a numeric string, so both are accepted. Anything
 * that is not a whole number — a float, a word, null — is treated as ABSENT
 * rather than rounded or coerced.
 *
 * That distinction is deliberate. An amount has to be exact to be compared
 * against a stored one, and returning null here means the comparison is skipped.
 * So a malformed amount can never be used to force a mismatch, and can never
 * unlock a course either.
 */
function firstInteger(payload: Json, paths: readonly string[]): number | null {
  for (const path of paths) {
    const value = dig(payload, path)
    if (typeof value === 'number' && Number.isInteger(value)) return value
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return Number.parseInt(value.trim(), 10)
    }
  }
  return null
}

function firstBoolean(payload: Json, paths: readonly string[]): boolean | null {
  for (const path of paths) {
    const value = dig(payload, path)
    if (typeof value === 'boolean') return value
  }
  return null
}

function looksLikeResourceId(value: string): boolean {
  return RESOURCE_PREFIXES.some((prefix) => value.startsWith(prefix))
}

/**
 * The event id, used to reject a redelivery.
 *
 * Some documented payloads carry no event id at all. A retry re-sends the same
 * body byte for byte, so hashing the raw body gives the same key for a replay
 * and a different key for a genuinely different event.
 *
 * Requires the raw body, which is why it cannot be derived from the parsed
 * object alone: re-serialising changes the bytes and breaks the comparison.
 */
export async function resolveEventId(payload: Json, rawBody: string): Promise<string> {
  for (const path of EVENT_ID_CANDIDATES) {
    const value = firstString(payload, [path])
    if (value !== null && !looksLikeResourceId(value)) return value
  }
  return `sha256:${await sha256Hex(rawBody)}`
}

/**
 * The `pay_...` identifier, which is what belongs in provider_payment_id.
 *
 * A Hosted Checkout event is about a SESSION, so its resource id starts `cs_`.
 * The real payment id sits inside the payments list on that event.
 */
function resolveProviderPaymentId(payload: Json, resourceId: string | null): string | null {
  for (const path of PAYMENT_LIST_PATHS) {
    const payments = dig(payload, path)
    if (!Array.isArray(payments)) continue
    for (const payment of payments) {
      if (payment && typeof payment === 'object') {
        const id = (payment as Record<string, Json>).id
        if (typeof id === 'string' && id !== '') return id
      }
    }
  }
  if (resourceId !== null && resourceId.startsWith('pay_')) return resourceId
  return null
}

/**
 * Parse a webhook body.
 *
 * Returns null only when the payload carries no event type at all, which means
 * it is not a PayMongo event and must not be treated as one.
 *
 * Async because the replay fallback hashes the raw body, and Web Crypto's digest
 * is a promise in both Deno and Node. Forcing that to look synchronous is how a
 * code base ends up with a hand-rolled hash that is subtly wrong.
 */
export async function parsePayMongoEvent(
  payload: Json,
  rawBody: string,
): Promise<PayMongoEnvelope | null> {
  const eventType = firstString(payload, TYPE_PATHS)
  if (eventType === null) return null

  const resourceId = firstString(payload, RESOURCE_ID_PATHS)

  return {
    eventId: await resolveEventId(payload, rawBody),
    eventType,
    resourceId,
    referenceNumber: firstString(payload, REFERENCE_PATHS),
    providerPaymentId: resolveProviderPaymentId(payload, resourceId),
    amountMinor: firstInteger(payload, AMOUNT_PATHS),
    currency: firstString(payload, CURRENCY_PATHS),
    livemode: firstBoolean(payload, LIVEMODE_PATHS),
    failureCode: firstString(payload, FAILURE_CODE_PATHS),
    failureMessage: firstString(payload, FAILURE_MESSAGE_PATHS),
  }
}

/** SHA-256 hex digest. Web Crypto is available in Deno and Node 18+. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

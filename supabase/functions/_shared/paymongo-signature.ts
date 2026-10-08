/**
 * PayMongo webhook signature verification.
 *
 * Pure TypeScript so it can be unit-tested without a running Edge Function.
 * Uses Web Crypto, which exists in both Deno and Node 18+.
 */

/**
 * Header names PayMongo uses for the signature.
 *
 * Checked in a fixed order because a delivery should carry exactly one. A request
 * carrying two different signatures is not something to guess about.
 */
const SIGNATURE_HEADERS = [
  'paymongo-signature',
  'x-paymongo-signature',
  'signature',
] as const

export function readSignatureHeader(headers: Headers): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name)
    if (value !== null && value.trim() !== '') return value.trim()
  }
  return null
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Timing-safe comparison.
 *
 * A plain `===` on a signature returns as soon as two bytes differ, which leaks
 * how much of a guessed value was correct. The comparison here walks the whole
 * length regardless. The length check comes first, and a length mismatch is a
 * rejection rather than an early return that would leak the expected length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** How old a signed request may be before it is refused. */
const TOLERANCE_SECONDS = 300

export interface ParsedSignature {
  /** The signed payload digest, whichever key carried it. */
  digest: string
  /** Unix seconds, when the header was the multi-part form. */
  timestamp: number | null
  /**
   * The signed message, which is what the digest must be computed over.
   *
   * For the multi-part form this is `${t}.${rawBody}`; for a bare digest the body is
   * signed on its own. Getting this wrong is the whole bug, so it is returned rather
   * than rebuilt inside the comparison.
   */
  signedPayload: (rawBody: string) => string
}

/**
 * Read a `Paymongo-Signature` header.
 *
 * PayMongo sends the Stripe-style multi-part form:
 *
 *     t=1750000000,te=<hex digest>,li=
 *
 * where `t` is the Unix time the request was signed, `te` is the hex HMAC-SHA256 of
 * `${t}.${rawBody}`, and `li` is an empty lookahead slot.
 *
 * This parser used to treat the entire header as the digest and test it against
 * /^[0-9a-f]+$/, so `t=1750000000,te=abc...,li=` failed that test on every single
 * delivery. Every webhook was recorded as `signature_unverified` and, correctly,
 * refused - which meant PayMongo took the money and the enrolment never activated.
 * The secret was right the whole time; the header was never being read.
 *
 * A bare hex digest is still accepted, because that is the simpler form the Stripe
 * scheme degrades to and some providers send it. `v1` is read alongside `te` for the
 * same reason: the two names mean the same thing.
 */
export function parseSignatureHeader(header: string): ParsedSignature | null {
  const trimmed = header.trim()
  if (trimmed === '') return null

  const parts = new Map<string, string>()
  for (const segment of trimmed.split(',')) {
    const eq = segment.indexOf('=')
    if (eq <= 0) continue
    parts.set(segment.slice(0, eq).trim(), segment.slice(eq + 1).trim())
  }

  const timestamp = parts.get('t')
  const digest = parts.get('te') ?? parts.get('v1')

  if (digest !== undefined && /^[0-9a-f]+$/i.test(digest)) {
    const seconds = timestamp !== undefined && /^\d+$/.test(timestamp) ? Number(timestamp) : null
    return {
      digest: digest.toLowerCase(),
      timestamp: seconds,
      signedPayload: (rawBody) => (seconds === null ? rawBody : `${seconds}.${rawBody}`),
    }
  }

  // A bare digest, with or without the `sha256=` prefix some senders add.
  const bare = trimmed.replace(/^sha256=/i, '').trim().toLowerCase()
  if (/^[0-9a-f]+$/.test(bare)) {
    return { digest: bare, timestamp: null, signedPayload: (rawBody) => rawBody }
  }

  return null
}

/**
 * Verify a webhook signature.
 *
 * THE RAW BODY MATTERS. The signature covers the exact bytes PayMongo sent. Parsing
 * the body into an object and re-serialising it changes whitespace and key order,
 * which produces a different digest and fails every check. That is why the caller must
 * capture the raw text before it looks at the payload.
 *
 * The timestamp is signed too, which is what makes a captured request useless to
 * replay later. A signature that verifies but is older than the tolerance is refused,
 * so freshness is checked rather than assumed.
 */
export async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!signatureHeader) return false
  if (!secret) return false

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) return false

  if (
    parsed.timestamp !== null &&
    Math.abs(now / 1000 - parsed.timestamp) > TOLERANCE_SECONDS
  ) {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = toHex(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(parsed.signedPayload(rawBody)),
    ),
  )

  return timingSafeEqual(parsed.digest, expected)
}

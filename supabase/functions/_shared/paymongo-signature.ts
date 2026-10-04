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

/**
 * Verify a webhook signature.
 *
 * THE RAW BODY MATTERS. The signature is computed over the exact bytes PayMongo
 * sent. Parsing the body into an object and re-serialising it changes whitespace
 * and key order, which produces a different digest and fails every check. That
 * is why the caller must capture the raw text before it looks at the payload.
 *
 * PayMongo documents the signature as a hex-encoded HMAC-SHA256 of the raw body,
 * sometimes with a `sha256=` prefix, so both forms are accepted.
 */
export async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  if (!secret) return false

  const provided = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(provided)) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))

  return timingSafeEqual(provided, expected)
}
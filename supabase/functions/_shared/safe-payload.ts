/**
 * Parsing a request body that is known to be untrustworthy.
 *
 * `paymongo-webhook` records every body it cannot use, including bodies that are not JSON
 * at all - that is the whole point of the ledger, since "an attack is visible rather than
 * invisible" is the property being bought. It then stored the payload with a bare
 * `JSON.parse(rawBody)`, which is the call that had just thrown:
 *
 *     try {
 *       payload = JSON.parse(rawBody)
 *     } catch {
 *       await recordAsUnusable(rawBody, false, 'unparseable_payload')   // parse again
 *     }
 *
 * and `recordAsUnusable` did exactly that a second time. So for a malformed body the
 * handler threw inside its own recovery path, escaped the `Deno.serve` handler, and the
 * guaranteed `200 {received: true, matched: false}` was never returned. The one case the
 * record exists for was the one case that could not record itself.
 *
 * This function cannot throw. The raw text is always preserved, so an operator can see
 * what was actually sent rather than a redaction of it.
 */

/** What ends up in a jsonb column: the parsed body, or the raw text under a fixed key. */
export type SafePayload = Record<string, unknown>

/** The key the unparsed text is stored under, so it is findable rather than merely present. */
export const RAW_PAYLOAD_KEY = 'unparsed_raw_body'

/** Raw bodies are kept whole; a truncated "excerpt" would misrepresent what was sent. */
export const MAX_RAW_PAYLOAD_CHARS = 64_000

/**
 * Parse JSON, or keep the text.
 *
 * A body that parses to a non-object - a bare number, a quoted string, `null` - is also
 * unusable as a payload, and is wrapped for the same reason: `record_payment_event` wants
 * an object, and passing it a scalar is how a second surprise gets in.
 *
 * The body is truncated at `MAX_RAW_PAYLOAD_CHARS` because the column is jsonb and an
 * unbounded body from an anonymous caller is a cheap way to fill the ledger. Truncation
 * marks itself so nobody reads a clipped body as the whole one.
 */
export function parseOrWrap(rawBody: string): SafePayload {
  const clipped =
    rawBody.length > MAX_RAW_PAYLOAD_CHARS
      ? `${rawBody.slice(0, MAX_RAW_PAYLOAD_CHARS)}…[truncated ${rawBody.length - MAX_RAW_PAYLOAD_CHARS} more characters]`
      : rawBody

  try {
    const parsed: unknown = JSON.parse(clipped)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SafePayload
    }
    return { [RAW_PAYLOAD_KEY]: clipped, reason: 'body was JSON but not an object' }
  } catch {
    return { [RAW_PAYLOAD_KEY]: clipped, reason: 'body was not JSON' }
  }
}

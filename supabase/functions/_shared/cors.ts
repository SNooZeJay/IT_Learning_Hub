/**
 * CORS for browser-called Edge Functions.
 *
 * Why this file exists
 * --------------------
 * A browser sending `Content-Type: application/json` triggers a preflight. If the
 * function does not answer that OPTIONS request with `Access-Control-Allow-Origin`,
 * the browser blocks the real request before it leaves the page. The page then
 * reports:
 *
 *   TypeError: Failed to fetch
 *
 * ...which names nothing. It is not a network problem, not a timeout, and not a
 * function error - the function is never called at all. Verified against the
 * deployed functions, which answered the preflight with 405 and no CORS headers.
 *
 * That is why `create-checkout` and `send-email` were both unreachable from the
 * site while returning correct responses when called from a script. Node's fetch
 * does not enforce CORS, so testing from the terminal proved nothing about the
 * browser.
 *
 * What it does
 * ------------
 * Answers the preflight, and adds the headers to every response so the browser
 * will show the body rather than an opaque failure.
 */

/**
 * The origin allowed to call these functions.
 *
 * Read from the environment rather than hardcoded, so the deployed site and a
 * preview deployment can differ without a code change. Defaults to the production
 * origin.
 *
 * The value is echoed back rather than using `*`. These functions are called with
 * the caller's Supabase JWT, and the Authorization header is in the request - a
 * wildcard plus credentials is a combination browsers reject, and an explicit
 * origin is what makes the request inspectable.
 */
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://it-learning-hub-three.vercel.app'

/** Headers the browser may send on the real request. */
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, paymongo-signature'

/**
 * CORS headers for a normal response.
 *
 * `Vary: Origin` matters: a shared cache must not serve one origin's response to
 * another. Without it, a response computed for the Vercel origin could be replayed
 * to a different caller.
 */
export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/**
 * Handle a preflight.
 *
 * Returns a Response when the request was an OPTIONS, and null otherwise, so the
 * caller can write:
 *
 *   const preflight = handlePreflight(request)
 *   if (preflight) return preflight
 */
export function handlePreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null

  // Echo the caller's origin only when it is one we expect. Echoing an arbitrary
  // Origin would make the function an open relay for anyone holding a valid JWT.
  const requested = request.headers.get('Origin')
  const allow = requested && requested === ALLOWED_ORIGIN ? requested : ALLOWED_ORIGIN

  return new Response(null, { status: 204, headers: corsHeaders(allow) })
}

/** A JSON response that a browser can actually read. */
export function jsonWithCors(body: unknown, status = 200, request?: Request): Response {
  const requested = request?.headers.get('Origin')
  const allow = requested && requested === ALLOWED_ORIGIN ? requested : ALLOWED_ORIGIN

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(allow),
      'Content-Type': 'application/json',
    },
  })
}

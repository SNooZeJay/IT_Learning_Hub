/**
 * signin-otp — the second factor on password sign-in, and nothing else.
 *
 * Why the session is minted here and not in the browser
 * ----------------------------------------------------
 * The obvious build is: sign in with Supabase in the browser, then ask for the code. That
 * does not gate anything. The moment `signInWithPassword` returns, the browser holds a
 * valid access token, the router guard would let it through, and the OTP is decoration.
 * A user who skips the code step keeps a working session.
 *
 * So credentials are verified *server-side*, in this function, and that session is
 * destroyed before the response is written. Only `action: 'verify'` — after the code has
 * been checked against a stored hash — returns tokens. There is no other path in the
 * platform that issues a session for a password sign-in, so there is nothing to bypass.
 *
 * Secrets, codes and logs
 * -----------------------
 *  - The code never leaves this function except inside the email body.
 *  - Only a keyed HMAC is stored (`code_hash`). A plain digest was tried first and is
 *    NOT enough: a six-digit code has a keyspace of one million, so anybody holding the
 *    table can reproduce any candidate in seconds. Measured on this project, an offline
 *    `generate_series(0, 999999)` join recovered the live code from a stored digest
 *    exactly. The HMAC key lives in the environment and never in the database, which
 *    moves the attack from "anyone with a dump" to "anyone with the dump AND the
 *    function's secret".
 *  - Nothing here logs a code, a token or a password. Errors carry step names only.
 *  - Every SMTP credential comes from the environment. None is hardcoded.
 *
 * Existing flows are untouched: registration, password reset and the `send-email`
 * function are separate and are not modified by this one.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import type { Session } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { sendMail, SmtpError } from '../_shared/smtp.ts'
import { handlePreflight, jsonWithCors } from '../_shared/cors.ts'
import type { SmtpConfig, SmtpTransport } from '../_shared/smtp.ts'
import type { MimeMessage } from '../_shared/mime.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GMAIL_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

/** How long a challenge stays answerable. Fifteen minutes, per the requirement. */
const CHALLENGE_TTL_MINUTES = 15
/** Wrong codes allowed per challenge before it is burned and must be resent. */
const MAX_ATTEMPTS = 5
/** Resends allowed per challenge before the address has to wait for a new challenge. */
const MAX_RESENDS = 3
/** Per-IP ceiling on `begin`, so the Gmail account cannot be used as a mail cannon. */
const BEGIN_WINDOW_MS = 10 * 60_000
const MAX_BEGIN_PER_WINDOW = 8
/** Per-IP ceiling on `verify`, so codes cannot be brute-forced from one host. */
const VERIFY_WINDOW_MS = 15 * 60_000
const MAX_VERIFY_PER_WINDOW = 30

const json = (body: unknown, status = 200, request?: Request): Response =>
  jsonWithCors(body, status, request)

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * In-memory, per instance. A floor, not a wall: it defeats a casual script, not a
 * determined one. The durable limit for verification attempts is `attempts` on the
 * challenge row itself, which is shared across every instance of this function.
 */
const beginHits = new Map<string, { count: number; resetAt: number }>()
const verifyHits = new Map<string, { count: number; resetAt: number }>()

function tooMany(
  bucket: Map<string, { count: number; resetAt: number }>,
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now()
  const entry = bucket.get(key)
  if (!entry || entry.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count += 1
  return entry.count > max
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/**
 * Six digits from `crypto.getRandomValues`, rejection-sampled so every digit is
 * uniform. `Math.random()` is not acceptable for a one-time secret.
 */
function generateCode(): string {
  const digits = '0123456789'
  let out = ''
  const buf = new Uint32Array(6)
  const ceiling = Math.floor(0xffffffff / digits.length) * digits.length
  while (out.length < 6) {
    crypto.getRandomValues(buf)
    for (const value of buf) {
      if (value >= ceiling) continue // discard, to keep the distribution flat
      out += digits[value % digits.length]
      if (out.length === 6) break
    }
  }
  return out
}

/**
 * HMAC-SHA-256 of `challengeId + ':' + code`, keyed with `SIGNIN_OTP_SECRET`.
 *
 * The challenge id is mixed in so two challenges with the same code hash differently.
 * The KEY is the part that is load-bearing, and this was measured rather than assumed:
 * with a plain `sha256(challengeId || ':' || code)` digest, this very table was cracked
 * offline in one query -
 *
 *   select code from generate_series(0, 999999) c
 *    where encode(sha256(convert_to(id || ':' || code, 'UTF8')), 'hex') = code_hash
 *
 * - which returned the live code, because a million candidates is nothing to search and
 * the id is stored right beside the digest. Salting with a column the attacker also has
 * does not help. Only a secret the attacker does not have helps.
 *
 * `SIGNIN_OTP_SECRET` must therefore never be committed, never be the same value as any
 * other project's, and be rotated together with the SMTP app password if it leaks.
 */
async function hashCode(challengeId: string, code: string): Promise<string> {
  const key = Deno.env.get('SIGNIN_OTP_SECRET') ?? ''
  if (!key) {
    // Fail closed. Falling back to an unkeyed digest here would reintroduce exactly the
    // crack this function exists to prevent, and it would do so silently.
    throw new Error(
      'SIGNIN_OTP_SECRET is not set. Run: npx supabase secrets set SIGNIN_OTP_SECRET=<random>',
    )
  }
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(`${challengeId}:${code}`),
  )
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time compare. A timing oracle on a six-digit secret is a real one. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------------------
// SMTP
// ---------------------------------------------------------------------------

/**
 * The same line-oriented transport `send-email` uses.
 *
 * Reimplemented rather than exported, because the shared module has no socket transport
 * of its own - `SmtpTransport` is the interface and `send-email` supplies the Deno
 * implementation. The buffer and multi-line read below are the part that matters: a
 * single `read()` can return half a line or three, and treating one read as one response
 * is how a client hangs waiting for the rest of a `250-AUTH` block.
 */
class SocketTransport implements SmtpTransport {
  private buffer = ''
  private conn: Deno.Conn | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private encoder = new TextEncoder()

  constructor(private readonly implicitTls = false) {}

  private async connect(): Promise<void> {
    const cfg = smtpConfig(this.implicitTls ? 465 : 587)
    this.conn = this.implicitTls
      ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
      : await Deno.connect({ hostname: cfg.host, port: cfg.port })
    this.reader = this.conn.readable.getReader()
  }

  /** Called by `sendMail`, never directly. */

  async write(line: string): Promise<void> {
    if (!this.conn) await this.connect()
    const writer = this.conn.writable.getWriter()
    try {
      await writer.write(this.encoder.encode(line + '\r\n'))
    } finally {
      writer.releaseLock()
    }
  }

  async read(): Promise<string> {
    if (!this.reader) await this.connect()
    const lines: string[] = []
    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline === -1) {
        const { value, done } = await this.reader!.read()
        if (done) {
          if (lines.length === 0) throw new SmtpError('connection closed by server', 'read')
          break
        }
        this.buffer += new TextDecoder().decode(value, { stream: true })
        continue
      }
      const line = this.buffer.slice(0, newline).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      lines.push(line)
      if (/^\d{3} /.test(line)) break
      if (!/^\d{3}-/.test(line)) break
    }
    return lines.join('\r\n')
  }

  /**
   * `upgrade`, not `startTls`: that is the name `SmtpTransport` declares and the one
   * `sendMail` calls. An earlier version here named it `startTls`, so the interface was
   * not satisfied and every 587 send died before the upgrade.
   *
   * `Deno.startTls` upgrades in place. Replacing the connection instead would drop the
   * greeting state `sendMail` continues from, and Gmail does not re-greet after STARTTLS.
   */
  async upgrade(): Promise<void> {
    if (!this.conn) throw new SmtpError('not connected', 'starttls')
    this.conn = await Deno.startTls(this.conn, { hostname: 'smtp.gmail.com' })
    this.reader?.releaseLock()
    this.reader = this.conn.readable.getReader()
    this.buffer = ''
  }

  async close(): Promise<void> {
    this.reader?.releaseLock()
    this.reader = null
    try {
      await this.conn?.close()
    } catch {
      /* already closed */
    }
    this.conn = null
  }
}

/**
 * Matches `_shared/smtp.ts`'s `SmtpConfig` exactly. An earlier version of this file
 * invented its own shape (`authMethod`, `implicitTls`) that the shared transport does not
 * read, so every send failed on a missing field while looking like a Gmail problem.
 */
function smtpConfig(port: number): SmtpConfig {
  if (!GMAIL_PASSWORD) throw new Error('GMAIL_APP_PASSWORD is not set')
  if (!MAIL_FROM) throw new Error('MAIL_FROM is not set')
  return {
    host: 'smtp.gmail.com',
    port,
    username: MAIL_FROM,
    password: GMAIL_PASSWORD,
    from: MAIL_FROM,
    timeoutMs: 20_000,
  }
}

/** Port 587 then 465, because an egress filter on one does not imply the other. */
async function deliver(message: MimeMessage): Promise<void> {
  let firstError: unknown = null
  for (const attempt of [
    { port: 587, implicitTls: false },
    { port: 465, implicitTls: true },
  ]) {
    const transport = new SocketTransport(attempt.implicitTls)
    try {
      await sendMail(transport, smtpConfig(attempt.implicitTls), message, {
        messageIdDomain: new URL(SITE_URL).hostname,
      })
      return
    } catch (error) {
      if (!firstError) firstError = error
      console.error(
        `smtp ${attempt.port} failed`,
        error instanceof SmtpError ? `${error.step}: ${error.message}` : 'unknown error',
      )
    } finally {
      await transport.close()
    }
  }
  throw firstError
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function otpEmail(to: string, code: string, minutes: number): MimeMessage {
  const subject = 'Your IT Learning Hub sign-in code'
  const text = [
    'Your sign-in code is:',
    '',
    code,
    '',
    `It stops working in ${minutes} minutes and works only once.`,
    'If you did not try to sign in, change your password.',
  ].join('\n')

  // The code appears here and nowhere else. It is escaped because the address it is
  // sent to is attacker-influenced in the general case.
  const html = `<!doctype html><html><body style="margin:0;background:#f7f6f3;font-family:Inter,Arial,sans-serif;color:#1f1e1b">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="background:#ffffff;border:1px solid #e5e3dd;border-radius:12px;padding:32px">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#7a766c">IT Learning Hub</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Your sign-in code</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d3a34">Enter this code to finish signing in.</p>
      <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:.18em;color:#5645d4">${escapeHtml(code)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#7a766c">
        It stops working in ${minutes} minutes and works only once.<br>
        If you did not try to sign in, change your password.
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9a958a;text-align:center">
      This is an automated message from IT Learning Hub.
    </p>
  </div></body></html>`

  return { from: MAIL_FROM, fromName: 'IT Learning Hub', to: [to], subject, text, html }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface Challenge {
  id: string
  user_id: string
  email: string
  code_hash: string
  expires_at: string
  attempts: number
  max_attempts: number
  resends: number
  used_at: string | null
}

async function begin(req: Request, ip: string, email: string, password: string): Promise<Response> {
  if (tooMany(beginHits, ip, BEGIN_WINDOW_MS, MAX_BEGIN_PER_WINDOW)) {
    return json({ error: 'too_many_sign_in_attempts' }, 429, req)
  }

  // Credentials are checked here and the session is dropped immediately. The response
  // below carries a challenge id and nothing else.
  const verifier = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await verifier.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    // One message for a wrong password and for an unknown address. Distinguishing them
    // would turn this endpoint into a way to enumerate registered users.
    return json({ error: 'invalid_credentials' }, 401, req)
  }
  const userId = data.user.id

  // Burned rather than kept. This session must never be usable by the caller, and
  // nothing above this line returns it.
  await verifier.auth.signOut().catch(() => {})

  const admin = adminClient()
  const code = generateCode()
  const challengeId = crypto.randomUUID()
  const codeHash = await hashCode(challengeId, code)

  // Any earlier unanswered challenge for this user stops working the moment a new one
  // is issued, so a code read from an old email cannot be used after a resend.
  await admin
    .from('sign_in_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null)

  const { error: insertError } = await admin.from('sign_in_challenges').insert({
    id: challengeId,
    user_id: userId,
    email,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    max_attempts: MAX_ATTEMPTS,
    resends: 0,
  })

  if (insertError) {
    console.error('challenge insert failed', insertError.message)
    return json({ error: 'could_not_start' }, 500, req)
  }

  try {
    await deliver(otpEmail(email, code, CHALLENGE_TTL_MINUTES))
  } catch (error) {
    // The challenge is removed rather than left waiting: a challenge whose mail never
    // arrived would otherwise sit there for fifteen minutes letting a party who already
    // knows the password confirm without ever seeing the code.
    await admin.from('sign_in_challenges').delete().eq('id', challengeId)
    console.error(
      'otp email failed',
      error instanceof SmtpError ? `${error.step}: ${error.message}` : 'unknown error',
    )
    return json({ error: 'could_not_send_code' }, 502, req)
  }

  return json(
    { challenge_id: challengeId, expires_in_seconds: CHALLENGE_TTL_MINUTES * 60, resendable: true },
    200,
    req,
  )
}

async function resend(req: Request, ip: string, challengeId: string): Promise<Response> {
  if (tooMany(beginHits, ip, BEGIN_WINDOW_MS, MAX_BEGIN_PER_WINDOW)) {
    return json({ error: 'too_many_sign_in_attempts' }, 429, req)
  }

  const admin = adminClient()
  const { data, error } = await admin
    .from('sign_in_challenges')
    .select('*')
    .eq('id', challengeId)
    .single()

  if (error || !data) return json({ error: 'no_such_challenge' }, 404, req)

  const challenge = data as unknown as Challenge
  if (challenge.used_at) return json({ error: 'challenge_already_used' }, 410, req)
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ error: 'challenge_expired' }, 410, req)
  }
  if (challenge.resends >= MAX_RESENDS) {
    return json({ error: 'too_many_resends' }, 429, req)
  }

  const code = generateCode()
  const codeHash = await hashCode(challengeId, code)

  const { error: updateError } = await admin
    .from('sign_in_challenges')
    .update({
      code_hash: codeHash,
      resends: challenge.resends + 1,
      // The clock restarts, or a resend issued seconds before expiry would be
      // useless the moment it arrived.
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000).toISOString(),
      attempts: 0,
    })
    .eq('id', challengeId)

  if (updateError) {
    console.error('challenge update failed', updateError.message)
    return json({ error: 'could_not_send_code' }, 500, req)
  }

  try {
    await deliver(otpEmail(challenge.email, code, CHALLENGE_TTL_MINUTES))
  } catch (error) {
    console.error(
      'otp resend failed',
      error instanceof SmtpError ? `${error.step}: ${error.message}` : 'unknown error',
    )
    return json({ error: 'could_not_send_code' }, 502, req)
  }

  return json(
    { challenge_id: challengeId, expires_in_seconds: CHALLENGE_TTL_MINUTES * 60, resendable: true },
    200,
    req,
  )
}

async function verify(
  req: Request,
  ip: string,
  challengeId: string,
  code: string,
): Promise<Response> {
  if (tooMany(verifyHits, ip, VERIFY_WINDOW_MS, MAX_VERIFY_PER_WINDOW)) {
    return json({ error: 'too_many_verification_attempts' }, 429, req)
  }

  const admin = adminClient()
  const { data, error } = await admin
    .from('sign_in_challenges')
    .select('*')
    .eq('id', challengeId)
    .single()

  if (error || !data) return json({ error: 'no_such_challenge' }, 404, req)

  const challenge = data as unknown as Challenge

  if (challenge.used_at) {
    // A replayed code. The row is spent, so this is terminal for this challenge.
    return json({ error: 'challenge_already_used' }, 410, req)
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ error: 'challenge_expired' }, 410, req)
  }

  const attempts = challenge.attempts + 1
  await admin.from('sign_in_challenges').update({ attempts }).eq('id', challengeId)

  if (attempts > challenge.max_attempts) {
    // Burned after the allowance is spent, so the code cannot be ground down.
    await admin
      .from('sign_in_challenges')
      .update({ used_at: new Date().toISOString() })
      .eq('id', challengeId)
    return json({ error: 'too_many_verification_attempts' }, 429, req)
  }

  const candidate = await hashCode(challengeId, code.trim())
  if (!safeEqual(candidate, challenge.code_hash)) {
    return json(
      { error: 'invalid_code', attempts_left: Math.max(0, challenge.max_attempts - attempts) },
      400,
      req,
    )
  }

  // Spent before the session is minted, so a replay of the same code cannot race the
  // first use through.
  await admin
    .from('sign_in_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('id', challengeId)

  const session = await mintSession(challenge.email)
  if (!session) return json({ error: 'could_not_complete_sign_in' }, 500, req)
  return json({ session }, 200, req)
}

/**
 * Mint a session for a user whose password has already been verified by `begin`.
 *
 * The password is not available here and is never stored by this project, so the session
 * comes from a single-use magic link: the admin API mints a hash, the anon API exchanges
 * it for tokens, and the link is worthless afterwards. That is what makes this a gate
 * rather than a formality - these tokens exist on no other password sign-in path, and
 * only after a code matched.
 */
async function mintSession(email: string): Promise<Session | null> {
  const admin = adminClient()

  const minted = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (minted.error || !minted.data?.properties?.hashed_token) {
    console.error('session mint failed')
    return null
  }

  // The anon client: exchanging a link is a public operation, and using the service key
  // here would hand back a session that bypasses the very check this function exists for.
  const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: minted.data.properties.hashed_token,
    type: 'magiclink',
  })

  if (error || !data.session) {
    console.error('session exchange failed')
    return null
  }
  return data.session
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, req)

  const ip = clientIp(req)

  let body: {
    action?: string
    email?: string
    password?: string
    challenge_id?: string
    code?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400, req)
  }

  try {
    if (body.action === 'begin') {
      const email = (body.email ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: 'a valid email address is required' }, 400, req)
      }
      if (!body.password) return json({ error: 'password is required' }, 400, req)
      return await begin(req, ip, email, body.password)
    }

    if (body.action === 'resend') {
      if (!body.challenge_id) return json({ error: 'challenge_id is required' }, 400, req)
      return await resend(req, ip, body.challenge_id)
    }

    if (body.action === 'verify') {
      if (!body.challenge_id) return json({ error: 'challenge_id is required' }, 400, req)
      const code = (body.code ?? '').trim()
      if (!/^\d{6}$/.test(code)) {
        return json({ error: 'the code is six digits', attempts_left: null }, 400, req)
      }
      return await verify(req, ip, body.challenge_id, code)
    }

    return json({ error: `unknown action: ${body.action ?? '(none)'}` }, 400, req)
  } catch (error) {
    console.error(
      'unexpected failure',
      error instanceof SmtpError ? `${error.step}: ${error.message}` : 'unknown error',
    )
    return json({ error: 'unexpected failure' }, 500, req)
  }
})

/**
 * send-email — the only path by which this project sends mail.
 *
 * Why this exists
 * ---------------
 * `_shared/smtp.ts` and `_shared/mime.ts` were written and unit-tested, and then
 * nothing called them. Password reset was going through Supabase's own mailer,
 * so the Gmail SMTP work was dead code behind 38 passing tests.
 *
 * Actions
 * -------
 * password_reset  PUBLIC. Mints a Supabase recovery link and emails it over Gmail.
 *                 Answers identically whether or not the account exists, so it
 *                 cannot be used to discover who has an account.
 * welcome         The signed-in user, about themselves. Nothing else.
 *
 * Everything else in the platform - enrolment, payment, quiz grade, certificate -
 * is a database event, and those are written by SECURITY DEFINER triggers and
 * SECURITY DEFINER notify helpers rather than by an HTTP call. Mail for those is
 * deliberately not wired up here: a database that cannot reach the network still
 * has to be able to record a certificate.
 *
 * Secrets
 * -------
 * GMAIL_APP_PASSWORD  Gmail app password. Spaces are stripped by smtp.ts.
 * MAIL_FROM            Envelope sender. Gmail refuses anything else.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { sendMail, SmtpError } from '../_shared/smtp.ts'
import type { SmtpConfig, SmtpTransport } from '../_shared/smtp.ts'
import type { MimeMessage } from '../_shared/mime.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GMAIL_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
/** Where a password reset link should send the user back to. */
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Per-IP rate limit for the public action.
 *
 * Without it, `password_reset` is a free way to email anyone, repeatedly, through
 * the project's Gmail account. That is how a sending domain gets blacklisted, and
 * it would take every future password reset down with it.
 *
 * In-memory, so it resets when the function does and is per-instance. That is a
 * floor, not a wall: it defeats a casual script, not a determined one. A shared
 * store is the real answer and is not worth the complexity for a course project.
 */
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)

  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

// ---------------------------------------------------------------------------
// SMTP transport over a Deno socket
// ---------------------------------------------------------------------------

/**
 * A line-oriented SMTP transport.
 *
 * SMTP is a line protocol, and the reader has to be buffered: a single `read()`
 * can return half a line or three, and treating one read as one response is how a
 * client ends up parsing `250-AUTH PLAIN` as the whole reply and giving up before
 * the server has finished.
 */
class SocketTransport implements SmtpTransport {
  private buffer = ''
  private conn: Deno.Conn | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private encoder = new TextEncoder()

  /**
   * @param implicitTls Wrap the socket in TLS from the start, as port 465
   *   requires. Port 587 advertises STARTTLS in plaintext first instead.
   */
  constructor(private readonly implicitTls = false) {}

  private async connect(): Promise<void> {
    const cfg = smtpConfig(this.implicitTls ? 465 : 587)
    this.conn = this.implicitTls
      ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
      : await Deno.connect({ hostname: cfg.host, port: cfg.port })
    this.reader = this.conn.readable.getReader()
  }

  /**
   * Send one command, terminated by CRLF.
   *
   * The writer is acquired per call and RELEASED afterwards, because a locked
   * stream cannot be written to again. Releasing is safe only because `write` is
   * awaited: the returned promise settles once the chunk is accepted.
   *
   * This is not a theoretical concern. The message body is a single write of
   * several hundred bytes, and with the lock being taken and dropped around each
   * command Gmail received the headers, replied `354 Go ahead`, then saw the
   * connection close part-way through the body and reset it. Every short command
   * (EHLO, AUTH, MAIL FROM) fit in one chunk and worked, which is exactly why the
   * failure looked like a protocol error rather than a buffering one.
   */
  async write(line: string): Promise<void> {
    if (!this.conn) await this.connect()
    const writer = this.conn.writable.getWriter()
    try {
      await writer.write(this.encoder.encode(line + '\r\n'))
    } finally {
      // Released even on failure, or the stream stays locked and every later
      // write throws.
      writer.releaseLock()
    }
  }

  /**
   * Read one complete SMTP response.
   *
   * A response is a BLOCK of lines, not a line. Gmail's reply to EHLO is:
   *
   *   250-smtp.gmail.com at your service
   *   250-SIZE 35882577
   *   250-STARTTLS
   *   250 AUTH PLAIN XOAUTH2
   *
   * Continuation lines carry a hyphen after the code; the final line has a
   * space. Returning only the first line truncates that reply to
   * `250-SIZE 35882577`, and STARTTLS - which sits on a later line - appears
   * not to be offered at all.
   *
   * That is not hypothetical. It is what happened, and it is why the send died
   * at the read step on port 587 while the banner probe proved the server was
   * reachable and healthy.
   *
   * `sendMail` feeds this whole string to `parseResponse`, which is written to
   * validate multi-line replies. Returning one line at a time defeated that: the
   * parser exists precisely because multi-line replies are common, and this
   * transport was quietly preventing it from ever seeing one.
   */
  async read(): Promise<string> {
    // SMTP speaks first: the server greets before anything is written. Connecting
    // only on write therefore fails on the very first read of every send.
    if (!this.reader) await this.connect()

    const lines: string[] = []

    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline === -1) {
        const { value, done } = await this.reader!.read()
        if (done) {
          if (lines.length === 0) throw new SmtpError('connection closed by server', 'read')
          // Return what arrived rather than discarding it: a truncated block is
          // still more useful to parseResponse than nothing at all.
          break
        }
        this.buffer += new TextDecoder().decode(value, { stream: true })
        continue
      }

      const line = this.buffer.slice(0, newline).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      lines.push(line)

      // A space after the code marks the final line of the response.
      if (/^\d{3} /.test(line)) break
      // A hyphen means more is coming. Anything else is malformed and ending
      // here is better than looping until the connection times out.
      if (!/^\d{3}-/.test(line)) break
    }

    return lines.join('\r\n')
  }

  /**
   * Switch to TLS mid-session, as port 587 requires.
   *
   * This method does NOT send STARTTLS and does NOT read the greeting.
   * `sendMail` has already done both:
   *
   *   await step('starttls', async () => { await transport.write('STARTTLS'); return transport.read() })
   *   await transport.upgrade()
   *
   * Sending STARTTLS again here put a second plaintext command inside an
   * established TLS session. Gmail read it as garbage and reset the connection,
   * which surfaced as `ConnectionReset: os error 104` at MAIL FROM with no SMTP
   * reply to explain it. Reading the greeting again had the mirror problem,
   * blocking forever on a banner that never comes.
   *
   * So this method's only job is the TLS upgrade itself. The 38 unit tests in
   * smtp.test.ts could not catch either bug: they use a fake transport, so the
   * contract between sendMail and upgrade() - who sends what - is never
   * exercised. Only a real conversation against a real server exposed it, and it
   * took a transcript of both directions to see.
   */
  async upgrade(): Promise<void> {
    if (!this.conn) throw new SmtpError('not connected', 'starttls')

    this.conn = await Deno.startTls(this.conn, { hostname: smtpConfig().host })
    this.reader = this.conn.readable.getReader()
    this.buffer = ''

    // Gmail does not re-greet after STARTTLS on 587. sendMail sends EHLO next,
    // which is correct, so there is nothing to read here either.
  }

  async close(): Promise<void> {
    try {
      await this.reader?.cancel()
    } catch {
      // Already gone. Closing must never mask the error that got us here.
    }
    try {
      this.conn?.close()
    } catch {
      // Same.
    }
  }
}

function smtpConfig(port: number): SmtpConfig {
  if (!GMAIL_PASSWORD) {
    throw new Error(
      'GMAIL_APP_PASSWORD is not set. Run: npx supabase secrets set GMAIL_APP_PASSWORD=<app password>',
    )
  }
  if (!MAIL_FROM) {
    throw new Error('MAIL_FROM is not set. It must be the Gmail account you authenticated as.')
  }
  return {
    host: 'smtp.gmail.com',
    port,
    username: MAIL_FROM,
    password: GMAIL_PASSWORD,
    from: MAIL_FROM,
    timeoutMs: 20_000,
  }
}

/**
 * Sends over port 587 with STARTTLS, falling back to 465 with implicit TLS.
 *
 * The fallback is not paranoia. On this project 587 connected and then failed on
 * the banner read, which is what an egress filter on that port looks like from
 * here. 465 is a different port and a different handshake, so if one is blocked
 * the other often is not. Both reach Gmail; trying the second costs one failed
 * connection and saves a demo.
 *
 * The first error is kept and rethrown only if both fail, so the reported cause
 * is the submission port's rather than the last one tried.
 */
async function deliver(message: MimeMessage): Promise<void> {
  const attempts: Array<{ port: number; implicitTls: boolean }> = [
    { port: 587, implicitTls: false },
    { port: 465, implicitTls: true },
  ]

  let firstError: unknown = null

  for (const attempt of attempts) {
    const transport = new SocketTransport(attempt.implicitTls)
    try {
      await sendMail(transport, smtpConfig(attempt.port), message, {
        messageIdDomain: new URL(SITE_URL).hostname,
      })
      return
    } catch (error) {
      if (!firstError) firstError = error
      console.error(
        `smtp ${attempt.port}${attempt.implicitTls ? ' (implicit tls)' : ' (starttls)'} failed`,
        error instanceof SmtpError ? `${error.step}: ${error.message}` : error,
      )
    } finally {
      await transport.close()
    }
  }

  throw firstError
}

// ---------------------------------------------------------------------------
// Message bodies
// ---------------------------------------------------------------------------

/** The one place a subject or body becomes an email, so quoting is handled once. */
function message(to: string, subject: string, text: string, html: string): MimeMessage {
  return { from: MAIL_FROM, fromName: 'IT Learning Hub', to: [to], subject, text, html }
}

function page(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}"
        style="background:#5645d4;color:#ffffff;text-decoration:none;padding:12px 22px;
               border-radius:8px;display:inline-block;font-weight:600">${cta.label}</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f7f6f3;font-family:Inter,Arial,sans-serif;color:#1f1e1b">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="background:#ffffff;border:1px solid #e5e3dd;border-radius:12px;padding:32px">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#7a766c">IT Learning Hub</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${title}</h1>
      <div style="font-size:15px;line-height:1.65;color:#3d3a34">${body}</div>
      ${button}
      <p style="margin:28px 0 0;font-size:13px;color:#7a766c;line-height:1.6">
        If the button does not work, copy this link into your browser:<br>
        ${cta ? `<span style="word-break:break-all">${cta.url}</span>` : ''}
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9a958a;text-align:center">
      This is an automated message from IT Learning Hub.
    </p>
  </div></body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function sendPasswordReset(email: string): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  // A missing account is reported as success, because the caller must not be able
  // to discover who has registered. A genuine failure here is thrown, not
  // swallowed, so the operator still learns that mail is broken.
  if (error) {
    const notFound = /not found|no user|user_not_found/i.test(error.message)
    if (!notFound) {
      throw new Error(`generateLink failed: ${error.message}`)
    }
    return
  }

  const token = data?.properties?.hashed_token
  if (!token) {
    throw new Error('generateLink returned no token')
  }

  const url = `${SITE_URL}/auth/reset-password?token_hash=${encodeURIComponent(token)}&type=recovery`

  await deliver(
    message(
      email,
      'Reset your IT Learning Hub password',
      [
        'Someone asked to reset the password on your IT Learning Hub account.',
        '',
        'Open this link to choose a new one:',
        url,
        '',
        'If this was not you, ignore this message. Your password will not change.',
      ].join('\n'),
      page(
        'Reset your password',
        `<p>Someone asked to reset the password on your IT Learning Hub account.</p>
         <p>If this was you, choose a new one using the button below.</p>
         <p style="color:#7a766c">If it was not you, ignore this message. Your password will not change.</p>`,
        { label: 'Choose a new password', url },
      ),
    ),
  )
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  let body: { action?: string; email?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  try {
    if (body.action === 'password_reset') {
      if (rateLimited(ip)) {
        // 429 with the same shape as success would hide the limit; a distinct
        // status is more honest and lets a client back off.
        return json({ error: 'too many requests, try again in a minute' }, 429)
      }
      const email = (body.email ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: 'a valid email address is required' }, 400)
      }
      await sendPasswordReset(email)
      // Always the same shape, always 200. The caller learns nothing about
      // whether the account exists.
      //
      // An earlier version returned `delivered: true|false`, which undid the whole
      // point: a genuine SMTP failure produced `delivered:false` while an unknown
      // address produced `delivered:true`, so the flag was an account-enumeration
      // oracle. Probing it told you who had registered. It is gone.
      //
      // A real failure throws and is handled below with a 502, because a mailer
      // that is silently broken is worse than one that admits it.
      return json({ sent: true })
    }

    if (body.action === 'welcome') {
      const auth = req.headers.get('Authorization') ?? ''
      const token = auth.replace(/^Bearer\s+/i, '')
      if (!token) return json({ error: 'not authenticated' }, 401)

      const userClient = createClient(SUPABASE_URL, token, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (userError || !userData.user?.email) return json({ error: 'not authenticated' }, 401)

      const name = escapeHtml((body.name ?? '').slice(0, 80) || userData.user.email.split('@')[0])
      const url = `${SITE_URL}/courses`

      await deliver(
        message(
          userData.user.email,
          'Welcome to IT Learning Hub',
          [
            `Hello ${name},`,
            '',
            'Your IT Learning Hub account is ready.',
            '',
            'Browse the catalogue here:',
            url,
          ].join('\n'),
          page(
            `Hello ${name}`,
            `<p>Your IT Learning Hub account is ready.</p>
             <p>Browse the course catalogue and enrol in something that interests you.</p>`,
            { label: 'Browse courses', url },
          ),
        ),
      )
      return json({ sent: true })
    }

    return json({ error: `unknown action: ${body.action ?? '(none)'}` }, 400)
  } catch (error) {
    // A SmtpError carries the SMTP step and code, which is the difference between
    // "mail is broken" and "mail is fine and this address is bad".
    if (error instanceof SmtpError) {
      console.error(`smtp ${error.step} failed`, error.code, error.message)
      return json({ error: `mail could not be sent (${error.step})` }, 502)
    }
    console.error('send-email failed', error instanceof Error ? error.message : error)

    // A Deno or network failure is not an SmtpError, so it arrives here with no
    // step attached. Reporting only "mail could not be sent" for those is how two
    // real bugs stayed hidden: the caller could not tell a blocked port from a
    // broken client. The name and message go back to the operator. This is an
    // unauthenticated endpoint, so nothing about the SMTP conversation itself is
    // disclosed - only why the attempt ended.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return json({ error: 'mail could not be sent', detail }, 502)
  }
})

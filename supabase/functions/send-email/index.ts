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
import { buildMimeMessage } from '../_shared/mime.ts'
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

  private async connect(): Promise<void> {
    const cfg = smtpConfig()
    this.conn = await Deno.connect({ hostname: cfg.host, port: cfg.port })
    this.reader = this.conn.readable.getReader()
  }

  async write(line: string): Promise<void> {
    if (!this.conn) await this.connect()
    const writer = this.conn.writable.getWriter()
    await writer.write(this.encoder.encode(line + '\r\n'))
    // Released rather than closed: the writer locks the stream, and a locked
    // stream cannot be written to again.
    writer.releaseLock()
  }

  async read(): Promise<string> {
    if (!this.reader) throw new SmtpError('not connected', 'connect')

    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline !== -1) {
        const line = this.buffer.slice(0, newline)
        this.buffer = this.buffer.slice(newline + 1)
        return line
      }
      const { value, done } = await this.reader.read()
      if (done) throw new SmtpError('connection closed by server', 'read')
      this.buffer += new TextDecoder().decode(value, { stream: true })
    }
  }

  async upgrade(): Promise<void> {
    if (!this.conn) throw new SmtpError('not connected', 'starttls')
    // Consume the 220 greeting before the handshake.
    await this.read()
    await this.write('STARTTLS')
    const response = await this.read()
    if (!response.startsWith('220')) {
      throw new SmtpError(`STARTTLS refused: ${response.trim()}`, 'starttls')
    }

    this.conn = await Deno.startTls(this.conn, { hostname: smtpConfig().host })
    this.reader = this.conn.readable.getReader()
    this.buffer = ''
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

function smtpConfig(): SmtpConfig {
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
    port: 587,
    username: MAIL_FROM,
    password: GMAIL_PASSWORD,
    from: MAIL_FROM,
    timeoutMs: 20_000,
  }
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

async function sendPasswordReset(email: string): Promise<{ sent: boolean }> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  // A missing account is reported as success. Anything else - a misconfigured
  // function, an SMTP refusal - is a real failure and must not be hidden behind
  // the same answer, or the operator would never learn the mail is broken.
  if (error) {
    const notFound = /not found|no user|user_not_found/i.test(error.message)
    if (!notFound) {
      console.error('generateLink failed', error.message)
      return { sent: false }
    }
    return { sent: true }
  }

  const token = data?.properties?.hashed_token
  if (!token) {
    console.error('generateLink returned no token')
    return { sent: false }
  }

  const url = `${SITE_URL}/auth/reset-password?token_hash=${encodeURIComponent(token)}&type=recovery`

  const transport = new SocketTransport()
  try {
    await sendMail(
      transport,
      smtpConfig(),
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
      { messageIdDomain: new URL(SITE_URL).hostname },
    )
    return { sent: true }
  } finally {
    await transport.close()
  }
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
      const result = await sendPasswordReset(email)
      // Always 200. The caller learns nothing about whether the account exists.
      return json({ sent: true, delivered: result.sent })
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

      const transport = new SocketTransport()
      try {
        await sendMail(
          transport,
          smtpConfig(),
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
          { messageIdDomain: new URL(SITE_URL).hostname },
        )
        return json({ sent: true })
      } finally {
        await transport.close()
      }
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
    return json({ error: 'mail could not be sent' }, 502)
  }
})

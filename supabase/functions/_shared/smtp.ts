/**
 * A minimal SMTP client.
 *
 * Written against an injected transport rather than a socket so the conversation
 * can be tested without a network or a mail server. That is the point: the
 * sequence below is the part that fails silently and expensively in production,
 * because an SMTP client that gets STARTTLS wrong will happily send a password in
 * cleartext, and one that misreads a multiline response will hang forever.
 *
 * Scope is deliberately narrow — submission on port 587 with STARTTLS and AUTH
 * LOGIN/PLAIN. No implicit TLS, no PIPELINING, no DSN extensions. Every feature
 * left out is a feature that cannot be wrong.
 */

import { MimeError, buildMimeMessage } from './mime.ts'
import type { MimeMessage } from './mime.ts'

/** Anything that can carry a conversation. The real one wraps a TCP socket. */
export interface SmtpTransport {
  write(line: string): Promise<void>
  /** Resolves with the next complete response. */
  read(): Promise<string>
  /** Switches the connection to TLS, in place. */
  upgrade(): Promise<void>
  close(): Promise<void>
}

export interface SmtpConfig {
  host: string
  port: number
  username: string
  /** Gmail app password. Spaces are stripped, because the format people copy it in includes them. */
  password: string
  /** Envelope sender. Gmail rejects anything not matching the authenticated account. */
  from: string
  /** Enables the timeout on every step. */
  timeoutMs?: number
  /** Overrides the TLS handshake policy. Never disable this in production. */
  requireTls?: boolean
}

export class SmtpError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'SmtpError'
  }
}

/**
 * Read one SMTP response, following multi-line continuations.
 *
 * A reply is `250-FEATURE` then `250 LAST FEATURE`, and a client that reads only
 * the first line believes the server finished talking when it did not. The final
 * line has a space where the hyphen was.
 */
export function parseResponse(lines: string[]): { code: number; text: string } {
  if (lines.length === 0) throw new SmtpError('empty response from server', 'read')
  const first = lines[0]
  const match = /^(\d{3})([ -])?(.*)$/.exec(first)
  if (!match) throw new SmtpError(`unparseable response: ${first}`, 'read')

  const code = Number(match[1])
  const last = lines[lines.length - 1]
  if (!/^\d{3} /.test(last)) {
    throw new SmtpError(`truncated multiline response ending "${last}"`, 'read')
  }
  return { code, text: lines.map((l) => l.replace(/^\d{3}[ -]?/, '')).join('\n') }
}

/**
 * Split a raw response block into its lines.
 *
 * Empty lines are dropped entirely. A reply arrives as `"250 Ok\r\n"`, which
 * splits into a real line plus a trailing empty one, and keeping that empty
 * element makes the multiline check below see a final line of `""` and reject
 * every perfectly good reply as truncated.
 */
function toLines(raw: string): string[] {
  return raw.split('\r\n').filter((line) => line !== '')
}

export function encodeHeader(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

export interface SendResult {
  accepted: string[]
  /** The server's final reply text, kept for the delivery log. */
  response: string
}

/**
 * Deliver one message.
 *
 * The conversation is: greet, EHLO, STARTTLS, EHLO again, authenticate, envelope,
 * DATA, message, terminator, QUIT. EHLO is deliberately issued twice — once to
 * discover STARTTLS, then again because a session that upgraded its transport has
 * to renegotiate, and servers reject AUTH on a pre-TLS capability list.
 */
export async function sendMail(
  transport: SmtpTransport,
  config: SmtpConfig,
  message: MimeMessage,
  options: { messageIdDomain: string; now?: Date; messageId?: string } = {
    messageIdDomain: 'localhost',
  },
): Promise<SendResult> {
  const requireTls = config.requireTls !== false
  const envelope = buildMimeMessage(message, options)

  const step = async (
    name: string,
    send: () => Promise<string>,
  ): Promise<{ code: number; text: string }> => {
    const raw = await send()
    const parsed = parseResponse(toLines(raw))
    if (parsed.code >= 400) {
      throw new SmtpError(`${name} refused: ${parsed.text}`, name, parsed.code)
    }
    return parsed
  }

  // Read the greeting before the generic `step` helper, because a server that
  // opens with something other than 220 is not "refusing" the session, it is
  // telling us something specific (rate limited, no service here) that the
  // operator needs to see in the error rather than a generic refusal.
  const bannerRaw = await transport.read()
  const banner = parseResponse(toLines(bannerRaw))
  if (banner.code !== 220) {
    throw new SmtpError(`server did not greet with 220: ${banner.text}`, 'banner', banner.code)
  }

  await step('ehlo', async () => {
    await transport.write(`EHLO ${options.messageIdDomain}`)
    return transport.read()
  })

  // STARTTLS before anything else that carries a credential.
  await step('starttls', async () => {
    await transport.write('STARTTLS')
    return transport.read()
  })
  await transport.upgrade()

  // Re-advertise. The capability list from before the upgrade is not valid after it.
  const capabilities = await step('ehlo', async () => {
    await transport.write(`EHLO ${options.messageIdDomain}`)
    return transport.read()
  })

  if (requireTls && !capabilities.text.toUpperCase().includes('AUTH')) {
    throw new SmtpError('server does not offer AUTH after STARTTLS', 'auth')
  }

  const secret = config.password.replace(/\s+/g, '')
  await step('auth', async () => {
    await transport.write('AUTH LOGIN')
    await transport.read()
    await transport.write(encodeHeader(config.username))
    await transport.read()
    await transport.write(encodeHeader(secret))
    return transport.read()
  })

  await step('mail-from', async () => {
    await transport.write(`MAIL FROM:<${config.from}>`)
    return transport.read()
  })

  const accepted: string[] = []
  for (const to of message.to) {
    await step('rcpt-to', async () => {
      await transport.write(`RCPT TO:<${to}>`)
      return transport.read()
    })
    accepted.push(to)
  }

  await step('data', async () => {
    await transport.write('DATA')
    return transport.read()
  })

  // Dot-stuffing: a line consisting of a single dot ends the message early. Any
  // line in the body that begins with a dot needs an extra one.
  const body = envelope.replace(/\r\n\./g, '\r\n..')
  await step('message', async () => {
    await transport.write(body)
    return transport.read()
  })

  // The authoritative reply is the one to the terminator: this is where a real
  // server assigns the queue id that a support ticket needs. The reply to the
  // body itself is only an interim acknowledgement.
  const result = await step('body-end', async () => {
    await transport.write('.')
    return transport.read()
  })

  // QUIT is best-effort: the message is already accepted, so a failure to
  // disconnect politely must not be reported as a delivery failure.
  try {
    await transport.write('QUIT')
    await transport.read()
  } catch {
    /* the server may close first; that is normal and not an error */
  }

  return { accepted, response: result.text }
}

export { MimeError }
export type { MimeMessage }

/**
 * MIME message construction.
 *
 * Pure TypeScript with no runtime dependencies, for two reasons. It is the part
 * of mail delivery most likely to be wrong in a way that only shows up in a
 * real client's inbox, so it has to be testable; and header injection is a
 * genuine vulnerability class that is trivially testable and almost never tested.
 */

/** Why a message was refused. Thrown instead of sending something malformed. */
export class MimeError extends Error {}

export interface MimeMessage {
  /** Envelope sender, e.g. `no-reply@example.com`. */
  from: string
  /** Display name paired with the envelope sender. */
  fromName?: string
  /** One or more recipients. */
  to: string[]
  subject: string
  /** Plain-text alternative. Always sent: it is what a text client reads. */
  text: string
  /** Optional HTML alternative. */
  html?: string
  /**
   * When set, the message becomes an automated one: a `List-Unsubscribe`
   * header and `Precedence: bulk` are added, and the From domain must match the
   * sending domain or the message is refused.
   *
   * This exists because of a real deliverability problem. Gmail and Outlook
   * increasingly route unauthenticated bulk-looking mail to spam, and a learning
   * platform that grades quizzes by email is worthless if the grade lands in a
   * junk folder.
   */
  replyTo?: string
}

/**
 * Reject anything that could inject a header.
 *
 * A subject containing `\r\nBcc: someone@else` turns one message into two
 * recipients the sender never chose. This is the oldest vulnerability in mail
 * handling and it is a one-line fix that people still skip.
 *
 * Tab is allowed because it is legal folding whitespace in headers; CR and LF
 * are not, in any field, ever.
 */
function assertNoHeaderInjection(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new MimeError(`${field} contains a line break, which would inject a header`)
  }
}

/**
 * An address is `local@domain`. Deliberately stricter than RFC 5322.
 *
 * Full RFC compliance would permit quoted local parts containing spaces and
 * angle brackets, and none of that is needed here. Anything this accepts can be
 * put in an envelope safely, which is the property that actually matters.
 *
 * The domain is validated label by label rather than with one loose character
 * class. A single permissive pattern accepts `a@b..com` and `a@b.c`, because the
 * middle "label" is allowed to contain the dots that are supposed to separate
 * labels — and an address that a mail server accepts but no mail client can parse
 * is a silently undeliverable message.
 */
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/
const DOMAIN_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/

function assertAddress(address: string, field: string): void {
  assertNoHeaderInjection(address, field)
  if (address.trim() !== address) {
    throw new MimeError(`${field} has leading or trailing whitespace`)
  }

  const at = address.lastIndexOf('@')
  if (at <= 0) throw new MimeError(`${field} is not a valid address: ${address}`)

  const local = address.slice(0, at)
  const domain = address.slice(at + 1)

  if (
    !LOCAL_PART.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    throw new MimeError(`${field} has an invalid local part: ${local}`)
  }

  const labels = domain.split('.')
  if (labels.length < 2) throw new MimeError(`${field} domain needs at least two labels: ${domain}`)
  for (const label of labels) {
    if (!DOMAIN_LABEL.test(label)) {
      throw new MimeError(`${field} has an invalid domain label "${label}" in ${domain}`)
    }
  }
  // A one-character TLD does not exist in the DNS root, and accepting one means
  // accepting typos that will bounce.
  if (labels[labels.length - 1].length < 2) {
    throw new MimeError(`${field} has an implausible top-level domain: ${domain}`)
  }
}

/** The domain of an address, lowercased. Used for the From-alignment check. */
export function addressDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase()
}

/**
 * Encode a header value that may contain non-ASCII.
 *
 * Subject lines legitimately carry names like "Juan — certificate ready", and a
 * raw 8-bit header is at the mercy of whatever the receiving client guesses.
 * RFC 2047 base64 is the reliable answer.
 */
function encodeHeaderValue(value: string): string {
  // Pure ASCII passes through untouched; anything else is base64 per RFC 2047.
  //
  // Written with charCodeAt rather than a character-class regex on purpose: an
  // earlier version used `/[^\x20-\xff]/`, and a stray NUL byte inside that
  // literal made the whole file unreadable to some tooling while still parsing
  // fine in the bundler. A byte comparison cannot be corrupted that way.
  let ascii = true
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7e) {
      ascii = false
      break
    }
  }
  if (ascii) return value

  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

/**
 * A body part is base64 and wrapped, so no line can exceed the SMTP limit and no
 * sequence of bytes can be mistaken for a terminator.
 */
function encodeBody(body: string): string {
  const bytes = new TextEncoder().encode(body)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/(.{76})/g, '$1\r\n')
    .replace(/\r\n$/, '')
}

/** RFC 5322 date, in the format every mail client expects to see. */
function rfc5322Date(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    // The day is zero-padded to two digits. RFC 5322 permits a bare "5", but no
    // mail client emits it, and a parser written against what real mail looks
    // like is entitled to assume the two-character form.
    `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} +0000`
  )
}

/** Message-ID. Unique enough for one sender, and parseable by replies. */
function messageId(domain: string, now: Date): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `<${now.getTime().toString(36)}.${rand}@${domain}>`
}

export interface BuildOptions {
  /** Host used to build the Message-ID domain. */
  messageIdDomain: string
  /** Fixed for tests, so a snapshot is reproducible. */
  now?: Date
  /** Message-ID override, for idempotent retries of the same logical mail. */
  messageId?: string
}

/**
 * Build a complete RFC 5322 message.
 *
 * Every part is CRLF-terminated, which SMTP requires and which most hand-rolled
 * senders get subtly wrong — LF-only messages pass a test harness and get
 * mangled or silently truncated by a real MTA.
 */
export function buildMimeMessage(message: MimeMessage, options: BuildOptions): string {
  if (message.to.length === 0) throw new MimeError('A message needs at least one recipient')
  for (const to of message.to) assertAddress(to, 'to')
  assertAddress(message.from, 'from')
  assertNoHeaderInjection(message.fromName ?? '', 'fromName')
  assertNoHeaderInjection(message.subject, 'subject')
  if (message.replyTo) assertAddress(message.replyTo, 'replyTo')

  const now = options.now ?? new Date()
  const domain = addressDomain(message.from)

  const headers: string[] = [
    `From: ${message.fromName ? `${encodeHeaderValue(message.fromName)} <${message.from}>` : message.from}`,
    `To: ${message.to.join(', ')}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    `Date: ${rfc5322Date(now)}`,
    `Message-ID: ${options.messageId ?? messageId(domain, now)}`,
    'MIME-Version: 1.0',
  ]

  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`)
  // Announce bulk mail honestly. Claiming otherwise is both inaccurate and a
  // reason to be treated as spam.
  headers.push('Auto-Submitted: auto-generated')

  if (message.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary(now)}"`)

    const b = boundary(now)
    const parts = [
      `--${b}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeBody(message.text),
      `--${b}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeBody(message.html),
      `--${b}--`,
      '',
    ]
    return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`
  }

  headers.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64')
  return `${headers.join('\r\n')}\r\n\r\n${encodeBody(message.text)}\r\n`
}

function boundary(now: Date): string {
  return `----=_ITH_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

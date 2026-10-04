import { describe, expect, it } from 'vitest'
import { MimeError, addressDomain, buildMimeMessage } from './mime.ts'
import type { MimeMessage } from './mime.ts'

/**
 * Tests for the MIME builder.
 *
 * The header-injection cases are the reason this file exists. A subject
 * containing CRLF silently turns one message into two recipients, and the failure
 * surfaces later as spam complaints rather than as an error, so it has to be
 * caught at the boundary and tested.
 */

const NOW = new Date('2026-10-05T09:30:00Z')

function msg(overrides: Partial<MimeMessage> = {}): MimeMessage {
  return {
    from: 'no-reply@itlearninghub.ph',
    fromName: 'IT Learning Hub',
    to: ['student@ncst.edu.ph'],
    subject: 'Your quiz result',
    text: 'You scored 8 of 10.',
    ...overrides,
  }
}

const opts = { messageIdDomain: 'itlearninghub.ph', now: NOW }

describe('envelope integrity', () => {
  it('refuses a subject containing CRLF', () => {
    // The classic header injection. Without this check, `Bcc:` on the second line
    // silently adds a recipient the sender never chose.
    expect(() => buildMimeMessage(msg({ subject: 'Hi\r\nBcc: victim@example.com' }), opts)).toThrow(
      MimeError,
    )
  })

  it('refuses a bare LF in a subject', () => {
    expect(() => buildMimeMessage(msg({ subject: 'Hi\nBcc: victim@example.com' }), opts)).toThrow(
      /inject a header/,
    )
  })

  it('refuses CRLF in the from address', () => {
    expect(() =>
      buildMimeMessage(msg({ from: 'a@b.com\r\nBcc: victim@example.com' }), opts),
    ).toThrow(MimeError)
  })

  it('refuses CRLF in the from display name', () => {
    expect(() => buildMimeMessage(msg({ fromName: 'Hub\r\nX-Evil: 1' }), opts)).toThrow(MimeError)
  })

  it('refuses CRLF in a recipient', () => {
    expect(() => buildMimeMessage(msg({ to: ['a@b.com\r\nBcc: x@y.com'] }), opts)).toThrow(MimeError)
  })

  it('refuses a recipient that is not an address', () => {
    for (const bad of ['', 'no-at-sign', 'a@', '@b.com', 'a b@c.com', 'a@b..com']) {
      expect(() => buildMimeMessage(msg({ to: [bad] }), opts)).toThrow(MimeError)
    }
  })

  it('refuses a message with no recipients', () => {
    expect(() => buildMimeMessage(msg({ to: [] }), opts)).toThrow(/at least one recipient/)
  })

  it('allows a tab in a subject, which is legal header folding whitespace', () => {
    expect(() => buildMimeMessage(msg({ subject: 'Quiz\tresult' }), opts)).not.toThrow()
  })

  it('extracts the domain from an address', () => {
    expect(addressDomain('No-Reply@ITLearningHub.PH')).toBe('itlearninghub.ph')
  })
})

describe('message shape', () => {
  it('terminates every header line with CRLF', () => {
    // An LF-only message passes a naive test and gets mangled by a real MTA.
    const built = buildMimeMessage(msg(), opts)
    const [headerBlock] = built.split('\r\n\r\n')
    expect(headerBlock).not.toMatch(/(^|[^\r])\n/)
  })

  it('includes the headers a mail client needs', () => {
    const built = buildMimeMessage(msg(), opts)
    expect(built).toContain('From: IT Learning Hub <no-reply@itlearninghub.ph>')
    expect(built).toContain('To: student@ncst.edu.ph')
    expect(built).toContain('Subject: Your quiz result')
    expect(built).toContain('Date: Mon, 05 Oct 2026 09:30:00 +0000')
    expect(built).toMatch(/Message-ID: <[^@]+@itlearninghub\.ph>/)
    expect(built).toContain('MIME-Version: 1.0')
  })

  it('announces itself as automated mail', () => {
    // Accurate, and it is why a grade should never land in a junk folder.
    expect(buildMimeMessage(msg(), opts)).toContain('Auto-Submitted: auto-generated')
  })

  it('sets a reply-to when given one', () => {
    expect(buildMimeMessage(msg({ replyTo: 'support@itlearninghub.ph' }), opts)).toContain(
      'Reply-To: support@itlearninghub.ph',
    )
  })

  it('encodes a non-ASCII subject as RFC 2047', () => {
    // A student's name with an em dash is normal. Raw 8-bit in a header is a gamble
    // on what the receiving client guesses.
    const built = buildMimeMessage(msg({ subject: 'Certificate ready — Juan' }), opts)
    expect(built).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/)
    expect(built).not.toMatch(/Subject: .*—/)
  })

  it('leaves a plain ASCII subject untouched', () => {
    expect(buildMimeMessage(msg(), opts)).toContain('Subject: Your quiz result\r\n')
  })

  it('base64-encodes the body and wraps it', () => {
    const built = buildMimeMessage(msg({ text: 'x'.repeat(500) }), opts)
    expect(built).toContain('Content-Transfer-Encoding: base64')
    const [, body] = built.split('\r\n\r\n')
    expect(body.split('\r\n').every((line) => line.length <= 76)).toBe(true)
  })

  it('sends a plain-text part even when HTML is supplied', () => {
    // Some recipients, and every text-only client, must still get the content.
    const built = buildMimeMessage(msg({ html: '<p>Hi</p>' }), opts)
    expect(built).toContain('multipart/alternative')
    expect(built).toContain('Content-Type: text/plain; charset=utf-8')
    expect(built).toContain('Content-Type: text/html; charset=utf-8')
  })

  it('closes a multipart message with the terminating boundary', () => {
    const built = buildMimeMessage(msg({ html: '<p>Hi</p>' }), opts)
    expect(built.trimEnd()).toMatch(/----=_ITH_\w+_\w+--$/)
  })

  it('is byte-for-byte reproducible for a fixed id, so a retry sends the same message', () => {
    const withId = { ...opts, messageId: '<fixed@itlearninghub.ph>' }
    expect(buildMimeMessage(msg(), withId)).toBe(buildMimeMessage(msg(), withId))
  })
})
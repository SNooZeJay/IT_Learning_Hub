import { describe, expect, it } from 'vitest'
import { SmtpError, parseResponse, sendMail } from './smtp.ts'
import type { SmtpConfig, SmtpTransport } from './smtp.ts'
import type { MimeMessage } from './mime.ts'

/**
 * Tests for the SMTP conversation, driven by a scripted transport.
 *
 * This is the layer that fails silently in production. A client that skips
 * STARTTLS sends an app password in cleartext; one that misreads a multiline
 * reply hangs; one that forgets to re-EHLO after the TLS upgrade gets its AUTH
 * rejected. None of those throw anywhere obvious, so they are asserted here
 * against the exact bytes that go on the wire.
 *
 * Two fixture mistakes were made and fixed while writing this, both worth
 * recording because both produced tests that could not fail:
 *
 * 1. Indexing a literal reply array by position. The "server refuses RCPT TO"
 *    test was failing at MAIL FROM and passing for the wrong reason.
 * 2. Deriving the "command being answered" from the last written line, which
 *    cannot tell the multi-line message payload from the DATA command before it.
 *
 * The script is now keyed by step NAME, and the pending command is classified
 * explicitly. Overriding a reply means naming it, never counting into an array.
 */

const HOST = 'smtp.gmail.com'
const USERNAME = 'no-reply@itlearninghub.ph'

// A fake credential, shaped exactly like a real Gmail app password so the test
// exercises the real thing: sixteen characters, displayed in groups of four, and
// pasted in with the spaces still present.
//
// This is deliberately NOT the project's actual app password. A real credential in
// a tracked test file is a credential in git history forever, and a credential in
// git history is a credential in everyone who ever clones the repo.
const PASSWORD_AS_COPIED = 'aaaa bbbb cccc dddd'
const PASSWORD_STRIPPED = 'aaaabbbbccccdddd'

function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

interface ScriptStep {
  label: string
  /** The command this reply answers. */
  after: string
  reply: string
}

class FakeTransport implements SmtpTransport {
  written: string[] = []
  upgraded = 0

  constructor(private script: ScriptStep[]) {}

  async write(line: string): Promise<void> {
    this.written.push(line)
  }

  async read(): Promise<string> {
    const next = this.script.shift()
    if (!next) throw new Error(`ran out of scripted replies after "${this.pending()}"`)
    const pending = this.pending()
    if (pending !== next.after) {
      throw new Error(
        `script out of order: reply scripted for "${next.after}" but the server answers "${pending}"`,
      )
    }
    return `${next.reply}\r\n`
  }

  /** The command that the next read must answer. */
  private pending(): string {
    for (let i = this.written.length - 1; i >= 0; i -= 1) {
      const line = this.written[i]
      if (line === '') continue
      // The payload is a multi-line blob; classify it rather than mistaking it
      // for the DATA command that preceded it.
      if (line.includes('Content-Transfer-Encoding')) return '(message body)'
      return line
    }
    return '(greeting)'
  }

  async upgrade(): Promise<void> {
    this.upgraded += 1
  }

  async close(): Promise<void> {}
}

/** A normal exchange. Overrides are applied by step name. */
function happy(over: Record<string, string> = {}): ScriptStep[] {
  const steps: Array<[string, string, string]> = [
    ['banner', '(greeting)', `220 ${HOST} ESMTP ready`],
    ['ehlo1', 'EHLO itlearninghub.ph', `250-${HOST}\r\n250-STARTTLS\r\n250 AUTH LOGIN PLAIN`],
    ['starttls', 'STARTTLS', '220 2.0.0 Ready to start TLS'],
    ['ehlo2', 'EHLO itlearninghub.ph', `250-${HOST}\r\n250-AUTH LOGIN\r\n250 8BITMIME`],
    ['user', 'AUTH LOGIN', '334 VXNlcm5hbWU6'],
    ['pass', b64(USERNAME), '334 UGFzc3dvcmQ6'],
    ['auth', b64(PASSWORD_STRIPPED), '235 2.7.0 Accepted'],
    ['mailFrom', `MAIL FROM:<${USERNAME}>`, '250 2.1.0 Ok'],
    ['rcptTo1', 'RCPT TO:<student@ncst.edu.ph>', '250 2.1.5 Ok'],
    ['data', 'DATA', '354 End data with <CR><LF>.<CR><LF>'],
    // No step for the message body, and that is the point.
    //
    // SMTP has no reply to message content. After `354 Go ahead` the server stays
    // silent until it receives the lone-dot terminator. The script used to contain
    // a `body` step with a `250` reply, which meant the fake answered a read that
    // should never have happened - so it agreed with a client that hung forever
    // against real Gmail.
    //
    // The FakeTransport throws when a read arrives that no step scripted, so
    // removing this entry turns the silence into an enforced part of the
    // contract: if sendMail ever reads after the body again, these tests fail.
    //
    // The queue id lands on the reply to the terminator, which is also the
    // authoritative acknowledgement - the one a support ticket can quote.
    ['terminator', '.', '250 2.0.0 Ok: queued as ABC123'],
    ['quit', 'QUIT', '221 2.0.0 Bye'],
  ]
  return steps.map(([label, after, reply]) => ({ label, after, reply: over[label] ?? reply }))
}

/**
 * The happy path with a second recipient.
 *
 * The recipients are listed in the order the caller passes them, so the script has
 * to answer them in that same order rather than in the order `happy()` happens to
 * use for a single recipient.
 */
function twoRecipients(): ScriptStep[] {
  const script = happy()
  const first = script.findIndex((s) => s.label === 'rcptTo1')
  script[first].after = 'RCPT TO:<second@ncst.edu.ph>'
  script.splice(first + 1, 0, {
    label: 'rcptTo2',
    after: 'RCPT TO:<student@ncst.edu.ph>',
    reply: '250 2.1.5 Ok',
  })
  return script
}

const config: SmtpConfig = {
  host: HOST,
  port: 587,
  username: USERNAME,
  password: PASSWORD_AS_COPIED,
  from: USERNAME,
}

const message: MimeMessage = {
  from: USERNAME,
  to: ['student@ncst.edu.ph'],
  subject: 'Your quiz result',
  text: 'You scored 8 of 10.',
}

const opts = { messageIdDomain: 'itlearninghub.ph', now: new Date('2026-10-05T09:30:00Z') }

describe('response parsing', () => {
  it('reads a single-line reply', () => {
    expect(parseResponse(['250 2.1.0 Ok'])).toEqual({ code: 250, text: '2.1.0 Ok' })
  })

  it('joins a multiline reply into one text', () => {
    const { code, text } = parseResponse(['250-a', '250-b', '250 AUTH'])
    expect(code).toBe(250)
    expect(text).toBe('a\nb\nAUTH')
  })

  it('rejects a multiline reply whose final line is truncated', () => {
    // Reading only the first line makes a client believe the server stopped talking.
    expect(() => parseResponse(['250-first', '250-STARTTLS'])).toThrow(/truncated/)
  })

  it('rejects an unparseable reply', () => {
    expect(() => parseResponse(['hello?'])).toThrow(/unparseable/)
  })

  it('rejects an empty reply', () => {
    expect(() => parseResponse([])).toThrow(/empty response/)
  })
})

describe('the conversation', () => {
  it('completes the full sequence in order', async () => {
    const t = new FakeTransport(happy())
    const result = await sendMail(t, config, message, opts)

    expect(t.written[0]).toBe('EHLO itlearninghub.ph')
    expect(t.written.filter((l) => l.startsWith('EHLO'))).toHaveLength(2)
    expect(t.written[t.written.length - 1]).toBe('QUIT')
    expect(t.written[t.written.length - 2]).toBe('.')
    expect(result.accepted).toEqual(['student@ncst.edu.ph'])
  })

  it('upgrades to TLS before any credential leaves the process', async () => {
    // The failure that matters most: an app password sent before the upgrade is an
    // app password in cleartext.
    const t = new FakeTransport(happy())
    await sendMail(t, config, message, opts)

    const starttlsAt = t.written.indexOf('STARTTLS')
    const authAt = t.written.indexOf('AUTH LOGIN')
    const usernameAt = t.written.indexOf(b64(USERNAME))

    expect(starttlsAt).toBeGreaterThan(-1)
    expect(starttlsAt).toBeLessThan(authAt)
    expect(starttlsAt).toBeLessThan(usernameAt)
    expect(usernameAt).toBeGreaterThan(-1)
    expect(t.upgraded).toBe(1)
  })

  it('strips the spaces from a copied Gmail app password', async () => {
    // People copy these as "abcd efgh ijkl mnop"; the spaces must not go out.
    const t = new FakeTransport(happy())
    await sendMail(t, config, message, opts)
    expect(t.written).toContain(b64(PASSWORD_STRIPPED))
    expect(t.written).not.toContain(b64(PASSWORD_AS_COPIED))
  })

  it('reports the queue id the server assigned', async () => {
    const t = new FakeTransport(happy())
    const result = await sendMail(t, config, message, opts)
    expect(result.response).toContain('ABC123')
  })

  it('stops when the greeting is not 220', async () => {
    const t = new FakeTransport([
      { label: 'banner', after: '(greeting)', reply: '554 no service here' },
    ])
    await expect(sendMail(t, config, message, opts)).rejects.toThrow(/did not greet/)
  })

  it('fails when the server refuses to start TLS', async () => {
    await expect(
      sendMail(
        new FakeTransport(happy({ starttls: '454 4.7.0 TLS not available' })),
        config,
        message,
        opts,
      ),
    ).rejects.toThrow(/starttls refused/)
  })

  it('refuses to authenticate when the server offers no AUTH after TLS', async () => {
    await expect(
      sendMail(
        new FakeTransport(happy({ ehlo2: `250-${HOST}\r\n250 8BITMIME` })),
        config,
        message,
        opts,
      ),
    ).rejects.toThrow(/does not offer AUTH/)
  })

  it('fails when the password is rejected', async () => {
    await expect(
      sendMail(
        new FakeTransport(happy({ auth: '535 5.7.8 Username and Password not accepted' })),
        config,
        message,
        opts,
      ),
    ).rejects.toThrow(SmtpError)
  })

  it('fails when the sender address is refused', async () => {
    await expect(
      sendMail(
        new FakeTransport(happy({ mailFrom: '550 5.1.8 Sender rejected' })),
        config,
        message,
        opts,
      ),
    ).rejects.toThrow(/mail-from refused/)
  })

  it('fails when a recipient is refused, and does not claim delivery', async () => {
    await expect(
      sendMail(
        new FakeTransport(happy({ rcptTo1: '550 5.1.1 No such user' })),
        config,
        message,
        opts,
      ),
    ).rejects.toThrow(/rcpt-to refused/)
  })

  it('sends one RCPT TO per recipient', async () => {
    const t = new FakeTransport(twoRecipients())
    const result = await sendMail(
      t,
      config,
      { ...message, to: ['second@ncst.edu.ph', 'student@ncst.edu.ph'] },
      opts,
    )
    expect(t.written.filter((l) => l.startsWith('RCPT TO'))).toHaveLength(2)
    expect(result.accepted).toEqual(['second@ncst.edu.ph', 'student@ncst.edu.ph'])
  })

  it('does not fail the delivery when the server hangs up at QUIT', async () => {
    // The message is already accepted at this point. A server that closes before
    // reading QUIT is normal, and reporting that as a failure would make callers
    // retry and send duplicates.
    const script = happy({ quit: '421 4.7.0 closing connection' })
    await expect(sendMail(new FakeTransport(script), config, message, opts)).resolves.toMatchObject(
      {
        accepted: ['student@ncst.edu.ph'],
      },
    )
  })

  it('never puts a password in the failure message', async () => {
    // A thrown error is logged and often pasted into a ticket. A credential in an
    // exception message is a credential in someone's chat history.
    const script = happy({ auth: '535 5.7.8 bad password' })
    try {
      await sendMail(new FakeTransport(script), config, message, opts)
      throw new Error('should have thrown')
    } catch (error) {
      const text = String(error)
      // Asserted against the current fixture rather than a transcribed literal,
      // so this keeps testing what it is meant to if the fixture ever changes.
      expect(text).not.toContain(PASSWORD_STRIPPED)
      expect(text).not.toContain(PASSWORD_STRIPPED.slice(0, 4))
      expect(text).not.toContain(PASSWORD_STRIPPED.slice(-4))
      expect(text).not.toContain(b64(PASSWORD_STRIPPED))
    }
  })

  it('dot-stuffs so a body cannot terminate itself early', async () => {
    // Without this, a body containing "\r\n." ends the message and the remainder
    // is read as SMTP commands. The payload is base64, so the assertion is on the
    // transmitted bytes, not the readable text.
    const t = new FakeTransport(happy())
    await sendMail(t, config, { ...message, text: 'first\r\n.\r\nlast' }, opts)
    const payload = t.written.find((l) => l.includes('Content-Transfer-Encoding'))
    expect(payload).toBeDefined()
    expect(payload!.split('\r\n').some((l) => l === '.')).toBe(false)
  })
})

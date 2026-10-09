import { describe, it, expect } from 'vitest'
import { parseRecoveryParams } from './auth'

/**
 * The reset link this application sends must be recognised as carrying a token.
 *
 * This is not hypothetical. The `send-email` edge function mints the link with the
 * admin API and emails:
 *
 *     .../auth/reset-password?token_hash=<hashed_token>&type=recovery
 *
 * The recovery probe was written for Supabase's other two shapes - PKCE `?code=` and
 * the implicit `#access_token=` - and had never seen `token_hash`, because that link
 * is minted by our own mailer and no Supabase default email produces it. A link from
 * our own mail was therefore read as carrying no token at all, and the reset page
 * told the reader it "needed the one-time code from your reset email" - on a link
 * that came from exactly that email. The symptom was a loop: request another, get the
 * same mail, be told the same thing, forever.
 *
 * The token below is a real one, taken from a delivered email. The hash itself is
 * worthless - it is spent and was never a credential - but the *shape* of the URL is
 * the contract, and that is what this pins. Parsing is pure so it can be asserted
 * without a browser or a Supabase client.
 */
describe('parseRecoveryParams', () => {
  const REAL_LINK =
    '?token_hash=76e65d5b84df79fa7bc72b4af2c6b113249c8a178c08bc0bef72c3e358&type=recovery'

  it('recognises the token_hash our own reset email sends', () => {
    const probe = parseRecoveryParams(REAL_LINK, '')

    expect(probe.hasToken).toBe(true)
    expect(probe.tokenHash).toBe('76e65d5b84df79fa7bc72b4af2c6b113249c8a178c08bc0bef72c3e358')
    expect(probe.isRecovery).toBe(true)
    expect(probe.errorCode).toBeNull()
  })

  it('still recognises the PKCE and implicit shapes', () => {
    expect(parseRecoveryParams('?code=abc123', '').hasToken).toBe(true)
    expect(parseRecoveryParams('', 'access_token=xyz&type=recovery').hasToken).toBe(true)
    expect(parseRecoveryParams('', 'refresh_token=xyz').hasToken).toBe(true)
  })

  it('reports no token for a URL that genuinely carries none', () => {
    const probe = parseRecoveryParams('', '')

    expect(probe.hasToken).toBe(false)
    expect(probe.tokenHash).toBeNull()
  })

  it('reads a spent or expired link as an error, not as a missing one', () => {
    const probe = parseRecoveryParams(
      '?error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      '',
    )

    expect(probe.errorCode).toBe('otp_expired')
    expect(probe.errorDescription).toBe('Email link is invalid or has expired')
    expect(probe.hasToken).toBe(false)
  })

  it('finds a token in the fragment when a mail client moved it there', () => {
    const probe = parseRecoveryParams('', '?token_hash=abc&type=recovery'.slice(1))

    expect(probe.tokenHash).toBe('abc')
  })

  it('does not mistake a sign-in link for a recovery link', () => {
    expect(
      parseRecoveryParams(REAL_LINK.replace('type=recovery', 'type=magiclink'), '').isRecovery,
    ).toBe(false)
  })
})

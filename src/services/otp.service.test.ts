import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The sign-in code flow's contract, without a network.
 *
 * The assertions worth having are the ones about what the browser is never given. A code
 * is a one-time secret: if it reaches the client in any form the whole step is theatre,
 * and nothing about the happy path would reveal that.
 */

const invoke = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
    auth: {
      setSession: vi.fn(async () => ({ error: null })),
    },
  },
}))

/**
 * What the SDK hands back for a non-2xx: an error carrying the raw response, and no data.
 * Every server-side reason travels this way, so a service that only reads `data` reports
 * one generic failure for all of them - which is exactly the bug this shape pins down.
 */
function httpFailure(status: number, payload: unknown): { error: { context: Response } } {
  return {
    error: {
      context: new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    },
  } as never
}

import {
  OTP_MESSAGES,
  requestSignInCode,
  resendSignInCode,
  verifySignInCode,
  type SignInOtpReason,
} from './otp.service'

beforeEach(() => {
  invoke.mockReset()
})

describe('requestSignInCode', () => {
  const challengeResponse = {
    data: { challenge_id: 'abc', expires_in_seconds: 900, resendable: true },
    error: null,
  }

  it('returns a challenge id and no session for an account that wants a code', async () => {
    invoke.mockResolvedValue(challengeResponse)

    const step = await requestSignInCode('A@B.com', 'hunter2')

    expect(step.kind).toBe('challenge')
    if (step.kind !== 'challenge') throw new Error('expected a challenge')
    expect(step.challenge.challengeId).toBe('abc')
    expect(step.challenge.expiresInSeconds).toBe(900)
    // The whole point: nothing token-shaped comes back at this step.
    expect(JSON.stringify(step)).not.toMatch(/token|session|password/i)
  })

  it('returns a session, and no second step, for an account with no code turned on', async () => {
    const { supabase } = await import('@/services/supabase/client')
    const session = { access_token: 'at', refresh_token: 'rt', user: { id: 'u1' } }
    invoke.mockResolvedValue({ data: { session }, error: null })

    const step = await requestSignInCode('a@b.com', 'hunter2')

    expect(step.kind).toBe('session')
    // The session must reach the client itself, not be handed back for the caller to
    // file. Otherwise the two sign-in paths reach the router guard differently and the
    // guard becomes the thing that has to know which step produced the tokens.
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    })
  })

  it('treats a response with neither a challenge nor a session as a failure', async () => {
    // The server should never produce this. Asserting it throws rather than defaulting to
    // one branch or the other is what stops a malformed response becoming a silent
    // sign-in.
    invoke.mockResolvedValue({ data: {}, error: null })

    await expect(requestSignInCode('a@b.com', 'hunter2')).rejects.toMatchObject({
      reason: 'could_not_start',
    })
  })

  it('normalises the address before sending it', async () => {
    invoke.mockResolvedValue(challengeResponse)

    await requestSignInCode('  Joren@NCST.edu.ph  ', 'hunter2')

    expect(invoke.mock.calls[0][1].body).toMatchObject({
      action: 'begin',
      email: 'joren@ncst.edu.ph',
    })
  })

  it('reports invalid credentials with a reason the UI can branch on', async () => {
    // Shaped the way the SDK really delivers it: a 401 error object, not a data object.
    invoke.mockResolvedValue(httpFailure(401, { error: 'invalid_credentials' }))

    await expect(requestSignInCode('a@b.com', 'wrong')).rejects.toMatchObject({
      reason: 'invalid_credentials',
    })
  })

  it('reads the reason out of a non-2xx body rather than reporting one generic error', async () => {
    invoke.mockResolvedValue(httpFailure(502, { error: 'could_not_send_code' }))
    await expect(requestSignInCode('a@b.com', 'right')).rejects.toMatchObject({
      reason: 'could_not_send_code',
    })

    invoke.mockResolvedValue(httpFailure(429, { error: 'too_many_sign_in_attempts' }))
    await expect(requestSignInCode('a@b.com', 'right')).rejects.toMatchObject({
      reason: 'too_many_sign_in_attempts',
    })
  })

  it('survives an error whose body is not JSON', async () => {
    invoke.mockResolvedValue({
      error: { context: new Response('<html>gateway timeout</html>', { status: 504 }) },
    } as never)

    await expect(requestSignInCode('a@b.com', 'right')).rejects.toMatchObject({
      reason: 'could_not_start',
    })
  })
})

describe('verifySignInCode', () => {
  const session = {
    access_token: 'at',
    refresh_token: 'rt',
    user: { id: 'u1' },
  } as never

  it('rejects a malformed code without calling the function', async () => {
    // Cheap client-side refusal. The server checks again regardless, but a code that is
    // not six digits should never leave the browser.
    await expect(verifySignInCode('abc', '12')).rejects.toMatchObject({
      reason: 'invalid_code_format',
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('hands the session to the Supabase client and returns it', async () => {
    invoke.mockResolvedValue({ data: { session }, error: null })

    const result = await verifySignInCode('abc', '123456')

    expect(result).toBe(session)
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      action: 'verify',
      challenge_id: 'abc',
      code: '123456',
    })
  })

  it('surfaces how many attempts remain on a wrong code', async () => {
    invoke.mockResolvedValue(httpFailure(400, { error: 'invalid_code', attempts_left: 3 }))

    await expect(verifySignInCode('abc', '000000')).rejects.toMatchObject({
      reason: 'invalid_code',
      attemptsLeft: 3,
    })
  })

  it('distinguishes expired from used, because the two need different wording', async () => {
    invoke.mockResolvedValue(httpFailure(410, { error: 'challenge_expired' }))
    await expect(verifySignInCode('abc', '123456')).rejects.toMatchObject({
      reason: 'challenge_expired',
    })

    invoke.mockResolvedValue(httpFailure(410, { error: 'challenge_already_used' }))
    await expect(verifySignInCode('abc', '123456')).rejects.toMatchObject({
      reason: 'challenge_already_used',
    })
  })

  it('does not write a session when the code was refused', async () => {
    const { supabase } = await import('@/services/supabase/client')
    invoke.mockResolvedValue(httpFailure(400, { error: 'invalid_code', attempts_left: 4 }))

    await expect(verifySignInCode('abc', '000000')).rejects.toThrow()

    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })
})

describe('resendSignInCode', () => {
  it('sends the challenge id, not an email or a code', async () => {
    invoke.mockResolvedValue({
      data: { challenge_id: 'abc', expires_in_seconds: 900, resendable: true },
      error: null,
    })

    const challenge = await resendSignInCode('abc')

    expect(invoke.mock.calls[0][1].body).toEqual({ action: 'resend', challenge_id: 'abc' })
    expect(challenge.resendable).toBe(true)
  })

  it('reports a resend ceiling as its own reason', async () => {
    invoke.mockResolvedValue(httpFailure(429, { error: 'too_many_resends' }))

    await expect(resendSignInCode('abc')).rejects.toMatchObject({ reason: 'too_many_resends' })
  })
})

describe('OTP_MESSAGES', () => {
  it('has wording for every reason the service can return', () => {
    const reasons: SignInOtpReason[] = [
      'invalid_credentials',
      'invalid_code',
      'challenge_expired',
      'challenge_already_used',
      'too_many_verification_attempts',
      'too_many_sign_in_attempts',
      'too_many_resends',
      'no_such_challenge',
      'could_not_send_code',
      'could_not_start',
      'could_not_complete_sign_in',
      'invalid_code_format',
      'network',
    ]
    for (const reason of reasons) {
      expect(OTP_MESSAGES[reason], reason).toBeTruthy()
    }
  })

  it('says nothing that could leak a code', () => {
    const all = Object.values(OTP_MESSAGES).join(' ')
    expect(all).not.toMatch(/\b\d{6}\b/)
  })
})

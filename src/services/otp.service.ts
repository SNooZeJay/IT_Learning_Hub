import { supabase } from './supabase/client'
import type { Session } from '@supabase/supabase-js'

/**
 * The sign-in second factor: request a code, resend it, and exchange it for a session.
 *
 * Three steps on purpose. `begin` checks the password but returns no session, `verify`
 * checks the code and returns the only session a password sign-in ever produces. The
 * browser cannot skip `verify` because it never holds tokens to skip it with.
 *
 * Every failure is turned into a `SignInOtpError` carrying a machine-readable `reason`,
 * so the UI can say what to do next rather than showing one generic message for "wrong
 * code", "expired" and "too many attempts".
 */

export type SignInOtpReason =
  | 'invalid_credentials'
  | 'invalid_code'
  | 'challenge_expired'
  | 'challenge_already_used'
  | 'too_many_verification_attempts'
  | 'too_many_sign_in_attempts'
  | 'too_many_resends'
  | 'no_such_challenge'
  | 'could_not_send_code'
  | 'could_not_start'
  | 'could_not_complete_sign_in'
  | 'invalid_code_format'
  | 'network'

export class SignInOtpError extends Error {
  readonly reason: SignInOtpReason
  /** Wrong codes still allowed, when the server was able to say. */
  readonly attemptsLeft: number | null

  constructor(reason: SignInOtpReason, message: string, attemptsLeft: number | null = null) {
    super(message)
    this.name = 'SignInOtpError'
    this.reason = reason
    this.attemptsLeft = attemptsLeft
  }
}

/** A challenge in flight. Holds no secret: the code only ever exists in the email. */
export interface SignInChallenge {
  challengeId: string
  expiresInSeconds: number
  resendable: boolean
}

interface BeginResponse {
  challenge_id?: string
  expires_in_seconds?: number
  resendable?: boolean
}

interface VerifyResponse {
  session?: Session | null
  error?: string
  attempts_left?: number | null
}

/** Human wording per reason. The UI shows this, so it says what to do next. */
export const OTP_MESSAGES: Record<SignInOtpReason, string> = {
  invalid_credentials: 'That email and password do not match an account.',
  invalid_code: 'That code is not right. Check it and try again.',
  challenge_expired: 'That code has expired. Ask for a new one.',
  challenge_already_used: 'That code has already been used. Sign in again for a new one.',
  too_many_verification_attempts: 'Too many wrong codes. Ask for a new one to continue.',
  too_many_sign_in_attempts: 'Too many sign-in attempts. Wait a few minutes and try again.',
  too_many_resends: 'Too many codes requested. Wait a few minutes and try again.',
  no_such_challenge: 'This sign-in attempt is no longer available. Sign in again.',
  could_not_send_code: 'The code could not be emailed. Try again in a moment.',
  could_not_start: 'Sign-in could not be started. Try again in a moment.',
  could_not_complete_sign_in: 'Sign-in could not be completed. Try again in a moment.',
  invalid_code_format: 'The code is six digits.',
  network: 'Could not reach the server. Check your connection and try again.',
}

const FUNCTION_TIMEOUT_MS = 20_000

/**
 * The machine-readable reason out of whatever came back.
 *
 * The awkward case is a non-2xx response. `supabase.functions.invoke` resolves those as
 * `{ data: null, error: FunctionsHttpError }` and never hands over the JSON body, so
 * reading `result.data` alone collapses every server failure into one generic reason.
 * That is not hypothetical: a wrong password came back as "Sign-in could not be
 * started" because the body's `invalid_credentials` was never read. The reason now comes
 * out of the error's `context` response instead.
 */
async function reasonFromFailure(error: unknown): Promise<{
  reason: SignInOtpReason
  attemptsLeft: number | null
}> {
  const context = (error as { context?: unknown })?.context
  if (context && typeof (context as Response).json === 'function') {
    try {
      const payload = (await (context as Response).json()) as {
        error?: string
        attempts_left?: number | null
      }
      if (payload?.error) {
        const known = (Object.keys(OTP_MESSAGES) as SignInOtpReason[]).includes(
          payload.error as SignInOtpReason,
        )
        return {
          reason: known ? (payload.error as SignInOtpReason) : 'could_not_start',
          attemptsLeft: payload.attempts_left ?? null,
        }
      }
    } catch {
      /* body was not JSON; fall through to the generic reason */
    }
  }
  return { reason: 'could_not_start', attemptsLeft: null }
}

async function call<T>(
  body: Record<string, unknown>,
): Promise<{ data: T | null; reason: SignInOtpReason | null; attemptsLeft: number | null }> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, FUNCTION_TIMEOUT_MS)

  try {
    const result = await supabase.functions.invoke('signin-otp', {
      body,
      signal: controller.signal,
    })

    if (timedOut) {
      return { data: null, reason: 'network', attemptsLeft: null }
    }

    if (result.error) {
      return { data: null, ...(await reasonFromFailure(result.error)) }
    }

    const payload = (result.data ?? {}) as T & { error?: string; attempts_left?: number | null }
    if (payload?.error) {
      const reason = (Object.keys(OTP_MESSAGES) as SignInOtpReason[]).includes(
        payload.error as SignInOtpReason,
      )
        ? (payload.error as SignInOtpReason)
        : 'could_not_start'
      return { data: null, reason, attemptsLeft: payload.attempts_left ?? null }
    }

    return { data: payload, reason: null, attemptsLeft: null }
  } catch {
    return { data: null, reason: 'network', attemptsLeft: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Step one: the password is checked, a code is emailed, no session is issued. */
export async function requestSignInCode(email: string, password: string): Promise<SignInChallenge> {
  const { data, reason, attemptsLeft } = await call<BeginResponse>({
    action: 'begin',
    email: email.trim().toLowerCase(),
    password,
  })

  if (reason || !data?.challenge_id) {
    throw new SignInOtpError(
      reason ?? 'could_not_start',
      OTP_MESSAGES[reason ?? 'could_not_start'],
      attemptsLeft,
    )
  }

  return {
    challengeId: data.challenge_id,
    expiresInSeconds: data.expires_in_seconds ?? 900,
    resendable: data.resendable ?? true,
  }
}

/** Ask for the code again. The previous one stops working. */
export async function resendSignInCode(challengeId: string): Promise<SignInChallenge> {
  const { data, reason, attemptsLeft } = await call<BeginResponse>({
    action: 'resend',
    challenge_id: challengeId,
  })

  if (reason || !data?.challenge_id) {
    throw new SignInOtpError(
      reason ?? 'could_not_send_code',
      OTP_MESSAGES[reason ?? 'could_not_send_code'],
      attemptsLeft,
    )
  }

  return {
    challengeId: data.challenge_id,
    expiresInSeconds: data.expires_in_seconds ?? 900,
    resendable: data.resendable ?? true,
  }
}

/**
 * Step two: exchange the code for the session.
 *
 * This is the only place a password sign-in produces tokens. The session is written
 * into the Supabase client here rather than in the store, so `onAuthStateChange` fires
 * once and the router guard sees a signed-in user exactly as it does today.
 */
export async function verifySignInCode(challengeId: string, code: string): Promise<Session> {
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    throw new SignInOtpError('invalid_code_format', OTP_MESSAGES.invalid_code_format, null)
  }

  const { data, reason, attemptsLeft } = await call<VerifyResponse>({
    action: 'verify',
    challenge_id: challengeId,
    code: trimmed,
  })

  if (reason || !data?.session) {
    throw new SignInOtpError(
      reason ?? 'could_not_complete_sign_in',
      OTP_MESSAGES[reason ?? 'could_not_complete_sign_in'],
      attemptsLeft,
    )
  }

  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
  if (error) {
    throw new SignInOtpError(
      'could_not_complete_sign_in',
      OTP_MESSAGES.could_not_complete_sign_in,
      null,
    )
  }

  return data.session
}

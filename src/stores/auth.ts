import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import {
  supabase,
  FunctionTimeoutError,
  invokeFunction,
  isSupabaseConfigured,
  readFunctionError,
} from '@/services/supabase/client'
import { fetchProfileByUserId, setOwnEmailCodeSignIn } from '@/services/profile.service'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import { useUnreadMessages } from '@/composables/useUnreadMessages'
import type { Profile, Role } from '@/types'

/**
 * How long the reset page waits for the recovery session before giving up.
 *
 * Five seconds is not a guess about how long the exchange takes - it is a bound on
 * how long a person will stare at a blank form before deciding the page is broken.
 * The real exchange is a network round trip, so on a slow phone connection a
 * generous bound is the difference between "it worked" and "it gave up". And it has
 * to be bounded at all: without a deadline, a fragment stripped by an in-app
 * webview produces the same infinite wait the bug already produced, only with a
 * spinner instead of a red alert.
 */
const RECOVERY_WAIT_MS = 5000

/**
 * What the URL itself claims, independent of whether a session materialised.
 *
 * The fragment is parsed by hand rather than left to `detectSessionInUrl` alone,
 * because the two things that go wrong here are invisible to a session check. An
 * expired link still parses perfectly well, and a link whose fragment was stripped
 * by an in-app webview parses as a URL with nothing in it - the same shape as a
 * link somebody typed from memory. Those need different words and a different next
 * step, so they cannot both be answered by "not valid".
 */
export interface RecoveryLinkProbe {
  /** A token of either flow was present. */
  hasToken: boolean
  errorCode: string | null
  errorDescription: string | null
  /** `type=recovery` marks the link as a reset rather than a sign-in. */
  isRecovery: boolean
}

/**
 * Why the reset page can or cannot show its form.
 *
 * `expired` and `no-token` are separate cases on purpose. One means a real link
 * was spent and the answer is "ask for another"; the other means the URL never
 * carried a link at all and the answer is "open it from the email, not from
 * memory". Telling somebody their link is invalid when their mail app ate it is
 * how you talk someone out of resetting their password at all.
 */
export type RecoverySessionOutcome =
  | { status: 'ready' }
  | { status: 'expired'; detail: string }
  | { status: 'no-token'; detail: string }
  | { status: 'failed'; detail: string }

/**
 * Session, profile and role for the signed-in user.
 *
 * The role is read from the `profiles` table and never from client input, the
 * JWT, or anything the browser can set. A user who edits this state in devtools
 * changes nothing they can actually do, because every read and write is filtered
 * by Row Level Security against `auth.uid()`.
 *
 * This store is the UX layer of authorisation: it decides what to render and
 * where to send people. RLS is the security layer.
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)

  /**
   * Guards the very first navigation. `ensureReady()` awaits the shared
   * initialisation promise so a route never resolves before the session is known.
   */
  const initialized = ref(false)

  /** Message from the most recent auth action, surfaced by the auth views. */
  const lastError = ref<string | null>(null)

  const user = computed<User | null>(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => Boolean(session.value))
  const role = computed<Role | null>(() => profile.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const isInstructor = computed(() => role.value === 'instructor')
  const isStudent = computed(() => role.value === 'student')

  /** Where to send this user after signing in, or after a refused route. */
  const homePath = computed<string>(() => {
    switch (role.value) {
      case 'admin':
        return '/admin/dashboard'
      case 'instructor':
        return '/instructor/dashboard'
      case 'student':
        return '/student/dashboard'
      default:
        // No role yet, which means the profile has not loaded. Fall back to the
        // student home rather than guessing at an admin surface.
        return '/student/dashboard'
    }
  })

  function clearError(): void {
    lastError.value = null
  }

  /**
   * Load the session once, then keep the store in sync with sign-in and sign-out.
   * Returns a promise so the router can await it, but the subscription is not
   * torn down because the store outlives every view.
   */
  /**
   * The in-flight initialisation, so a second caller can wait for it.
   *
   * This is the whole fix for a bug that logged every signed-in user out on
   * refresh. `initialize()` used to bail out with `if (initializing.value) return`
   * - an early return, not a wait. On a page load, `app.use(router)` starts the
   * first navigation before `bootstrap()` calls `initialize()`, so whichever ran
   * second found `initializing` already true, returned immediately, and read a
   * `session.value` that was still null because the first call had not finished
   * its `getSession()`. The guard then redirected a signed-in user to sign-in.
   *
   * SPA navigation after sign-in worked, because the session was already in
   * memory. Only a hard reload or a deep link hit it, which is why it read as
   * intermittent and cost a long time to find.
   *
   * Returning the shared promise makes a second caller wait for the first
   * instead of racing past it.
   */
  let readyPromise: Promise<void> | null = null

  async function initialize(): Promise<void> {
    if (initialized.value) return
    // Not `return`: wait for whoever is already doing it.
    if (readyPromise) return readyPromise

    readyPromise = (async () => {
      if (!isSupabaseConfigured) {
        // Fail closed. Without configuration there is no session, so guarded
        // routes redirect to sign-in rather than rendering an empty shell.
        initialized.value = true
        return
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()
      session.value = currentSession
      if (currentSession) await loadProfile(currentSession.user.id)

      supabase.auth.onAuthStateChange((_event, nextSession) => {
        session.value = nextSession
        if (nextSession) {
          void loadProfile(nextSession.user.id)
        } else {
          profile.value = null
        }
      })

      initialized.value = true
    })()

    try {
      await readyPromise
    } finally {
      // Cleared so a later failure can be retried. `initialized` stays true on
      // success, so this only matters when the first attempt threw.
      readyPromise = null
    }
  }

  /**
   * Wait until the store knows who is signed in AND what their role is.
   *
   * `initialize()` alone is not enough, and this was the reason signing in landed people on
   * their profile page instead of their dashboard. By the time somebody signs in, the
   * store has already run `initialize()` on the sign-in page - with no session - and set
   * `initialized`. So `initialize()` returned immediately, `role` was still null, and
   * `homePath` fell through to its student default while the router guard, seeing no
   * role either, redirected to `/profile` to get one.
   *
   * The guard and this call need the same fact, so this waits for it: after a session
   * exists, a null profile means the fetch has not finished, not that the fetch is
   * unnecessary. A profile genuinely absent is left as null, which is what the guard's
   * own handling of it expects.
   */
  async function ensureReady(): Promise<void> {
    await initialize()

    const current = session.value
    if (!current) return

    // A profile belonging to somebody ELSE counts as no profile at all, not as a
    // loaded one.
    //
    // This used to test `!profile.value` alone, which cannot tell "the fetch has not
    // finished" from "the profile on hand belongs to the previous account". Signing in
    // while already signed in - a shared machine, or just switching accounts without
    // signing out - hits the second case: the store still holds the outgoing user's
    // profile, so this returned without fetching anything.
    //
    // The consequence was that the new person's role was never read before the router
    // moved. homePath resolved from the previous user's role, so an instructor signing
    // in over a student was sent to /student/dashboard, and the guard then let them
    // stay there because the route genuinely only admits students. What rendered was
    // the student dashboard with the previous student's enrolments, progress and grades
    // still on screen under the instructor's own navigation.
    if (!profile.value || profile.value.id !== current.user.id) {
      await loadProfile(current.user.id)
    }
  }

  /**
   * Fetch the profile for a user id. A missing profile is treated as "no role"
   * rather than as an error: the `handle_new_user` trigger creates the row, but
   * an account created before the trigger existed would otherwise deadlock the
   * app on an exception.
   */
  async function loadProfile(userId: string): Promise<void> {
    try {
      profile.value = await fetchProfileByUserId(userId)
    } catch (error) {
      console.error('[auth] could not load profile', error)
      profile.value = null
    }
  }

  async function signIn(email: string, password: string): Promise<void> {
    clearError()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    session.value = data.session
    await loadProfile(data.user.id)
  }

  /**
   * Register a new account.
   *
   * The role is never sent from here. A database trigger creates the profile
   * with `role = 'student'`, so a client cannot ask to be an instructor.
   */
  async function signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ needsEmailConfirmation: boolean }> {
    clearError()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/login`,
      },
    })
    if (error) throw new Error(error.message)
    return { needsEmailConfirmation: !data.session }
  }

  /**
   * Sends the reset link through this project's own Gmail SMTP.
   *
   * This used to call `supabase.auth.resetPasswordForEmail`, which sends from
   * Supabase's mailer instead. That works, but it meant the Gmail SMTP client in
   * `supabase/functions/_shared/smtp.ts` was called by nothing at all - 38 passing
   * tests on dead code.
   *
   * The function mints the recovery link with the admin API and emails it, so the
   * user-visible flow is unchanged: the caller cannot tell which path ran, and
   * cannot tell whether the account exists.
   */
  async function sendPasswordReset(email: string): Promise<void> {
    clearError()
    // Through the timeout wrapper. The function makes an SMTP connection to a
    // third-party relay, and a relay that accepts the connection and then hangs
    // leaves "Sending..." on the button indefinitely with no way to tell whether
    // the mail is coming. A bounded call gives the user a message and a retry.
    const { error } = await invokeFunction('send-email', {
      body: { action: 'password_reset', email: email.trim().toLowerCase() },
    })

    if (error) {
      // A timeout carries its own message and no body. Falling through to
      // `readFunctionError` would produce null here - there is no response - and
      // the user would be told the generic "could not send" for a request that
      // is still worth retrying.
      if (error instanceof FunctionTimeoutError) {
        throw new Error(error.message)
      }

      throw new Error(
        // Supabase wraps a non-2xx function response in a FunctionsHttpError
        // whose `context` is the JSON body the function actually sent. Reading
        // `error.message` alone would show "Edge Function returned a non-2xx
        // status code", which names nothing.
        readFunctionError(error) ?? 'Could not send the reset link. Try again in a moment.',
      )
    }

    // The function answers 200 with `delivered:false` when the address has no
    // account. That is deliberate - it must not be distinguishable from success -
    // so there is nothing to act on and nothing to report. The response body is
    // deliberately not read: it is the only thing that would reveal whether the
    // address has an account, and this method must not become the oracle that
    // says so.
  }

  async function updatePassword(password: string): Promise<void> {
    clearError()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }

  /**
   * Read the recovery parameters out of both the query string and the fragment.
   *
   * Both are read because the two flows put them in different places. PKCE sends
   * `?code=...`; the implicit flow sends `#access_token=...`. In-app browsers -
   * Gmail's embedded view especially - have been observed to preserve one and drop
   * the other, so whichever survived is worth looking at.
   */
  function probeRecoveryLink(): RecoveryLinkProbe {
    const query = window.location.search
    const fragment = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash

    const params = new URLSearchParams(`${query}&${fragment}`)

    const errorCode = params.get('error_code') ?? params.get('error')
    const errorDescription = params.get('error_description')

    return {
      hasToken:
        Boolean(params.get('access_token')) ||
        Boolean(params.get('refresh_token')) ||
        Boolean(params.get('code')),
      errorCode,
      errorDescription,
      isRecovery: params.get('type') === 'recovery',
    }
  }

  /** Supabase's codes for a one-time link that has already been spent. */
  const EXPIRED_CODES = new Set(['otp_expired', 'access_denied', 'otp_disabled'])

  /**
   * Remove the fragment so a refresh does not re-enter the recovery flow.
   *
   * Only ever called once a session exists. Stripping earlier would remove the
   * very token `detectSessionInUrl` is still trying to exchange, and the person
   * would be told their link was invalid on a link that was perfectly good.
   */
  function stripRecoveryFragment(): void {
    if (!window.history?.replaceState) return
    const { pathname, hash } = window.location

    // The PKCE `code` lives in the query string, so keeping `search` verbatim
    // would leave exactly the token we just spent sitting in the address bar, and
    // a refresh would try to redeem it a second time - which fails, because it is
    // single-use, and would show somebody who already reset their password a
    // fresh "this link is not valid" alert. So the spent parameter goes too.
    const params = new URLSearchParams(window.location.search)
    params.delete('code')
    params.delete('error_code')
    params.delete('error_description')
    const search = params.toString()

    if (!hash && !window.location.search.includes('code=')) return
    window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}`)
  }

  /**
   * Wait for the recovery session, for real, for a bounded time.
   *
   * The page used to do `await ensureReady()` and then read `auth.isAuthenticated`
   * once. That is a single read of a value that is still being written:
   * `detectSessionInUrl` exchanges the fragment token asynchronously, and the
   * `PASSWORD_RECOVERY` event lands afterwards. The read can win that race, and
   * the page then declares a perfectly good link invalid. Reloading the same URL
   * sometimes worked, because by then the token had already been exchanged and
   * persisted - which is the signature of the race.
   *
   * So: subscribe, wait for the event, and give up after a deadline. The deadline
   * is what turns an unbounded wait into a usable page - without it a stripped
   * fragment would spin forever, which is the same dead end wearing a spinner.
   */
  async function waitForRecoverySession(
    timeoutMs = RECOVERY_WAIT_MS,
  ): Promise<RecoverySessionOutcome> {
    await ensureReady()

    const probe = probeRecoveryLink()

    // An error in the URL is a verdict, not a hint. Supabase reports an expired
    // or already-used link as `error_code` in the same place it would have put a
    // token, so this can be answered without waiting at all.
    if (probe.errorCode) {
      return EXPIRED_CODES.has(probe.errorCode)
        ? { status: 'expired', detail: probe.errorDescription ?? '' }
        : { status: 'failed', detail: probe.errorDescription ?? '' }
    }

    // Already recovered - a refresh after a successful exchange.
    if (isAuthenticated.value) {
      stripRecoveryFragment()
      return { status: 'ready' }
    }

    // No token anywhere. An in-app webview that stripped the fragment lands
    // exactly here, and so does someone who navigated to this URL by hand.
    if (!probe.hasToken) {
      return {
        status: 'no-token',
        detail:
          'This page needs the one-time code from your reset email. Opening the link from the email keeps it intact.',
      }
    }

    const settled = await new Promise<{ session: Session | null; timedOut: boolean }>((resolve) => {
      let done = false
      const finish = (session: Session | null, timedOut = false) => {
        if (done) return
        done = true
        clearTimeout(timer)
        subscription.unsubscribe()
        resolve({ session, timedOut })
      }
      const timer = setTimeout(() => finish(null, true), timeoutMs)
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'PASSWORD_RECOVERY' || nextSession) finish(nextSession)
      })
    })

    if (settled.session || isAuthenticated.value) {
      stripRecoveryFragment()
      return { status: 'ready' }
    }

    // Timed out with a token that never became a session. Worth distinguishing
    // from `no-token`: the link was real and the server did not accept it, so
    // "send another one" is the right advice and "check the link" is not.
    return {
      status: 'expired',
      detail: 'This link could not be used. It may already have been used once.',
    }
  }

  /**
   * Whether this account asks for an emailed code on sign-in.
   *
   * Replaces the whole profile object with what the database returned rather than
   * patching one field on the copy in memory. The alternative is a switch that reads "on"
   * while the stored value is still off, which for a security setting is the one bug
   * worth refusing to write.
   */
  async function setEmailCodeSignIn(enabled: boolean): Promise<void> {
    clearError()
    if (!profile.value) throw new Error('Sign in before changing how you sign in.')
    profile.value = await setOwnEmailCodeSignIn(profile.value.id, enabled)
  }

  async function signOut(): Promise<void> {
    clearError()
    // Module-level state, so it survives this store being torn down. Cleared here
    // rather than left to the next reader's account check, because the next person
    // to sign in on a shared machine should never see this one's unread count on
    // the sidebar for even a moment.
    useUnreadNotifications().reset()
    useUnreadMessages().reset()
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
  }

  return {
    session,
    profile,
    user,
    role,
    initialized,
    isAuthenticated,
    isAdmin,
    isInstructor,
    isStudent,
    homePath,
    lastError,
    initialize,
    ensureReady,
    loadProfile,
    signIn,
    signUp,
    sendPasswordReset,
    updatePassword,
    waitForRecoverySession,
    setEmailCodeSignIn,
    signOut,
    clearError,
  }
})

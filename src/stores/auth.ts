import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, readFunctionError } from '@/services/supabase/client'
import { fetchProfileByUserId } from '@/services/profile.service'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import type { Profile, Role } from '@/types'

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

  async function ensureReady(): Promise<void> {
    await initialize()
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
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { action: 'password_reset', email: email.trim().toLowerCase() },
    })

    if (error) {
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
    // so there is nothing to act on and nothing to report.
    void data
  }

  async function updatePassword(password: string): Promise<void> {
    clearError()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }

  async function signOut(): Promise<void> {
    clearError()
    // Module-level state, so it survives this store being torn down. Cleared here
    // rather than left to the next reader's account check, because the next person
    // to sign in on a shared machine should never see this one's unread count on
    // the sidebar for even a moment.
    useUnreadNotifications().reset()
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
    signOut,
    clearError,
  }
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Profile, Role } from '@/types'

/**
 * `ensureReady()` waited for a profile that did not belong to the person signing in.
 *
 * Signing in does not go through `auth.signIn`. `Login.vue` deliberately calls
 * `requestSignInCode` so the password is checked server-side and a six-digit code, where
 * an account has one, cannot be skipped by minting a session in the browser. So the
 * session is written by that call, `onAuthStateChange` fires, and the store starts
 * loading the new profile with `void loadProfile(...)` - unawaited.
 *
 * `completeSignIn()` then ran `await auth.ensureReady()` and read `homePath` straight
 * afterwards. `ensureReady` reloaded the profile only `if (!profile.value)`, which cannot
 * tell "the fetch has not finished" from "the profile on hand belongs to the previous
 * account". Signing in while already signed in - a shared machine, or switching accounts
 * without signing out - is the second case: `profile.value` is the outgoing student's,
 * so `ensureReady` returned immediately without waiting for anybody.
 *
 * The router then resolved `homePath` from the *previous* user's role. Measured, an
 * instructor signing in over a student landed on `/student/dashboard`, and the guard
 * allowed it because that route genuinely admits students. What rendered was the student
 * dashboard - the previous student's enrolments, progress and grades - under the
 * instructor's own navigation, which had already switched over.
 *
 * So this pins the property that actually matters: after `ensureReady()` resolves, the
 * profile belongs to the current session's user. Not "a profile exists" - the right one.
 */

/** The outgoing student, whose profile is the one left in the store. */
const STUDENT: Profile = {
  id: 'student-1',
  role: 'student',
  fullName: 'Joren Lalamonan',
  email: 'joren@example.edu',
  avatarUrl: null,
  phone: null,
  bio: null,
  status: 'active',
  emailCodeSignIn: false,
} as Profile

/** The instructor signing in over the top. */
const INSTRUCTOR: Profile = {
  ...STUDENT,
  id: 'instructor-1',
  role: 'instructor',
  fullName: 'Jayzee Bautista',
  email: 'jayzee@example.edu',
} as Profile

type SessionListener = (event: string, session: unknown) => void

/** Captured by the `onAuthStateChange` mock so a test can drive a session change. */
let authListener: SessionListener | null = null

/**
 * Resolvers for `fetchProfileByUserId`, so a test can hold a fetch open and observe what
 * the store does while it is still in flight.
 */
let profileFetch: (userId: string) => Promise<Profile>

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    auth: {
      // No session on a fresh load, so the store starts signed out. Each test drives the
      // session through the captured auth listener instead.
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn((cb: SessionListener) => {
        authListener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      }),
    },
  },
  isSupabaseConfigured: true,
  FunctionTimeoutError: class extends Error {},
  invokeFunction: vi.fn(),
  readFunctionError: vi.fn(),
}))

vi.mock('@/services/profile.service', () => ({
  fetchProfileByUserId: vi.fn(async (userId: string) => profileFetch(userId)),
  setOwnEmailCodeSignIn: vi.fn(),
}))

// Both composables reach for a pinia store of their own. The auth store is the subject
// here, so they are stubbed out rather than made to work.
vi.mock('@/composables/useUnreadNotifications', () => ({
  useUnreadNotifications: () => ({ unread: { value: 0 }, refresh: vi.fn() }),
}))
vi.mock('@/composables/useUnreadMessages', () => ({
  useUnreadMessages: () => ({ unread: { value: 0 }, refresh: vi.fn() }),
}))

const { useAuthStore } = await import('./auth')

/** A session object shaped the way the store reads it: only `user.id` is used here. */
function sessionFor(userId: string) {
  return { user: { id: userId }, access_token: 'token', refresh_token: 'refresh' }
}

/**
 * Run `initialize()` so the store has subscribed to auth events.
 *
 * The subscription is created inside `initialize`, not when the store is defined, so
 * there is nothing to fire until `ensureReady()` has been called once. Without this the
 * test's session changes go nowhere and it asserts against a store that never saw them.
 */
async function boot(auth: ReturnType<typeof useAuthStore>): Promise<void> {
  await auth.ensureReady()
  expect(authListener).not.toBeNull()
}

/** Sign a user in the way the app does: the session changes, then the profile follows. */
async function signInAs(auth: ReturnType<typeof useAuthStore>, userId: string): Promise<void> {
  authListener?.('SIGNED_IN', sessionFor(userId))
  await auth.ensureReady()
}

beforeEach(() => {
  setActivePinia(createPinia())
  authListener = null
  profileFetch = async (userId: string) => (userId === STUDENT.id ? STUDENT : INSTRUCTOR)
})

describe('ensureReady with a profile from another account', () => {
  it('loads the profile of the user who is actually signed in', async () => {
    const auth = useAuthStore()
    await boot(auth)

    // The outgoing student is signed in and their profile is loaded.
    await signInAs(auth, STUDENT.id)
    expect(auth.profile?.id).toBe(STUDENT.id)
    expect(auth.homePath).toBe('/student/dashboard')

    // The instructor signs in over the top. The store writes the new session and starts
    // loading the new profile, unawaited - so for a moment `profile` is still the
    // student's while `session` is already the instructor's. That window is the bug.
    profileFetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      return INSTRUCTOR
    }
    authListener?.('SIGNED_IN', sessionFor(INSTRUCTOR.id))

    await auth.ensureReady()

    // The point of the fix: the profile is the instructor's, not merely *a* profile.
    expect(auth.profile?.id).toBe(INSTRUCTOR.id)
  })

  it('routes the new account to its own home, not the previous one', async () => {
    const auth = useAuthStore()
    await boot(auth)
    await signInAs(auth, STUDENT.id)

    profileFetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      return INSTRUCTOR
    }
    authListener?.('SIGNED_IN', sessionFor(INSTRUCTOR.id))

    await auth.ensureReady()

    // This is what the router acts on. Before the fix it still read 'student' here, and
    // the instructor was sent to /student/dashboard and shown the student's work.
    expect(auth.role).toBe<Role>('instructor')
    expect(auth.homePath).toBe('/instructor/dashboard')
  })

  it('does not refetch when the profile already belongs to this session', async () => {
    const auth = useAuthStore()
    await boot(auth)
    const fetchSpy = vi.fn(async (userId: string) => (userId === STUDENT.id ? STUDENT : INSTRUCTOR))
    profileFetch = fetchSpy

    await signInAs(auth, STUDENT.id)
    const afterFirst = fetchSpy.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)

    await auth.ensureReady()

    // A second call on the same session is already satisfied and must stay quiet, or
    // every navigation would refetch the profile.
    expect(fetchSpy.mock.calls.length).toBe(afterFirst)
    expect(auth.profile?.id).toBe(STUDENT.id)
  })

  it('reports no profile rather than inventing one when the fetch fails', async () => {
    const auth = useAuthStore()
    await boot(auth)
    profileFetch = async () => {
      throw new Error('network down')
    }

    await signInAs(auth, INSTRUCTOR.id)

    // A genuine absence is left as null, which is what the guard's own handling expects.
    // The point is that it is null rather than the previous account's profile.
    expect(auth.profile).toBeNull()
    expect(auth.role).toBeNull()
  })
})

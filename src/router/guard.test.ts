import { describe, expect, it, vi } from 'vitest'
import type { Role } from '@/types'
/**
 * `createWebHistory` reads `window` when `router/index.ts` is imported and jsdom is not a
 * dependency here, so the history implementation is swapped for the memory one. Only the
 * router *instance* needs this; `resolveRoleRedirect` is a pure function and is exercised
 * directly below.
 */
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: () => actual.createMemoryHistory() }
})

const { default: router, resolveRoleRedirect, ROLE_HOME } = await import('./index')

/**
 * Where the route guard sends a navigation, and the one property it got wrong.
 *
 * A pure function rather than the guard itself, because the guard needs `window.history`
 * and `document` and Vue Router, and the bug this exists to pin down is a property of the
 * destination this function returns: it must be a route the guard would also allow.
 *
 * The guard used to read
 *
 *     if (to.meta.roles && auth.role && !to.meta.roles.includes(auth.role))
 *
 * The `auth.role &&` clause made an unknown role evaluate that false, so the navigation was
 * allowed through - a fail-open. Failing closed by redirecting to `auth.homePath` was worse:
 * `homePath` returns `/student/dashboard` for a null role, that route declares
 * `roles: ['student']`, and the guard refused its own redirect target and redirected again.
 *
 * Vue Router only abandons a redirect cycle after thirty hops, and only when
 * `process.env.NODE_ENV !== 'production'`. In a production bundle the recursion runs until
 * the tab stops responding, and `main.ts` mounts without awaiting `router.isReady()`, so
 * nothing throws and no route ever resolves. A frozen application with no error.
 */

describe('a route that declares no roles', () => {
  it('is allowed for every role, and for no role', () => {
    expect(resolveRoleRedirect(undefined, 'student')).toBeUndefined()
    expect(resolveRoleRedirect(undefined, 'admin')).toBeUndefined()
    expect(resolveRoleRedirect(undefined, null)).toBeUndefined()
  })
})

describe('a route that lists roles', () => {
  it('is allowed when the caller holds one of them', () => {
    expect(resolveRoleRedirect(['student'], 'student')).toBeUndefined()
    expect(resolveRoleRedirect(['student', 'instructor'], 'instructor')).toBeUndefined()
  })

  it("sends a wrong role to that role's own home", () => {
    // `ROLE_HOME[role]` is derived from the role, so the destination is a route for a role
    // we actually know.
    expect(resolveRoleRedirect(['admin'], 'student')).toBe(ROLE_HOME.student)
    expect(resolveRoleRedirect(['student'], 'admin')).toBe(ROLE_HOME.admin)
    expect(resolveRoleRedirect(['student'], 'instructor')).toBe(ROLE_HOME.instructor)
  })
})

describe('a null role - signed in, profile not loaded', () => {
  it('is refused rather than allowed through', () => {
    // The fail-open this replaces: with the old `auth.role &&` clause this was `undefined`,
    // meaning "carry on", and a user whose profile failed to load reached the admin shell.
    expect(resolveRoleRedirect(['admin'], null)).not.toBeUndefined()
  })

  it('goes to the profile, not to a dashboard', () => {
    // `homePath` for a null role is `/student/dashboard`, and that route declares
    // `roles: ['student']` - so the guard refused its own redirect target. A name that
    // cannot be role-gated is the whole point.
    expect(resolveRoleRedirect(['admin'], null)).toEqual({ name: 'profile' })
  })

  it('is the same answer whichever gated route was asked for', () => {
    const routes: Role[][] = [['admin'], ['student'], ['instructor']]
    const answers = routes.map((roles) => JSON.stringify(resolveRoleRedirect(roles, null)))
    expect(new Set(answers).size).toBe(1)
  })
})

describe('the loop this exists to prevent', () => {
  /**
   * The real property, checked against the real route table.
   *
   * A snapshot of one route would pass today and fail the day somebody role-gates a
   * dashboard. This reads each `ROLE_HOME` entry's own `meta.roles` out of the router and
   * asks the resolver whether that role may go there - which is exactly the question the
   * guard will ask on arrival.
   */
  it('sends every role only to a route that role may itself use', () => {
    for (const role of ['student', 'instructor', 'admin'] as const) {
      const home = ROLE_HOME[role]
      const meta = router.resolve(home).meta.roles as Role[] | undefined

      expect(meta, `${home} declares no meta.roles`).toBeDefined()
      expect(
        resolveRoleRedirect(meta, role),
        `${role} is sent to ${home}, which declares roles ${JSON.stringify(meta)} - the guard will refuse its own redirect target`,
      ).toBeUndefined()
    }
  })

  it('does not send an unknown role to any role home', () => {
    const to = resolveRoleRedirect(['student', 'instructor', 'admin'], null)
    expect(Object.values(ROLE_HOME)).not.toContain(to)
  })

  it('sends an unknown role somewhere the guard would also allow', () => {
    const to = resolveRoleRedirect(['admin'], null)
    expect(to).toEqual({ name: 'profile' })

    // Asked about the destination's own meta, a null role is let through.
    const destination = router.resolve({ name: 'profile' as never })
    expect(resolveRoleRedirect(destination.meta.roles as Role[] | undefined, null)).toBeUndefined()
  })
})

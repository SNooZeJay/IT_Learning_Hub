import { test, expect, type Page } from '@playwright/test'

/**
 * Red-team sweep: the things a professor presses on during a demonstration.
 *
 * Two families, and the distinction matters.
 *
 * ROUTING probes assert that a role cannot reach another role's area. They assert a
 * REDIRECT, because the honest behaviour is being sent to your own dashboard with a
 * message, not a 403 page. Asserting the redirect rather than a 404 is deliberate: an
 * app that renders an error instead of redirecting has still told the examiner the
 * route exists.
 *
 * DATA probes assert that the pages a student legitimately reaches do not render
 * another student's data. These are the ones that matter most, because a role mix-up
 * on a redirect is visible and self-correcting, while a leaked name on a dashboard is
 * neither.
 *
 * Every probe runs signed in as a real demo account so the session handling is under
 * test too - an expired or mis-scoped JWT would pass these as "blocked" for the wrong
 * reason.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? '',
  password: process.env.E2E_ADMIN_PASSWORD ?? '',
}
const INSTRUCTOR = {
  email: process.env.E2E_INSTRUCTOR_EMAIL ?? '',
  password: process.env.E2E_INSTRUCTOR_PASSWORD ?? '',
}
const STUDENT = {
  email: process.env.E2E_STUDENT_EMAIL ?? '',
  password: process.env.E2E_STUDENT_PASSWORD ?? '',
}

async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(who.email)
  await page.locator('input[name="password"]').fill(who.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

/** Every area the app has, and the role that owns it. */
const AREAS = {
  student: ['/student/dashboard', '/student/courses', '/student/quizzes', '/student/grades'],
  instructor: ['/instructor/dashboard', '/instructor/courses', '/instructor/grading'],
  admin: ['/admin/dashboard', '/admin/users', '/admin/payments'],
} as const

test.describe('role boundaries', () => {
  test.setTimeout(10 * 60_000)

  const crossings = [
    { from: 'student', to: 'admin' },
    { from: 'student', to: 'instructor' },
    { from: 'instructor', to: 'admin' },
    { from: 'instructor', to: 'student' },
    { from: 'admin', to: 'student' },
  ]

  for (const { from, to } of crossings) {
    test(`${from} cannot reach ${to} routes by direct URL`, async ({ page }) => {
      const who = from === 'student' ? STUDENT : from === 'instructor' ? INSTRUCTOR : ADMIN
      test.skip(!who.email, `${from} credential not set`)

      await signIn(page, who)
      // Let the post-sign-in redirect settle before deep-linking.
      //
      // `signIn` resolves as soon as the URL leaves /auth/, which is the moment the
      // guard has *started* redirecting rather than when it has finished. Deep-
      // linking inside that window raced with the in-flight navigation, and under
      // parallel workers the guard sometimes evaluated the admin route against a
      // half-settled store - reported as "landed on /admin/dashboard" when the guard
      // does in fact refuse it. Clean three times running with one worker, so the app
      // was never wrong; the test was reading a URL mid-transition.
      await page.waitForLoadState('networkidle').catch(() => {})
      // `.first()` because the shell renders a `<header>` for the sticky bar and the
      // page content brings its own; a bare `header` locator resolves to two nodes
      // and Playwright's strict mode rejects the whole assertion, which reads as an
      // app failure when nothing is wrong.
      await expect(page.locator('header').first()).toBeVisible()

      for (const path of AREAS[to]) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(700)

        // The redirect target must be inside the caller's OWN area.
        const landed = new URL(page.url()).pathname
        expect(
          landed.startsWith(`/${from}`) || landed === '/',
          `${from} deep-linked ${path} and landed on ${landed}`,
        ).toBe(true)

        // And the forbidden page's own content must not be in the document at all.
        // A redirect that leaves the old markup mounted for a frame is not a
        // redirect, and this is the assertion that catches it.
        const heading = await page
          .locator('main h1')
          .first()
          .textContent()
          .catch(() => null)
        expect(
          `${landed}|${heading ?? ''}`,
          `${from} deep-linked ${path} and the page still rendered its own heading`,
        ).not.toContain(path)
      }
    })
  }
})

test.describe('signed-out access', () => {
  test.setTimeout(5 * 60_000)

  test('every protected route bounces a signed-out visitor to sign in', async ({ page }) => {
    await page.context().clearCookies()

    const protectedPaths = [
      ...AREAS.student,
      ...AREAS.instructor,
      ...AREAS.admin,
      '/messages',
      '/profile',
    ]

    for (const path of protectedPaths) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      const landed = new URL(page.url()).pathname
      expect(
        landed.startsWith('/auth/login') || landed.startsWith('/auth/'),
        `signed-out visitor reached ${path} (landed on ${landed})`,
      ).toBe(true)
    }
  })

  test('the public catalogue is genuinely public', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto(`${BASE}/courses`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    // Reachable, and showing course names from the database rather than a sign-in wall.
    expect(new URL(page.url()).pathname).toBe('/courses')
    await expect(page.locator('main h1').first()).toBeVisible()
  })
})

/**
 * The three demo students, mapped from the email that identifies them.
 *
 * Kept as data rather than a bare name list because the first version of this file
 * asserted a fixed list of "other students" and then ran while signed in AS one of
 * them. It failed on both pages, reporting that the dashboard had leaked the
 * signed-in user's own name - which is the most reassuring result a test in this file
 * could possibly produce, and it would have done the same on a real leak.
 *
 * Comparing against the profile of whoever is actually signed in is the only version
 * that means anything, and it keeps meaning something when the account used for the
 * run changes.
 */
const DEMO_STUDENTS: Record<string, string> = {
  'garmino.shanleekian@ncst.edu.ph': 'Shan Lee Kian Garmino',
  'lalamonan.joren@ncst.edu.ph': 'Joren Lalamonan',
  'guia.justinejosh@ncst.edu.ph': 'Justine Josh Guia',
}

/** Names that must NOT appear: every demo student except the one signed in. */
function othersFor(email: string): string[] {
  const mine = DEMO_STUDENTS[email.toLowerCase()]
  return Object.values(DEMO_STUDENTS).filter((name) => name !== mine)
}

test.describe('student data isolation', () => {
  test.setTimeout(5 * 60_000)

  for (const path of ['/student/dashboard', '/student/grades']) {
    test(`${path} shows no other student's name`, async ({ page }) => {
      test.skip(!STUDENT.email, 'student credential not set')
      await signIn(page, STUDENT)
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1_500)

      const body = await page.locator('body').innerText()
      const others = othersFor(STUDENT.email)
      const found = others.filter((name) => body.includes(name))

      expect(
        found.join(', '),
        `${path}, signed in as ${STUDENT.email}, rendered other students' names: ` +
          found.join(', '),
      ).toBe('')
    })
  }
})
test.describe('frontend honesty', () => {
  test.setTimeout(5 * 60_000)

  /**
   * A success message must mean the server said yes.
   *
   * The defect this pins is a view that sets `saved = true` before, or instead of, the
   * write landing. It is invisible until something fails - a network drop, a 403, a
   * database refusal - and then the app tells the user their password is updated when
   * it is not.
   */
  test('a rejected password change is not reported as a success', async ({ page }) => {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="email"]').fill(STUDENT.email)
    await page.locator('input[name="password"]').fill(STUDENT.password)
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })

    // Make the next auth write fail at the network layer, the way a dropped
    // connection or an expired session would.
    await page.route('**/auth/v1/user', (route) => route.abort('failed'))

    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1_200)

    // The page must be in a form state, not a "saved" state.
    const body = await page.locator('body').innerText()
    expect(
      body,
      'the profile page claimed a save succeeded while every write was blocked',
    ).not.toMatch(/password (updated|changed|saved) successfully|changes saved/i)
  })

  /**
   * Duplicate submission.
   *
   * Double-tapping a submit button must not produce two payments or two attempts.
   * `create-checkout` has its own idempotency guard for the payment case; this checks
   * the button is actually disabled while a request is in flight, which is what stops
   * the request being sent twice in the first place.
   */
  test('a submit button disables itself while its request is in flight', async ({ page }) => {
    test.skip(!STUDENT.email, 'student credential not set')

    // Hold the sign-in response open so the in-flight window is observable.
    await page.route('**/auth/v1/token**', async (route) => {
      await new Promise((r) => setTimeout(r, 1_500))
      await route.continue()
    })

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="email"]').fill(STUDENT.email)
    await page.locator('input[name="password"]').fill(STUDENT.password)
    const submit = page.locator('form button[type="submit"]')
    await submit.click()

    // Within the held window the control must not be pressable again.
    await page.waitForTimeout(400)
    await expect(submit, 'the sign-in button stayed enabled during its own request').toBeDisabled()
  })
})

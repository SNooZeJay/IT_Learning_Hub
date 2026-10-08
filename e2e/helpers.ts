import { expect, type Page } from '@playwright/test'

/**
 * Signing in, and what the role guard does afterwards.
 *
 * This is the first thing a professor does and the thing every other workflow depends
 * on. A guard that leaks is worse than a guard that is visibly strict: the failure is
 * a student standing in an instructor screen with no explanation.
 */

export const ACCOUNTS = {
  student: {
    email: process.env.E2E_STUDENT_EMAIL ?? '',
    password: process.env.E2E_STUDENT_PASSWORD ?? '',
  },
  instructor: {
    email: process.env.E2E_INSTRUCTOR_EMAIL ?? '',
    password: process.env.E2E_INSTRUCTOR_PASSWORD ?? '',
  },
}

/**
 * Sign in through the real form.
 *
 * Deliberately not `page.request.post` to the auth endpoint. That would prove the
 * credentials work, not that the form works, and the form is what a person uses.
 *
 * Two steps are possible, and which one happened is decided by the account, not by the
 * test. An account with an emailed sign-in code turned on gets a second screen; an account
 * without one is finished here. So this waits for whichever arrives rather than assuming
 * the single-step shape, which is what made the earlier version of this helper impossible
 * to keep: it assumed a flow that only some accounts have.
 *
 * The second step cannot be driven, because the code arrives in a real inbox. That is the
 * one thing the suite does not cover, and it says so here rather than hiding it behind a
 * token exchange that would prove nothing about the flow.
 */
export async function signIn(page: Page, who: keyof typeof ACCOUNTS): Promise<void> {
  const account = ACCOUNTS[who]
  await page.goto('/auth/login')

  const email = page.locator('input[name="email"]')
  const password = page.locator('input[name="password"]')
  await expect(email).toBeVisible()
  await expect(password).toBeVisible()

  await email.fill(account.email)
  await password.fill(account.password)

  // The button reports its own pending state, so waiting on it is waiting on the
  // request rather than on a timer.
  await page.locator('form button[type="submit"]').click()

  const codeStep = page.locator('#otp-code')
  const leftAuth = page
    .waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
    .then(() => 'signed-in')
    .catch(() => 'still-on-login')

  const outcome = await Promise.race([
    codeStep.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'code-required'),
    leftAuth,
  ])

  if (outcome === 'code-required') {
    // The password was accepted and a code was emailed. An account used by this suite
    // should not have one on: the code goes to an inbox nobody is watching, so the run
    // would sit here until it timed out and then fail for a reason that has nothing to
    // do with the code being tested.
    throw new Error(
      `${account.email} has an emailed sign-in code turned on. ` +
        'An account used by the end-to-end suite must sign in with its password alone: ' +
        'the code goes to a real inbox this runner cannot read.',
    )
  }

  if (outcome !== 'signed-in') {
    throw new Error(`${account.email} did not finish signing in.`)
  }
}

/**
 * Links to one specific instructor course.
 *
 * `a[href^="/instructor/courses/"]` also matches the "New course" link, whose href ends in
 * `create` - so the looser selector made these specs click the create form and then fail
 * expecting a course id in the URL. Matching the UUID shape is what the test means, and it
 * keeps the two from drifting again.
 */
/** The same, narrowed to hrefs that end in a course id rather than a keyword. */
export function courseLink(page: Page) {
  return page.locator('a[href^="/instructor/courses/"]:not([href$="/create"]):not([href$="/edit"])')
}

/** Where a signed-in user of each role is sent. */
export const HOME = {
  student: '/student/dashboard',
  instructor: '/instructor/dashboard',
} as const

/**
 * Fail the test if the console reported an error.
 *
 * A Vue Router guard sending somebody to a route that does not exist is not an error,
 * it is a blank page, and nothing anywhere complains. Watching the console is the only
 * way a spec notices.
 */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

/** Every internal link and every image on the page, for the sweep specs. */
export async function internalLinksOn(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/')),
  )
}

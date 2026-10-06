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
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
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

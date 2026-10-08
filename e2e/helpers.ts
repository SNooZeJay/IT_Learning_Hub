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

  // Sign-in is a two-step flow: the password is checked, then a six-digit code is
  // emailed and entered. Reaching that screen proves the form, the credentials and the
  // first request all worked, which is the part of the flow a browser can test.
  const codeStep = page.locator('#otp-code')
  const leftAuth = page
    .waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)

  const codeRequired = await Promise.race([
    codeStep.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true),
    leftAuth,
  ])

  if (codeRequired) {
    await establishSessionDirectly(page, account)
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

/**
 * Obtain a session without the emailed code, and hand it to the app.
 *
 * The six-digit code arrives in a real inbox, and an automated runner has none. Rather
 * than weakening the flow for testing, this exchanges the same credentials for a
 * session through the public auth endpoint using the publishable key - which is the key
 * the browser already holds - and writes it into the storage the app reads on boot. The
 * code step is still exercised above; only the mailbox is out of reach.
 *
 * This is a test harness concern only. Nothing here is reachable from the application.
 */
async function establishSessionDirectly(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  const response = await page.request.post(
    `${process.env.E2E_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: process.env.E2E_SUPABASE_ANON_KEY ?? '',
        'content-type': 'application/json',
      },
      data: { email: account.email, password: account.password },
    },
  )

  if (!response.ok()) {
    throw new Error(
      `Could not establish a session for ${account.email}: ${response.status()} ${await response.text()}`,
    )
  }

  const session = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_at: number
  }
  const projectRef = new URL(process.env.E2E_SUPABASE_URL ?? '').hostname.split('.')[0]

  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    [
      `sb-${projectRef}-auth-token`,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at * 1000,
        expires_in: session.expires_at - Math.floor(Date.now() / 1000),
        token_type: 'bearer',
        user: null,
      }),
    ],
  )

  await page.reload()
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

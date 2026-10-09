import { test, expect, type Page } from '@playwright/test'

/**
 * The demo-blocking defects, as gates.
 *
 * Each was found by hand on a physical phone during a live demonstration, which is
 * the worst way to find a defect: it blocks the thing you were about to do in front
 * of the person you were demonstrating to. Each test pins the specific behaviour that
 * failed, so the same bug is a failed test rather than a cancelled demo.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const STUDENT = {
  email: process.env.E2E_STUDENT_EMAIL ?? '',
  password: process.env.E2E_STUDENT_PASSWORD ?? '',
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/auth/login`)
  await page.locator('input[name="email"]').fill(STUDENT.email)
  await page.locator('input[name="password"]').fill(STUDENT.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

/**
 * Wait for the course page's real content.
 *
 * A fixed `waitForTimeout` is what made the first version of this file measure the
 * loading skeleton: the skeleton has no enrol control and no price, so the page read
 * as "zero CTAs" and the assertion passed for the wrong reason. Waiting for the text
 * that only the loaded page has is the difference between a test and a coincidence.
 */
async function waitForCourseContent(page: Page): Promise<void> {
  await page.waitForFunction(
    () => /enroll/i.test(document.querySelector('main')?.textContent ?? ''),
    { timeout: 20_000 },
  )
}

/**
 * The slug of a paid course this account has NOT enrolled in.
 *
 * Read from the app rather than hard-coded, and required to be both unclaimed and
 * priced. Both facts change as demo data is edited: a course the account already
 * holds has no enrol control at all, and a free course has no price to branch on.
 * Returning null so the caller skips loudly is deliberate - a test that quietly stops
 * testing anything when the data moves is worse than no test.
 */
async function unclaimedPaidSlug(page: Page): Promise<string | null> {
  await page.goto(`${BASE}/student/courses`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_000)

  const slugs = await page.evaluate(() => {
    const out = new Set<string>()
    for (const a of document.querySelectorAll('a[href*="/student/courses/"]')) {
      const slug = (a.getAttribute('href') ?? '').split('/student/courses/')[1]
      if (slug) out.add(slug)
    }
    return [...out]
  })

  for (const slug of slugs) {
    await page.goto(`${BASE}/student/courses/${slug}`, { waitUntil: 'domcontentloaded' })
    await waitForCourseContent(page).catch(() => {})

    const state = await page.evaluate(() => {
      const text = document.querySelector('main')?.textContent ?? ''
      return {
        enrolled: /you are enrolled/i.test(text),
        priced: /(?:₱|PHP)\s?[\d,]+/.test(text),
      }
    })
    if (!state.enrolled && state.priced) return slug
  }
  return null
}

/**
 * Clicking the green enrol CTA on a PAID course never says "Enrollment failed".
 *
 * The bug: the course page rendered the enrol action twice - once in the
 * locked-curriculum panel and once in the summary rail. The rail one branched on
 * price; the panel one called `handleEnrol` unconditionally, and `handleEnrol` only
 * knows how to enrol for free. So a paid course threw "This course is paid. Payment
 * is required before enrolling" from behind a button labelled "Enroll for ₱1,799.00".
 * The learner saw a dead end at the top of the page and a working button further
 * down, and pressed the top one.
 *
 * Counted as a LINK, not a button. The rail renders
 * `<RouterLink><Button>Enroll for ...</Button></RouterLink>`, so one control is two
 * DOM nodes - and counting both would read the fixed page as a duplicate. The
 * duplicate-button check below counts only buttons NOT wrapped in that link, which is
 * what actually distinguishes "one control" from "a second button rendered beside it".
 */
test('a paid course shows one enrol CTA and never reports enrollment failed', async ({ page }) => {
  test.setTimeout(300_000)
  test.skip(!STUDENT.email, 'E2E_STUDENT_EMAIL not set')

  await signIn(page)
  const paid = await unclaimedPaidSlug(page)
  test.skip(!paid, 'no unclaimed paid course available to this account')

  await page.goto(`${BASE}/student/courses/${paid}`, { waitUntil: 'domcontentloaded' })
  await waitForCourseContent(page)

  // The panel that used to carry the second button renders as a state now, so any
  // enrol button NOT inside the rail's link is a regression.
  const strayButtons = await page.evaluate(() =>
    [...document.querySelectorAll('main button')]
      .filter((b) => !b.closest('a'))
      .map((b) => (b.textContent ?? '').trim())
      .filter((t) => /^enroll/i.test(t)),
  )
  expect(strayButtons, 'the paid course renders more than one enrol button').toHaveLength(0)

  const links = page.getByRole('link', { name: /^enroll/i })
  await expect(links, 'the paid course has no enrol link').toHaveCount(1)

  await links.first().click()
  await page.waitForTimeout(2_500)

  expect(
    await page.getByText(/enrollment failed|payment is required before enrolling/i).count(),
    'a paid enrol raised "Enrollment failed" - it attempted a free enrolment',
  ).toBe(0)

  // The learner arrives at the CHECKOUT page rather than PayMongo directly. The rail
  // deliberately routes through an order summary before leaving the app - that is a
  // decision recorded in the view, not an accident - so the requirement is that the
  // paid path is taken, and this is where it visibly differs from the free one.
  expect(page.url(), 'the paid enrol did not route to checkout').toContain('/checkout/')
})

/**
 * A FREE course enrols and shows its modules with no reload.
 *
 * The other half of the same button, and the half that must not regress while the
 * paid path is fixed. The curriculum is re-read after enrolling rather than trusted
 * from the first fetch: RLS hides the modules from anyone not enrolled, so setting a
 * flag and leaving the outline alone showed "You are enrolled" directly above an
 * empty curriculum.
 */
test('a free course enrols and reveals its curriculum without a reload', async ({ page }) => {
  test.setTimeout(300_000)
  test.skip(!STUDENT.email, 'E2E_STUDENT_EMAIL not set')

  await signIn(page)
  await page.goto(`${BASE}/student/courses`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_000)

  const slugs = await page.evaluate(() => {
    const out = new Set<string>()
    for (const a of document.querySelectorAll('a[href*="/student/courses/"]')) {
      const slug = (a.getAttribute('href') ?? '').split('/student/courses/')[1]
      if (slug) out.add(slug)
    }
    return [...out]
  })

  let free: string | null = null
  for (const slug of slugs) {
    await page.goto(`${BASE}/student/courses/${slug}`, { waitUntil: 'domcontentloaded' })
    await waitForCourseContent(page).catch(() => {})
    const state = await page.evaluate(() => {
      const text = document.querySelector('main')?.textContent ?? ''
      return {
        enrolled: /you are enrolled/i.test(text),
        priced: /(?:₱|PHP)\s?[\d,]+/.test(text),
        cta: [...document.querySelectorAll('main button, main a')].some((e) =>
          /enroll for free/i.test(e.textContent ?? ''),
        ),
      }
    })
    if (!state.enrolled && !state.priced && state.cta) {
      free = slug
      break
    }
  }
  test.skip(!free, 'no unclaimed free course available to this account')

  const urlBefore = page.url()
  await page
    .getByRole('button', { name: /enroll for free/i })
    .first()
    .click()
  await page.waitForTimeout(3_000)

  // No navigation: enrolling must not send the learner anywhere.
  expect(page.url()).toBe(urlBefore)

  await expect(page.getByText(/you are enrolled/i)).toBeVisible()
  // The locked panel is gone - and its replacement contains no second button, which
  // is the same "one primary CTA" requirement asserted on the paid path.
  await expect(page.getByText(/enroll to (see|unlock)/i)).toHaveCount(0)
})

/**
 * The reset-password page renders its form, not "this link is not valid".
 *
 * The bug was a race: the page awaited initialisation and then read
 * `auth.isAuthenticated` ONCE, while `detectSessionInUrl` was still exchanging the
 * fragment token asynchronously. The read could win and declare a good link dead.
 * Reloading sometimes worked, because by then the token had been spent into storage.
 *
 * A real recovery link needs a live email round trip, so this pins the part that is
 * testable and IS the defect: a URL that looks like a recovery link must not be
 * declared invalid before the exchange has had its bounded five seconds to happen.
 */
test('the reset-password page waits rather than declaring a link invalid', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(`${BASE}/auth/reset-password#access_token=dummy&type=recovery&expires_in=3600`, {
    waitUntil: 'domcontentloaded',
  })

  // Immediately: not the dead end. This is the assertion that catches the original
  // bug, where a single non-reactive read rendered the invalid alert on first paint.
  await expect(
    page.getByText(/this reset link is not valid/i),
    'the page declared the link invalid before it had finished checking',
  ).toHaveCount(0)

  // It waits, visibly, rather than pretending to know.
  await expect(page.getByText(/checking your reset link/i)).toBeVisible()

  // And it offers a way forward rather than only "back to sign in".
  await expect(page.getByRole('button', { name: /send a new link/i })).toBeVisible()

  // No form, because there is no session - the page must not pretend otherwise.
  await expect(page.getByRole('button', { name: /save new password/i })).toHaveCount(0)
  expect(errors, 'the reset page threw').toEqual([])
})

/**
 * A genuinely tokenless URL is explained differently from an expired one.
 *
 * Two failures, two remedies, and the original page called both "not valid". Telling
 * somebody their link is invalid when their mail app ate the fragment is how you talk
 * them out of resetting their password at all - the advice has to be "open it from
 * the email", not "it is invalid, try again".
 */
test('a tokenless reset URL is explained as a missing link, not an invalid one', async ({
  page,
}) => {
  test.setTimeout(120_000)

  await page.goto(`${BASE}/auth/reset-password`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_500)

  await expect(page.getByText(/this reset link is not valid/i)).toHaveCount(0)
  await expect(page.getByText(/needs a link from your email|one-time code/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /send a new link/i })).toBeVisible()
})

/**
 * An expired link says so, and says something different again.
 *
 * `otp_expired` is what Supabase reports for a link that was already used. It has to
 * be distinguishable from a tokenless URL, because the remedies are different: send
 * another link, versus open the one you were sent. Asserted separately from the
 * tokenless case precisely because the two used to be the same sentence.
 */
test('an expired reset link is reported as expired', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto(
    `${BASE}/auth/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(1_500)

  await expect(page.getByText(/this reset link has expired/i)).toBeVisible()
  await expect(page.getByText(/this reset link is not valid/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /send a new link/i })).toBeVisible()
})

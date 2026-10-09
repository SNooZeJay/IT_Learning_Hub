import { test, expect } from '@playwright/test'

/**
 * The three mobile-header failures, as gates.
 *
 * All three were reported by hand, from screenshots, on a physical phone - which
 * means each was found once and then had to be remembered. The responsive sweep in
 * `responsive-audit.spec.ts` measures overflow across every route; none of these are
 * overflow. The ⋮ button was on screen and in the wrong place, the panel it opened
 * was in flow rather than anchored, and the drawer simply stayed open. A measurement
 * cannot see any of them, so they need assertions.
 *
 * Each one is asserted by geometry rather than by class name, because the classes
 * were what changed and they will change again - what must not change is that the
 * control is inside the viewport and that the panel covers the page.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const MOBILE = { width: 375, height: 667 }

const ACCOUNTS = {
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
 * The header's overflow trigger.
 *
 * Matched on the exact accessible name rather than a substring, because `UserMenu`
 * offers a button whose label also contains "account menu" ("Account menu for
 * Joren"). A substring matched both and Playwright's strict mode rejected the
 * locator - which is the right outcome, and a sign the selector needed to be more
 * specific rather than more forgiving.
 */
const overflowButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^(Show|Hide) account menu$/ })

async function signIn(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${BASE}/auth/login`)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

/**
 * The ⋮ button's right edge is inside the viewport.
 *
 * "Inside the viewport" rather than "pinned to the right" on purpose. The real
 * requirement is that it can be pressed and that nothing is pushed off the screen;
 * how much air sits to its left is a design decision, not a correctness one. This
 * catches the reported bug - the control sitting mid-row because a sibling's
 * `flex-1` absorbed the slack - without also demanding a specific gutter.
 */
test('the overflow button sits inside the viewport at 375px', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize(MOBILE)

  const account = ACCOUNTS.student
  test.skip(!account.email, 'E2E_STUDENT_EMAIL not set')

  await signIn(page, account.email, account.password)
  await page.waitForTimeout(500)

  const button = overflowButton(page)
  await expect(button).toBeVisible()

  const box = await button.boundingBox()
  expect(box, 'the overflow button has no box').not.toBeNull()

  const right = box!.x + box!.width
  // 1px of slack for sub-pixel rounding; anything more is the button hanging off
  // the edge, which is what made it untappable.
  expect(
    right,
    `overflow button right edge at ${right}px, viewport is ${MOBILE.width}px`,
  ).toBeLessThanOrEqual(MOBILE.width + 1)
  expect(box!.x, 'the overflow button starts off-screen').toBeGreaterThanOrEqual(0)

  // And the reachability requirement: a 24px target is hard to hit on a phone. The
  // project's own 24px floor is the guideline here - not this control's problem
  // alone, but a control that fails it is a control worth knowing about.
  expect(box!.width).toBeGreaterThanOrEqual(24)
  expect(box!.height).toBeGreaterThanOrEqual(24)
})

/**
 * Tapping ⋮ opens a panel that overlays the page.
 *
 * The old failure was not that no panel appeared. It appeared - in flow, below the
 * header, as a second row - which pushed the sticky bar taller and gave the menus
 * inside it no room. So the assertion is not "something became visible"; it is that
 * the panel is *positioned over* the content rather than *displacing* it. That is
 * what `top-full` plus `absolute` means, and it is measurable: the panel's top is at
 * the header's bottom edge, and the document does not grow taller when it opens.
 */
test('tapping the overflow button opens an anchored panel', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize(MOBILE)

  const account = ACCOUNTS.student
  test.skip(!account.email, 'E2E_STUDENT_EMAIL not set')

  await signIn(page, account.email, account.password)
  await page.waitForTimeout(500)

  const header = page.locator('header').first()
  const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight)

  const button = overflowButton(page)
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await button.click()

  const panel = page.locator('#app-header-account')
  await expect(panel).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')

  const headerBox = await header.boundingBox()
  const panelBox = await panel.boundingBox()
  expect(panelBox, 'the panel has no box').not.toBeNull()

  // Anchored under the header, not stacked after it. A couple of pixels of tolerance
  // for the `mt` on the dropdown inside, which is a different element.
  expect(panelBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 2)

  // The decisive one: the page must not have grown. In flow, the header takes the
  // panel's height as its own and the document gets taller.
  const heightAfter = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(
    heightAfter,
    `document grew from ${heightBefore} to ${heightAfter} - the panel is in flow, not anchored`,
  ).toBeLessThanOrEqual(heightBefore + 2)

  // The panel must fit the width of the screen it is on.
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(MOBILE.width + 1)

  // Escape closes it, and the listener has to come off with it.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
})

/**
 * Tapping a drawer nav item closes the drawer.
 *
 * The point of this one is the guard it exercises indirectly: the drawer is closed
 * from a `router.afterEach`, not from the nav item's click handler. So this test
 * cannot use the nav item's own click - that would pass even if the watcher were
 * deleted and only the click handler remained. It navigates by a *different* route:
 * pressing a nav item, and separately using the router through a link elsewhere on
 * the page.
 */
test('tapping a drawer nav item closes the drawer', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize(MOBILE)

  const account = ACCOUNTS.student
  test.skip(!account.email, 'E2E_STUDENT_EMAIL not set')

  await signIn(page, account.email, account.password)
  await page.waitForTimeout(500)

  const drawer = page.locator('#app-sidebar')
  const toggle = page.getByRole('button', { name: /navigation menu/i })

  // Open it.
  await toggle.click()
  await expect(drawer).toBeInViewport()

  // Scoped to `nav`, not to the whole drawer: the drawer's first link is the brand
  // link to `/`, and clicking that from the dashboard is a no-op navigation that
  // never fires `afterEach` - so the test would time out waiting for a URL change
  // that was never going to happen. `nav a` is the actual navigation.
  const navLink = drawer.locator('nav a[href]').first()
  const href = await navLink.getAttribute('href')
  expect(href, 'the drawer has no navigation link').toBeTruthy()
  expect(href, 'the first nav link is the logo, not a destination').not.toBe('/')

  await navLink.click()

  // Navigated...
  await page.waitForURL((url) => url.pathname === href, { timeout: 15_000 })
  // ...and the drawer is out of the way.
  await expect(drawer).not.toBeInViewport()
})

/**
 * The same, from a programmatic navigation.
 *
 * This is the half of the behaviour the click handler cannot cover, and it is the
 * half that actually broke: a drawer that closes when you tap a link it owns still
 * covers the page after a guard redirect, a programmatic push, or the back button.
 */
test('the drawer also closes on a navigation it did not trigger', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize(MOBILE)

  const account = ACCOUNTS.student
  test.skip(!account.email, 'E2E_STUDENT_EMAIL not set')

  await signIn(page, account.email, account.password)
  await page.waitForTimeout(500)

  const drawer = page.locator('#app-sidebar')
  const toggle = page.getByRole('button', { name: /navigation menu/i })

  await toggle.click()
  await expect(drawer).toBeInViewport()

  // No click on anything in the drawer. This is the router moving on its own, which
  // is what `afterEach` exists for.
  await page.evaluate(() => {
    // `history.pushState` alone does not fire `afterEach`; use the anchor a click
    // would have followed, dispatched from outside the drawer's subtree.
    const a = document.createElement('a')
    a.href = '/student/notifications'
    document.body.appendChild(a)
    a.click()
  })

  await page.waitForURL(/\/student\/notifications/, { timeout: 15_000 })
  await expect(drawer).not.toBeInViewport()
})

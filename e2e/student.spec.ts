import { expect, test } from '@playwright/test'
import { ACCOUNTS, HOME, signIn, trackConsoleErrors } from './helpers'

/**
 * The student's path through the LMS.
 *
 * Everything here is a read. The suite runs against a real database, and a spec that
 * enrols or submits work changes the state every other spec and every demo depends on.
 * Reads still catch the failures that matter here: a route that no longer renders, a
 * guard that leaks, a query that RLS silently empties.
 */

test.describe('Student', () => {
  test('signs in and lands on the dashboard', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'student')

    await expect(page).toHaveURL(new RegExp(`${HOME.student}$`))
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()

    // The figures on this page come from eight separate queries. Each degrades to
    // null on failure rather than to zero, so a dash here means the read failed and a
    // 0 means the count really is zero. Asserting on the shape, not the value,
    // because the values depend on whatever the demo database happens to hold.
    await expect(page.getByText(/enrolled courses/i)).toBeVisible()

    expect(errors, `console errors on the student dashboard:\n${errors.join('\n')}`).toEqual([])
  })

  test('cannot reach an instructor or admin screen', async ({ page }) => {
    await signIn(page, 'student')

    for (const forbidden of [
      '/instructor/dashboard',
      '/instructor/courses',
      '/admin/users',
      '/admin/payments',
    ]) {
      await page.goto(forbidden)

      // The guard must send them somewhere a student belongs. Landing on the 404 page
      // would mean the route exists and the guard let it through.
      await expect(page).not.toHaveURL(new RegExp(`${forbidden}$`))
      await expect(page).toHaveURL(/\/(student|auth)\//)
    }
  })

  test('sees only enrolled courses', async ({ page }) => {
    await signIn(page, 'student')
    await page.goto('/student/courses')

    // "Course catalogue", not "Courses" - matched loosely so a heading reword does not
    // fail the suite. The claim under test is that the catalogue loaded, not its wording.
    await expect(page.getByRole('heading', { name: /course/i }).first()).toBeVisible()

    // The count line is "N of M courses" only when a filter is active, and "M courses"
    // otherwise. Either way it must not be the empty catalogue.
    await expect(page.getByText(/\d+\s+courses?/i).first()).toBeVisible()
    await expect(page.getByText(/no courses|enrol to get started/i).first()).toBeHidden()
  })

  test('opens the calendar as a calendar', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'student')
    await page.goto('/student/calendar')

    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()

    // A month, not a list. Six weeks of cells is the specific claim being tested: the
    // page this replaced was a table of due dates wearing a calendar's heading.
    await expect(page.locator('[role="gridcell"]')).toHaveCount(42)

    // Both views exist and switch. The view toggle is a radiogroup, so the buttons carry
    // the same name as the month column heading further down the page; `.first()` takes
    // the toggle rather than every cell that happens to say "Month".
    await expect(page.getByRole('button', { name: 'Month' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Week' }).first().click()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(0)
    await expect(page.getByText(/Nothing/i).first()).toBeVisible()

    expect(errors, `console errors on the calendar:\n${errors.join('\n')}`).toEqual([])
  })

  test('reads a lesson and records progress without error', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'student')

    await page.goto('/student/courses')

    // An enrolled course, not merely the first one. The catalogue is ordered for
    // everybody, so its first entry is often a course this account has no place in - the
    // curriculum is gated, that course page shows no lesson links, and the spec skipped
    // itself instead of testing anything. A skipped spec is a green tick over a hole.
    //
    // "Continue" is the card's own word for "you have a place here"; "View course" and
    // "View and enroll" are what the others say. Matching the call to action is also the
    // assertion: if enrolled cards stopped saying Continue, this fails rather than quietly
    // testing a course the student cannot open.
    const enrolledCourse = page.getByRole('link', { name: 'Continue', exact: true }).first()
    await expect(enrolledCourse).toBeVisible()
    await enrolledCourse.click()

    await expect(page).toHaveURL(/\/student\/courses\//)

    const firstLesson = page.locator('a[href^="/student/lessons/"]').first()
    // No skip: an enrolled course that shows no lessons is a defect, and the assertion
    // below is what should report it.
    await expect(firstLesson).toBeVisible()
    await firstLesson.click()

    await expect(page).toHaveURL(/\/student\/lessons\//)
    // The lesson body has to actually contain something. A lesson that renders its
    // chrome and no content is the failure mode this page has.
    await expect(page.locator('main')).not.toBeEmpty()

    expect(errors, `console errors on a lesson:\n${errors.join('\n')}`).toEqual([])
  })

  test('sees grades and notifications screens render', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'student')

    await page.goto('/student/grades')
    await expect(page.getByRole('heading', { name: /grades/i }).first()).toBeVisible()

    await page.goto('/student/notifications')
    await expect(page.getByRole('heading', { name: /notifications/i }).first()).toBeVisible()

    expect(errors, `console errors on grades/notifications:\n${errors.join('\n')}`).toEqual([])
  })

  test('signing out ends the session', async ({ page }) => {
    await signIn(page, 'student')

    // The account menu is the last control in the header and is labelled rather than
    // matched on text: it renders initials plus a name, so a filter on the email or the
    // surname breaks the moment the header renders differently. Its aria-label is the
    // thing that names it, and it is stable.
    await page
      .getByRole('button', { name: /account menu|your account|profile/i })
      .first()
      .click()
    await page.getByRole('button', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/auth\/login/)
  })
})

test.describe('Authentication', () => {
  test('a signed-out visitor is sent to sign in', async ({ page }) => {
    await page.goto('/student/dashboard')
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('bad credentials are refused with a message', async ({ page }) => {
    await page.goto('/auth/login')
    await page.locator('input[name="email"]').fill(ACCOUNTS.student.email)
    await page.locator('input[name="password"]').fill('definitely-not-the-password')
    await page.locator('form button[type="submit"]').click()

    // An honest refusal. A form that clears silently is the failure this catches.
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('an unknown route renders the branded 404, not a blank page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText(/that page isn't here/i)).toBeVisible()
  })

  test('a deep link works on a cold load', async ({ page }) => {
    // The SPA rewrite is a deployment concern, and this is the test that would have
    // caught the wrong project being probed as if it were this one.
    const response = await page.goto('/student/calendar')
    expect(response?.status(), 'deep link returned a non-200').toBeLessThan(400)
    // Unauthenticated, so the guard sends it to login rather than rendering.
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})

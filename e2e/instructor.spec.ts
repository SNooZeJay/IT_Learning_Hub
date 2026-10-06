import { expect, test } from '@playwright/test'
import { HOME, signIn, trackConsoleErrors } from './helpers'

/**
 * The instructor's path through the LMS.
 *
 * Reads only, for the same reason as the student suite: these run against a real
 * database and the demo depends on its current contents.
 */

test.describe('Instructor', () => {
  test('signs in and lands on the dashboard', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'instructor')

    await expect(page).toHaveURL(new RegExp(`${HOME.instructor}$`))
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()

    expect(errors, `console errors on the instructor dashboard:\n${errors.join('\n')}`).toEqual([])
  })

  test('cannot reach student or admin screens', async ({ page }) => {
    await signIn(page, 'instructor')

    for (const forbidden of [
      '/student/dashboard',
      '/student/grades',
      '/admin/users',
      '/admin/settings',
    ]) {
      await page.goto(forbidden)
      await expect(page).not.toHaveURL(new RegExp(`${forbidden}$`))
      await expect(page).toHaveURL(/\/(instructor|auth)\//)
    }
  })

  test('lists only their own courses', async ({ page }) => {
    await signIn(page, 'instructor')
    await page.goto('/instructor/courses')

    await expect(page.getByRole('heading', { name: /my courses/i }).first()).toBeVisible()

    // Every course link must carry a course id, not a slug: the instructor route is
    // `courses/:id` while the student route is `courses/:slug` resolved from `:id`.
    // Linking one to the other produces a page that loads and shows nothing.
    const links = page.locator('a[href^="/instructor/courses/"]')
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href')
      const id = href?.split('/').pop() ?? ''
      expect(id, `course link "${href}" is not a uuid`).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    }
  })

  test('course authoring screen loads with its structure intact', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'instructor')
    await page.goto('/instructor/courses')

    const firstCourse = page.locator('a[href^="/instructor/courses/"]').first()
    await expect(firstCourse).toBeVisible()
    await firstCourse.click()

    await expect(page).toHaveURL(/\/instructor\/courses\/[0-9a-f-]{36}/)
    await expect(page.getByRole('heading').first()).toBeVisible()

    expect(errors, `console errors on a course page:\n${errors.join('\n')}`).toEqual([])
  })

  test('the quiz manager loads and exposes the authoring controls', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'instructor')
    await page.goto('/instructor/courses')

    const firstCourse = page.locator('a[href^="/instructor/courses/"]').first()
    await firstCourse.click()
    await expect(page).toHaveURL(/\/instructor\/courses\/[0-9a-f-]{36}/)

    // This is the screen that holds the answer key, so it is a separate page reached
    // deliberately rather than a panel on the course screen.
    const quizzesLink = page.locator('a[href$="/quiz"]').first()
    await expect(quizzesLink).toBeVisible()
    await quizzesLink.click()

    await expect(page).toHaveURL(/\/instructor\/courses\/[0-9a-f-]{36}\/quiz/)
    await expect(
      page.getByRole('button', { name: /add a question|new quiz|add question/i }).first(),
    ).toBeVisible()

    expect(errors, `console errors in the quiz manager:\n${errors.join('\n')}`).toEqual([])
  })

  test('the calendar shows a real grid for the instructor too', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'instructor')
    await page.goto('/instructor/calendar')

    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(42)

    expect(errors, `console errors on the instructor calendar:\n${errors.join('\n')}`).toEqual([])
  })

  test('grading and students screens render', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await signIn(page, 'instructor')

    await page.goto('/instructor/grading')
    await expect(page.getByRole('heading', { name: /grading/i }).first()).toBeVisible()

    await page.goto('/instructor/students')
    await expect(page.getByRole('heading', { name: /students/i }).first()).toBeVisible()

    expect(errors, `console errors on grading/students:\n${errors.join('\n')}`).toEqual([])
  })
})

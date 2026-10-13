import { test, expect } from '@playwright/test'

/**
 * A reload always lands at the top; back and forward keep their position.
 *
 * Regression pin: Vue Router persists the last restored scroll position into
 * history.state, so after back-navigating deep and hitting refresh the reload
 * landed mid-page (reproduced: deep at 2708 after reload). `resolveScrollPosition`
 * overrides only the reload case - this spec proves both halves in a browser.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

test('back restores the reading position, reload starts at the top', async ({ page }) => {
  test.setTimeout(300000)
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  await page.evaluate(() => window.scrollTo(0, 3000))
  await page.waitForTimeout(800)
  await page
    .locator('header a:has-text("Get Started"), a:has-text("Explore courses")')
    .first()
    .click()
  await page.waitForTimeout(2500)

  await page.goBack()
  await page.waitForTimeout(2500)
  const backY = Math.round(await page.evaluate(() => window.scrollY))
  expect(backY).toBeGreaterThan(1500)

  await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  const reloadY = Math.round(await page.evaluate(() => window.scrollY))
  expect(reloadY).toBeLessThan(100)
  expect(errs).toEqual([])
})

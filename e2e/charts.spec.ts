import { test, expect } from '@playwright/test'

/**
 * Charts must still draw after ApexCharts stopped being registered globally.
 *
 * `app.use(VueApexCharts)` was removed from `main.ts` so the library is no longer in
 * the entry chunk - it took the entry from 1.34MB to 378KB. That is only safe because
 * the three components that draw a chart import it themselves, and this is the check
 * that assumption holds: it renders each of them and asks the DOM for the SVG the
 * library produces.
 *
 * A chart library that fails to register renders an empty container and no error, so
 * asserting on the console alone would pass while the dashboard showed nothing.
 */
const CHARTS: ReadonlyArray<{ role: 'student' | 'instructor' | 'admin'; path: string }> = [
  { role: 'admin', path: '/admin/analytics' },
  { role: 'instructor', path: '/instructor/analytics' },
]

test.describe('charts render without a global ApexCharts registration', () => {
  for (const { role, path } of CHARTS) {
    test(`${role} analytics draws a chart`, async ({ page }) => {
      const email =
        role === 'admin'
          ? (process.env.E2E_ADMIN_EMAIL ?? '')
          : (process.env.E2E_INSTRUCTOR_EMAIL ?? '')
      const password =
        role === 'admin'
          ? (process.env.E2E_ADMIN_PASSWORD ?? '')
          : (process.env.E2E_INSTRUCTOR_PASSWORD ?? '')

      await page.goto('/auth/login')
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill(password)
      await page.locator('form button[type="submit"]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })

      await page.goto(path)
      // The library is lazy now, so give it room to arrive and draw.
      await page.waitForSelector('.apexcharts-canvas', { timeout: 30_000 })
      await expect(page.locator('.apexcharts-canvas').first()).toBeVisible()
      await expect(page.locator('svg.apexcharts-svg').first()).toBeAttached()
    })
  }
})

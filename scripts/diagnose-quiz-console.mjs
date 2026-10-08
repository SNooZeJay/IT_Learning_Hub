import { chromium } from '@playwright/test'

/**
 * Reproduce the quiz-manager console errors and name the requests behind them.
 *
 * The end-to-end suite reports "Failed to load resource: 400" on that screen and nothing
 * more, which is not enough to act on. This walks the same path it does and prints the
 * URL and status of every failing request, so the cause is identified rather than
 * filtered away.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const EMAIL = process.env.E2E_INSTRUCTOR_EMAIL ?? ''
const PASSWORD = process.env.E2E_INSTRUCTOR_PASSWORD ?? ''

const browser = await chromium.launch()
const page = await browser.newPage()

const failures = []
page.on('response', (response) => {
  if (response.status() >= 400) {
    failures.push({ status: response.status(), url: response.url() })
  }
})

await page.goto(`${BASE}/auth/login`)
await page.locator('input[name="email"]').fill(EMAIL)
await page.locator('input[name="password"]').fill(PASSWORD)
await page.locator('form button[type="submit"]').click()
await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })

await page.goto(`${BASE}/instructor/courses`)
await page
  .locator('a[href^="/instructor/courses/"]:not([href$="/create"]):not([href$="/edit"])')
  .first()
  .click()
await page.waitForURL(/\/instructor\/courses\/[0-9a-f-]{36}/)

await page.locator('a[href$="/quiz"]').first().click()
await page.waitForURL(/\/instructor\/courses\/[0-9a-f-]{36}\/quiz/)
await page.waitForTimeout(2000)

console.log('failing requests:', failures.length)
for (const failure of failures) {
  // The query string can carry a course id and a filter; keep it, it is usually the clue.
  console.log(`  ${failure.status} ${failure.url}`)
}

await browser.close()
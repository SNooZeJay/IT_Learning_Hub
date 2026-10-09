import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

/**
 * The header logo must be a named link at every width.
 *
 * It was `hidden sm:inline` with `aria-label` on the link. Below `sm` the wordmark is
 * `display: none`, so the `aria-label` was the only thing naming the control - and it
 * was there for exactly that reason until someone removed it as redundant. Remove it
 * and the logo becomes an unnamed link: a screen reader announces "link", and the
 * only way home from any page is invisible.
 *
 * Asserted through the accessibility tree rather than by checking a class, because
 * the accessible name is the thing that actually matters and the markup is free to
 * change.
 */
test('the header logo is a named link at 375px and at 640px', async ({ page }) => {
  test.setTimeout(120_000)

  for (const width of [375, 640]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)

    const logo = page.getByRole('link', { name: 'IT Learning Hub', exact: true }).first()
    await expect(logo, `no link named "IT Learning Hub" at ${width}px`).toBeVisible()
  }
})

/**
 * And the unnamed-link failure is caught in general.
 *
 * Deliberately strict: any header link with no accessible text at all is a defect.
 * An icon-only control must name itself with `aria-label`, and a control that names
 * itself with nothing is not reachable by name from the keyboard or a screen reader.
 */
test('no header link is left without an accessible name', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)

  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('header a')]
      .filter((a) => {
        const text = (a.textContent ?? '').trim()
        const label = a.getAttribute('aria-label')?.trim() ?? ''
        const labelledBy = a.getAttribute('aria-labelledby')
        const imgAlt = [...a.querySelectorAll('img')].some((i) => (i.alt ?? '').trim())
        return !text && !label && !labelledBy && !imgAlt
      })
      .map((a) => a.outerHTML.slice(0, 120)),
  )

  expect(unnamed, `unnamed header links: ${unnamed.join(' | ')}`).toHaveLength(0)
})

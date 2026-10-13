import { test, expect } from '@playwright/test'

/**
 * Every scroll reveal on the landing page must fire.
 *
 * Regression pin: `content-visibility` on reveal-bearing sections made
 * ScrollTrigger measure against estimated heights, stranding the deepest
 * triggers below max-scroll - the panels and CTA sections sat at opacity 0
 * forever. The rule (also recorded in main.css) is that no `content-visibility`
 * ancestor may wrap a reveal; this spec fails if any reveal survives a full
 * scroll unplayed.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight
    for (let y = 0; y <= h; y += 300) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 80))
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(1500)
}

async function stuckReveals(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.animated-content'))
      .filter((el) => (el as HTMLElement).style.opacity === '0')
      .map((el) => {
        const section = (el as HTMLElement).closest('section')
        return section?.querySelector('h1, h2')?.textContent?.trim().slice(0, 40) ?? '?'
      }),
  )
}

for (const dark of [false, true]) {
  test(`landing reveals all fire (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    test.setTimeout(300000)
    const errs: string[] = []
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
    await page.waitForTimeout(2500)

    await scrollThrough(page)
    const stuck = await stuckReveals(page)
    expect(
      stuck,
      `reveals stuck at opacity 0 after a full scroll: ${JSON.stringify(stuck)}`,
    ).toEqual([])

    const total = await page.locator('.animated-content').count()
    expect(total).toBeGreaterThan(0)

    const ov = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(ov).toBe(0)
    expect(errs).toEqual([])
  })
}

test('landing reveals all fire (mobile)', async ({ page }) => {
  test.setTimeout(300000)
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  await scrollThrough(page)
  const stuck = await stuckReveals(page)
  expect(stuck, `reveals stuck at opacity 0 after a full scroll: ${JSON.stringify(stuck)}`).toEqual(
    [],
  )

  const ov = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(ov).toBe(0)
  expect(errs).toEqual([])
})

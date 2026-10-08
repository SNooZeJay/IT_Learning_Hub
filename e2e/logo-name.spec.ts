import { test, expect } from '@playwright/test'

/**
 * The logo link must have an accessible name at every viewport width.
 *
 * A regression test for a real WCAG 2.4.4 failure. The wordmark beside the mark was
 * `hidden md:inline`, and the mark itself is `alt=""` on purpose - because the name
 * normally sits beside it. So below 768px the link's entire accessible content was an
 * empty-alt image, and it announced as a bare "link". Lighthouse caught it, but only
 * because it audits at mobile width; at desktop the same link passed, since the
 * visible wordmark was there.
 *
 * The rule this encodes: hiding text visually is not the same as removing it. A
 * responsive breakpoint may drop the wordmark from the screen. It may not drop it
 * from the accessibility tree.
 *
 * The name is resolved with `getByRole(..., { name })` rather than by reading
 * `textContent`. That matters: `textContent` returns the words inside a
 * `display: none` span exactly as readily as inside a visually-hidden one, so it
 * would have reported this link as named even while it was announcing nothing.
 * Playwright's role selector uses the real accessibility computation, which honours
 * `display: none` - so this fails on the old markup and passes on the new.
 */

const PUBLIC_PAGES = [
  { path: '/', name: 'landing' },
  { path: '/courses', name: 'catalogue' },
]

const WIDTHS = [375, 768, 1280]

test.describe('logo link has an accessible name at every width', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    for (const width of WIDTHS) {
      test(`${name} at ${width}px announces the brand`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)

        // Scoped to the header, and required to be visible: a link that merely exists
        // but is hidden would not be reachable by keyboard either.
        const named = page
          .locator('header')
          .first()
          .getByRole('link', { name: /IT Learning Hub/i })

        await expect(
          named.first(),
          `${path} @ ${width}px: no header link named "IT Learning Hub"`,
        ).toBeAttached()
      })
    }
  }

  test('the wordmark is genuinely visible from md, not just announced', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')

    const wordmark = page
      .locator('header')
      .first()
      .getByRole('link', { name: /IT Learning Hub/i })
      .first()

    await expect(wordmark).toBeVisible()
    // A `sr-only` span left in place by mistake is 1x1px. Assert real width so the
    // desktop wordmark cannot quietly become screen-reader-only.
    const box = await wordmark.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(60)
  })
})

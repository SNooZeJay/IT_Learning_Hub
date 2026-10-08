import { test, expect } from '@playwright/test'

/**
 * The landing page carousel must not compete with page scrolling.
 *
 * Upstream registered a `wheel` listener that called `preventDefault()` on every
 * wheel event, vertical ones included, and treated pointer drag as navigation. On a
 * page you scroll, that meant a visitor whose pointer happened to be over the hero
 * could not scroll at all - the carousel ate the scroll and quietly changed slide.
 * On touch, `setPointerCapture` could capture the vertical gesture entirely.
 *
 * Arrows, dots, keyboard and card clicks are the intended controls and must survive;
 * this asserts both halves so a future "let me put the swipe back" change has to
 * argue with a failing test rather than quietly reintroduce the fight.
 */
const HERO = '/'

test.describe('landing carousel: buttons and dots, no gesture', () => {
  test('scrolling over the carousel scrolls the page', async ({ page }) => {
    await page.goto(HERO)
    await page.waitForLoadState('networkidle')

    const carousel = page.getByRole('group')
    const box = await carousel.boundingBox()
    expect(box).not.toBeNull()

    const scrollBy = async (dy: number) => {
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await page.mouse.wheel(0, dy)
      await page.waitForTimeout(400)
    }

    const before = await page.evaluate(() => window.scrollY)
    await scrollBy(600)
    const afterDown = await page.evaluate(() => window.scrollY)

    // The regression: `preventDefault` on the wheel event pins this to `before`.
    expect(afterDown, 'page must scroll while the pointer is over the carousel').toBeGreaterThan(
      before + 100,
    )

    await scrollBy(-600)
    const afterUp = await page.evaluate(() => window.scrollY)
    expect(afterUp, 'page must scroll back up too').toBeLessThan(afterDown - 100)
  })

  test('the arrow buttons navigate', async ({ page }) => {
    await page.goto(HERO)
    await page.waitForLoadState('networkidle')

    const current = () =>
      page.getAttribute(
        '[aria-roledescription="carousel"] .sr-only, [aria-roledescription="carousel"]',
        'aria-label',
      )

    // The focused card carries aria-hidden="false"; that is the source of truth.
    const activeIndex = () =>
      page.evaluate(() => {
        const cards = [...document.querySelectorAll('[aria-roledescription="slide"]')]
        return cards.findIndex((c) => c.getAttribute('aria-hidden') === 'false')
      })

    const start = await activeIndex()
    expect(start).toBeGreaterThanOrEqual(0)

    await page.getByRole('button', { name: /next/i }).click()
    await page.waitForTimeout(900)
    expect(await activeIndex()).not.toBe(start)

    await page.getByRole('button', { name: /previous/i }).click()
    await page.waitForTimeout(900)
    expect(await activeIndex()).toBe(start)

    void current
  })

  test('the dots navigate to a specific slide', async ({ page }) => {
    await page.goto(HERO)
    await page.waitForLoadState('networkidle')

    const activeIndex = () =>
      page.evaluate(() => {
        const cards = [...document.querySelectorAll('[aria-roledescription="slide"]')]
        return cards.findIndex((c) => c.getAttribute('aria-hidden') === 'false')
      })

    const dots = page.locator('[aria-roledescription="carousel"] button[aria-label*="Go to"]')
    const count = await dots.count()
    expect(count).toBeGreaterThan(1)

    // Pick a dot that is definitely not the one already showing.
    const start = await activeIndex()
    const target = start === count - 1 ? 0 : count - 1
    await dots.nth(target).click()
    await page.waitForTimeout(900)
    expect(await activeIndex()).toBe(target)
  })

  test('a pointer drag does not change the slide', async ({ page }) => {
    await page.goto(HERO)
    await page.waitForLoadState('networkidle')

    const activeIndex = () =>
      page.evaluate(() => {
        const cards = [...document.querySelectorAll('[aria-roledescription="slide"]')]
        return cards.findIndex((c) => c.getAttribute('aria-hidden') === 'false')
      })

    const box = await page.getByRole('group').boundingBox()
    const y = box!.y + box!.height / 2
    const from = box!.x + box!.width / 2

    const before = await activeIndex()
    await page.mouse.move(from, y)
    await page.mouse.down()
    // Well past the old 4px threshold, and with a flick at the end so the old
    // velocity projection would have thrown it several slides along.
    for (let i = 1; i <= 12; i++) await page.mouse.move(from - i * 30, y)
    await page.mouse.up()
    await page.waitForTimeout(900)

    expect(await activeIndex(), 'dragging must not navigate the carousel').toBe(before)
  })
})

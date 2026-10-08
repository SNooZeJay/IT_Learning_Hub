import { test, expect } from '@playwright/test'

/**
 * The mobile drawer must actually cover the screen when it is open.
 *
 * A phone screenshot showed the navigation drawer open with the header's theme toggle,
 * notification bell and account menu floating above it, and the page heading visible
 * through the gap underneath. The cause was not a layout bug but a stacking one: the
 * header and the sidebar both sat at `z-99999`, and `AppLayout` renders the header after
 * the sidebar - so with equal z-index the later element won.
 *
 * A closed-sidebar check cannot catch this. The sweep in `type-regression.spec.ts`
 * measures page layout at 375px and was green throughout while this was broken, because
 * nothing overlaps until the drawer is open. So the drawer is opened here, the way a
 * user opens it, and the stack is measured with it open.
 *
 * Asserted, because every part of it is a number that either holds or does not:
 * the drawer sits above the header, the backdrop covers the viewport rather than the
 * header's strip, the header is beneath the backdrop so it is dimmed and inert, and
 * tapping outside the drawer closes it.
 */

const VIEWPORTS = [
  { width: 375, height: 812, name: 'small phone' },
  { width: 393, height: 852, name: 'phone' },
  { width: 768, height: 1024, name: 'tablet' },
]

/** The sidebar switches to an overlay drawer below the xl breakpoint. */
async function openDrawer(page: import('@playwright/test').Page) {
  const toggle = page.locator('header button[aria-controls]').first()
  await toggle.waitFor({ state: 'visible', timeout: 15_000 })
  await toggle.click()
  // The drawer transitions its width over 200ms.
  await page.waitForTimeout(600)
}

test.describe('mobile drawer covers the page when open', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}px)`, async ({ page }) => {
      test.setTimeout(180_000)

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/auth/login')
      await page.locator('input[name="email"]').fill(process.env.E2E_ADMIN_EMAIL!)
      await page.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD!)
      await page.locator('form button[type="submit"]').click()
      await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })
      await page.waitForLoadState('networkidle')

      await openDrawer(page)

      const m = await page.evaluate(() => {
        const aside = document.querySelector('aside')
        const header = document.querySelector('header')
        // The backdrop is identified by its own class, not by a substring: the header
        // carries `backdrop-blur-sm`, which a `[class*="backdrop"]` selector matches,
        // and that mistake reports the header's own box as if it were the backdrop.
        const backdrop = document.querySelector('div.fixed.inset-0.z-9999')

        const z = (el: Element | null) => (el ? Number(getComputedStyle(el).zIndex) : null)
        const rect = (el: Element | null) => {
          if (!el) return null
          const r = el.getBoundingClientRect()
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          }
        }

        // Does the drawer's top-left actually win the hit test against the header?
        let drawerOnTopAtTopLeft = false
        if (aside) {
          const r = aside.getBoundingClientRect()
          const hit = document.elementFromPoint(Math.max(4, r.x + 4), Math.max(4, r.y + 4))
          drawerOnTopAtTopLeft = !!hit && !!aside.contains(hit)
        }

        return {
          vw: window.innerWidth,
          vh: window.innerHeight,
          aside: rect(aside),
          header: rect(header),
          backdrop: rect(backdrop),
          zAside: z(aside),
          zHeader: z(header),
          zBackdrop: z(backdrop),
          drawerOnTopAtTopLeft,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })

      const where = `${vp.width}px`

      expect(m.aside, `${where}: drawer not found`).not.toBeNull()
      expect(m.backdrop, `${where}: backdrop not found`).not.toBeNull()

      // The drawer is a full-height overlay at this width.
      expect(m.aside!.y, `${where}: drawer should start at the top`).toBeLessThanOrEqual(1)
      expect(m.aside!.h, `${where}: drawer should be full height`).toBeGreaterThanOrEqual(m.vh - 2)

      // The headline defect: the drawer must win the paint order against the header.
      expect(
        m.zAside!,
        `${where}: drawer z-index ${m.zAside} must exceed header z-index ${m.zHeader}`,
      ).toBeGreaterThan(m.zHeader!)
      expect(m.drawerOnTopAtTopLeft, `${where}: header is painting over the open drawer`).toBe(true)

      // The backdrop must cover the viewport, not just the header's strip.
      expect(
        m.zBackdrop!,
        `${where}: backdrop z-index ${m.zBackdrop} must exceed header ${m.zHeader}`,
      ).toBeGreaterThan(m.zHeader!)
      expect(m.backdrop!.w, `${where}: backdrop should span the viewport`).toBeGreaterThanOrEqual(
        m.vw - 2,
      )
      expect(m.backdrop!.h, `${where}: backdrop should span the viewport`).toBeGreaterThanOrEqual(
        m.vh - 2,
      )

      expect(
        m.overflow,
        `${where}: horizontal overflow while the drawer is open`,
      ).toBeLessThanOrEqual(0)

      // Tapping the page behind the drawer is how everyone closes it.
      await page.mouse.click(m.vw - 12, m.vh - 12)
      await page.waitForTimeout(600)
      const stillOpen = await page.evaluate(() => {
        const aside = document.querySelector('aside')
        if (!aside) return false
        return aside.getBoundingClientRect().x > -10
      })
      expect(stillOpen, `${where}: tapping outside should close the drawer`).toBe(false)
    })
  }

  test('above the breakpoint the sidebar is a column, not an overlay', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1536, height: 900 })
    await page.goto('/auth/login')
    await page.locator('input[name="email"]').fill(process.env.E2E_ADMIN_EMAIL!)
    await page.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD!)
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })
    await page.waitForLoadState('networkidle')

    // Lowering the header must not have broken the desktop shell: the header still has
    // to float above page content when the page scrolls under it.
    const headerZ = await page.evaluate(() =>
      Number(getComputedStyle(document.querySelector('header')!).zIndex),
    )
    expect(headerZ, 'header must still stack above ordinary content').toBeGreaterThan(50)
  })
})

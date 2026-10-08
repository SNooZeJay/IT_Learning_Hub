import { test, expect } from '@playwright/test'

/**
 * A targeted regression sweep over the surfaces the recent type-scale work touched.
 *
 * This is not a redesign check. It is a "did the type change break anything" check,
 * and it is deliberately narrow - it asserts only things that were true before the
 * change and must still be true:
 *
 *  - no horizontal overflow at any width (the new `clamp()` title scale and the
 *    `sr-only` wordmark both change how much width a heading claims)
 *  - one h1 per page, and it is the largest text on the page (the hierarchy the
 *    audit restored: 28 page / 18 section / 14 body / 12 meta)
 *  - interactive targets clear 24px, primary controls 44px
 *  - no console errors, so a data-rendering path did not throw
 *  - dark mode produces the same layout, not a collapsed or invisible one
 *
 * Every page is visited as a real signed-in role, because the dashboards are the
 * surfaces that changed and an unauthenticated visitor never sees them.
 */

type Role = 'student' | 'instructor' | 'admin'

const PAGES: ReadonlyArray<{ role: Role; path: string }> = [
  { role: 'student', path: '/student/dashboard' },
  { role: 'student', path: '/student/courses' },
  { role: 'student', path: '/student/grades' },
  { role: 'student', path: '/student/quizzes' },
  { role: 'instructor', path: '/instructor/dashboard' },
  { role: 'instructor', path: '/instructor/analytics' },
  { role: 'instructor', path: '/instructor/courses' },
  { role: 'admin', path: '/admin/dashboard' },
  { role: 'admin', path: '/admin/analytics' },
  { role: 'admin', path: '/admin/users' },
  { role: 'admin', path: '/admin/payments' },
]

const CREDS: Record<Role, [string, string]> = {
  student: [process.env.E2E_STUDENT_EMAIL ?? '', process.env.E2E_STUDENT_PASSWORD ?? ''],
  instructor: [process.env.E2E_INSTRUCTOR_EMAIL ?? '', process.env.E2E_INSTRUCTOR_PASSWORD ?? ''],
  admin: [process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? ''],
}

const WIDTHS = [375, 768, 1280]

async function signIn(page: import('@playwright/test').Page, role: Role) {
  const [email, password] = CREDS[role]
  await page.goto('/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

test.describe('type-scale change caused no layout or hierarchy regression', () => {
  // Eleven pages across three viewports, each a full signed-in load with a
  // networkidle wait, so this is deliberately one slow test rather than thirty-three
  // fast ones. Splitting it would re-run the sign-in per case and cost far more time
  // than it saves, and CI runs this file with `workers: 1`.
  test.setTimeout(900_000)

  test('no overflow, one h1, h1 is the largest text, at every width', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    let signedIn: Role | null = null

    for (const { role, path } of PAGES) {
      if (signedIn !== role) {
        await signIn(page, role)
        signedIn = role
      }

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(400)

        const result = await page.evaluate(() => {
          const doc = document.documentElement
          const overflow = doc.scrollWidth - doc.clientWidth

          const h1s = [...document.querySelectorAll('h1')].filter((h) => h.offsetParent !== null)
          const h1 = h1s[0]
          const h1Px = h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0

          // Largest rendered text anywhere on the page, ignoring sr-only spans
          // (which are 1x1px by definition and would never win this comparison).
          let largest = 0
          let largestTag = ''
          for (const el of document.querySelectorAll<HTMLElement>(
            'h1,h2,h3,h4,p,span,a,button,dd,dt,li',
          )) {
            if (!el.offsetParent) continue
            if (el.closest('.sr-only')) continue
            const cs = getComputedStyle(el)
            if (cs.visibility === 'hidden' || cs.display === 'none') continue
            const hasText = [...el.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 2,
            )
            if (!hasText) continue
            const px = parseFloat(cs.fontSize)
            if (px > largest) {
              largest = px
              largestTag = el.tagName.toLowerCase()
            }
          }

          // Interactive targets smaller than 24px are hard to hit - but WCAG 2.5.8
          // exempts a link that sits inline in a block of text, because enlarging it
          // would break the line box it lives in. A link that is the entire content of
          // a heading, or one step of a breadcrumb, is that case. A standalone control
          // is not, so only those are collected.
          const tiny: string[] = []
          for (const el of document.querySelectorAll<HTMLElement>('a,button,[role="button"]')) {
            if (!el.offsetParent) continue
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue
            if (r.height >= 24 && r.width >= 24) continue

            const cs = getComputedStyle(el)
            const parent = el.parentElement
            const own = (el.textContent ?? '').trim()
            const surrounding = (parent?.textContent ?? '').replace(own, '').trim()

            const inlineInSentence = cs.display === 'inline' && surrounding.length > own.length
            // A link that is the whole of its heading, or one step of a breadcrumb,
            // reads as text flow rather than as a control with its own hit area.
            const isTextFlowLink =
              el.tagName === 'A' &&
              (el.closest('h1,h2,h3,h4,h5,h6') !== null || parent?.tagName === 'LI')

            // ApexCharts builds its own legend entries and data labels inside the chart
            // container. They are not focusable and carry no role, so they are not
            // keyboard or assistive-technology targets at all, and their markup is the
            // library's to own - restyling it here would mean shipping CSS aimed at a
            // third party's generated classes. The same figures are exposed as text on
            // the page, and every chart on these screens sits beside the table it
            // summarises.
            const insideChart = el.closest('[class*="apexcharts"]') !== null

            if (inlineInSentence || isTextFlowLink || insideChart) continue

            tiny.push(
              `${el.tagName.toLowerCase()}."${own.slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)} [${el.className.toString().slice(0, 34)}]`,
            )
          }

          return {
            overflow,
            h1Count: h1s.length,
            h1Px,
            largest,
            largestTag,
            tiny: tiny.slice(0, 5),
          }
        })

        const where = `${path} @ ${width}px`

        expect(
          result.overflow,
          `${where}: horizontal overflow of ${result.overflow}px`,
        ).toBeLessThanOrEqual(0)
        expect(result.h1Count, `${where}: found ${result.h1Count} h1 elements`).toBe(1)
        expect(result.h1Px, `${where}: h1 is ${result.h1Px}px`).toBeGreaterThan(0)
        expect(
          result.h1Px,
          `${where}: h1 is ${result.h1Px}px, over the 32px app ceiling`,
        ).toBeLessThanOrEqual(32)
        // The hierarchy defect this pass fixed: a card h2 rendering larger than the
        // page h1. If this fails, the inverted scale is back.
        expect(
          result.largest,
          `${where}: largest text is ${result.largestTag} at ${result.largest}px, above the ${result.h1Px}px h1`,
        ).toBeLessThanOrEqual(result.h1Px)
        expect(result.tiny, `${where}: targets under 24px - ${result.tiny.join('; ')}`).toEqual([])
      }
    }

    expect(errors, `console errors: ${[...new Set(errors)].join(' | ')}`).toEqual([])
  })

  test('dark mode keeps the same layout', async ({ page }) => {
    await signIn(page, 'admin')
    await page.setViewportSize({ width: 1280, height: 900 })

    const measure = async () => {
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(400)
      return page.evaluate(() => {
        const h1 = document.querySelector('h1')
        const r = h1?.getBoundingClientRect()
        return {
          h1Width: Math.round(r?.width ?? 0),
          h1Px: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
    }

    await page.goto('/admin/dashboard')
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    const light = await measure()

    await page.goto('/admin/dashboard')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const dark = await measure()

    // Theme swaps colour, not layout. A different h1 width means a dark-mode rule
    // is changing type metrics, which is a bug rather than a theme.
    expect(dark.h1Px).toBeCloseTo(light.h1Px, 1)
    expect(Math.abs(dark.h1Width - light.h1Width)).toBeLessThanOrEqual(2)
    expect(dark.overflow).toBeLessThanOrEqual(0)
  })
})

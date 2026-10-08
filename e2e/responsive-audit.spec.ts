import { test, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'

/**
 * A responsive sweep that reports rather than asserts.
 *
 * The question this answers is "does anything on this screen make the page scroll
 * sideways, and if so what is doing it". Measuring beats reading: a fixed sidebar, a
 * wide table and a long unbroken word all look fine in the source and all break a phone,
 * and which of them is present on which screen is not something to guess at from a
 * stylesheet.
 *
 * Horizontal overflow is the check that matters most, because it is the one failure a
 * phone user cannot work around - vertical scrolling is expected, sideways scrolling
 * means content has been pushed off the screen with no way to reach it.
 *
 * Writes `responsive-report.json` and prints a summary. It does not fail the run on
 * findings, because during a sweep the findings are the output. The companion check in
 * `responsive.spec.ts` is the one that gates.
 */

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1536, height: 960 },
] as const

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const ACCOUNTS = {
  student: {
    email: process.env.E2E_STUDENT_EMAIL ?? '',
    password: process.env.E2E_STUDENT_PASSWORD ?? '',
  },
  instructor: {
    email: process.env.E2E_INSTRUCTOR_EMAIL ?? '',
    password: process.env.E2E_INSTRUCTOR_PASSWORD ?? '',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? '',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
  },
}

/** Seeds per role, plus the pages anyone can reach signed out. */
const SEEDS: Record<string, string[]> = {
  public: ['/', '/auth/login', '/auth/register', '/courses', '/legal/terms', '/legal/privacy'],
  student: [
    '/student/dashboard',
    '/student/courses',
    '/student/quizzes',
    '/student/grades',
    '/student/announcements',
    '/student/calendar',
    '/student/notifications',
    '/messages',
    '/profile',
  ],
  instructor: [
    '/instructor/dashboard',
    '/instructor/courses',
    '/instructor/students',
    '/instructor/grading',
    '/instructor/analytics',
    '/instructor/announcements',
    '/instructor/calendar',
  ],
  admin: [
    '/admin/dashboard',
    '/admin/users',
    '/admin/students',
    '/admin/instructors',
    '/admin/courses',
    '/admin/categories',
    '/admin/payments',
    '/admin/announcements',
    '/admin/analytics',
    '/admin/settings',
  ],
}

/** What counts as a page worth crawling into, beyond the seeds. */
const CRAWLABLE = [
  /^\/student\/courses\/[^/]+$/,
  /^\/student\/lessons\/[^/]+$/,
  /^\/student\/checkout\/[^/]+$/,
  /^\/instructor\/courses\/[0-9a-f-]{36}$/,
  /^\/instructor\/courses\/[0-9a-f-]{36}\/(edit|quiz)$/,
  /^\/courses\/[a-z0-9-]+$/,
]

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

/**
 * Measure the page.
 *
 * Reports the document-level overflow plus the widest few offenders, because "this page
 * scrolls sideways" is not actionable on its own - `main > div:nth-child(2)` is not.
 * The class list is what identifies the component to fix.
 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const viewport = doc.clientWidth
    const offenders: { selector: string; right: number; width: number }[] = []

    const describe = (el: Element): string => {
      const cls = (el.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('[') && c.length < 40)
        .slice(0, 3)
        .join('.')
      const id = el.id ? `#${el.id}` : ''
      return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''}`
    }

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el)
      // display:none and visibility:hidden cannot overflow anything.
      if (style.display === 'none' || style.visibility === 'hidden') continue
      // A zero-height wrapper is not what the reader sees.
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const overflowsRight = rect.right > viewport + 1
      // A wide element inside a horizontally scrollable container is fine - that is
      // what the container is for. Only count ones nothing is meant to scroll.
      let insideScroller = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden') {
          insideScroller = true
          break
        }
      }
      if (overflowsRight && !insideScroller) {
        offenders.push({
          selector: describe(el),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        })
      }
    }

    offenders.sort((a, b) => b.right - a.right)
    // The widest thing on the page whatever its container, scroller or not. Reported
    // separately because a page can report overflow with no element sticking out -
    // which means the cause is the body, a negative margin, or something positioned -
    // and the filtered list above is empty precisely when that happens.
    let widest = { selector: 'none', right: 0, width: 0 }
    for (const el of Array.from(document.querySelectorAll('body, body *'))) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) continue
      if (rect.right > widest.right) {
        widest = { selector: describe(el), right: Math.round(rect.right), width: Math.round(rect.width) }
      }
    }

    /**
     * Everything that could extend the scroll area, including things the filtered pass
     * deliberately skips. A page can report overflow with no visible element sticking
     * out, and the usual reasons are exactly the things that pass skips: a zero-height
     * row, something `visibility: hidden`, a negative margin, or a fixed-position
     * overlay parked off-screen.
     */
    const suspects: string[] = []
    for (const el of Array.from(document.querySelectorAll('body, body *'))) {
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const notes: string[] = []

      if (rect.right > viewport + 0.5) notes.push(`right=${Math.round(rect.right)}`)
      const mr = parseFloat(style.marginRight)
      if (!Number.isNaN(mr) && mr < 0) notes.push(`margin-right=${mr}`)
      if (style.position === 'fixed' && rect.right > viewport + 0.5) notes.push('fixed')
      if (rect.width > viewport + 0.5) notes.push(`wider-than-viewport(${Math.round(rect.width)})`)

      if (notes.length > 0) {
        suspects.push(`${describe(el)} :: ${notes.join(' ')} [display=${style.display} vis=${style.visibility}]`)
      }
    }

    return {
      viewport,
      innerWidth: window.innerWidth,
      scrollbarWidth: window.innerWidth - viewport,
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyWidth: Math.round(document.body.getBoundingClientRect().width),
      overflowBy: Math.max(0, doc.scrollWidth - viewport),
      offenders: offenders.slice(0, 6),
      widest,
      suspects: suspects.slice(0, 10),
    }
  })
}

type Finding = {
  page: string
  viewport: string
  overflowBy: number
  scrollWidth: number
  offenders: { selector: string; right: number; width: number }[]
  widest: { selector: string; right: number; width: number }
  suspects: string[]
  bodyScrollWidth: number
  bodyWidth: number
}

test('responsive sweep across every role and viewport', async ({ page }) => {
  test.setTimeout(15 * 60_000)
  const findings: Finding[] = []
  const scrollbarArtifacts: { page: string; viewport: string; by: number }[] = []
  const consoleErrors: { page: string; text: string }[] = []
  let checked = 0

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ page: page.url(), text: m.text() })
  })

  const audit = async (path: string) => {
    // Lets a sweep be re-run against the pages that still fail, which is a two second
    // job rather than the five minutes the full sweep takes.
    const only = process.env.E2E_AUDIT_ONLY
    if (only && !only.split(',').some((needle) => path.includes(needle))) return
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      // Give the SPA's async data a moment; an empty shell measures clean and lies.
      await page.waitForTimeout(900)
      const m = await measure(page)
      checked += 1
      // A delta no larger than the scrollbar, with nothing actually sticking out, is
      // the scrollbar and not a layout fault. Counting those as failures would bury
      // the real findings under a phantom on every long page.
      const isScrollbarArtifact =
        m.scrollbarWidth > 0 &&
        m.overflowBy <= m.scrollbarWidth + 1 &&
        m.offenders.length === 0
      if (m.overflowBy > 0 && !isScrollbarArtifact) {
        findings.push({
          page: path,
          viewport: vp.name,
          overflowBy: m.overflowBy,
          scrollWidth: m.scrollWidth,
          offenders: m.offenders,
          widest: m.widest,
          suspects: m.suspects,
          bodyScrollWidth: m.bodyScrollWidth,
          bodyWidth: m.bodyWidth,
        })
      }
      if (m.overflowBy > 0 && isScrollbarArtifact) {
        scrollbarArtifacts.push({ page: path, viewport: vp.name, by: m.overflowBy })
      }
    }
  }

  const crawl = async (roots: string[], limit = 10) => {
    const found = new Set<string>()
    for (const root of roots) {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(`${BASE}${root}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(700)
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? ''),
      )
      for (const href of hrefs) {
        if (found.size >= limit) break
        if (!href.startsWith('/')) continue
        if (CRAWLABLE.some((re) => re.test(href)) && !found.has(href)) found.add(href)
      }
    }
    return [...found]
  }

  // Signed out: the public surface.
  for (const p of SEEDS.public) await audit(p)
  const publicPages = await crawl(['/', '/courses'])
  for (const p of publicPages) await audit(p)

  // Signed in, per role.
  const roles = ['student', 'instructor', 'admin'] as const
  for (const role of roles) {
    const account = ACCOUNTS[role]
    if (!account.email) {
      console.log(`\n--- ${role}: skipped, no E2E_${role.toUpperCase()}_EMAIL set`)
      continue
    }
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.context().clearCookies()
    await signIn(page, account.email, account.password)

    for (const p of SEEDS[role]) await audit(p)
    const discovered = await crawl(SEEDS[role], 8)
    for (const p of discovered) await audit(p)
  }

  mkdirSync('reports', { recursive: true })
  writeFileSync(
    'reports/responsive-report.json',
    JSON.stringify({ base: BASE, checked, findings, scrollbarArtifacts, consoleErrors }, null, 2),
  )

  console.log(`\n=== checked ${checked} page/viewport combinations ===`)
  console.log(`${scrollbarArtifacts.length} scrollbar-sized deltas ignored`)
  if (findings.length === 0) {
    console.log('no horizontal overflow found')
  } else {
    console.log(`\n${findings.length} overflowing combinations:\n`)
    for (const f of findings) {
      console.log(
        `${f.page}  [${f.viewport}]  overflows by ${f.overflowBy}px  ` +
          `(doc=${f.scrollWidth} body=${f.bodyScrollWidth} bodyWidth=${f.bodyWidth})`,
      )
      for (const o of f.offenders) {
        console.log(`    offender  ${o.selector}  (right=${o.right} width=${o.width})`)
      }
      console.log(`    widest    ${f.widest.selector}  (right=${f.widest.right} width=${f.widest.width})`)
      for (const s of f.suspects) console.log(`    suspect   ${s}`)
    }
  }
  if (consoleErrors.length > 0) {
    console.log(`\n${consoleErrors.length} console errors:`)
    for (const e of consoleErrors.slice(0, 12)) console.log(`    ${e.page} :: ${e.text.slice(0, 160)}`)
  }
})

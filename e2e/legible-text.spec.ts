import { test, expect, type Page } from '@playwright/test'

/**
 * Text that is visible but unreadable, or cut off with no way to see it.
 *
 * `responsive-audit.spec.ts` measures horizontal overflow. That is the failure a phone
 * user cannot work around - sideways scrolling means content is off the screen - but
 * it is not the only one. Text can be fully inside the viewport and still be a
 * defect, in two ways that only show up at narrow widths:
 *
 *   a silent clip. `truncate` or `line-clamp` on a title the reader has no other way
 *   to see. The dashboard's grade rows and the messages list both did this: a course
 *   title became "Security+ Exam Prepara…", losing the date on the line below, and
 *   the reader had nowhere to look for the rest.
 *
 *   text below 10px, which is a mistake rather than a choice - the small type this
 *   app intends (badge counts, uppercase eyebrows) sits at exactly 10px.
 *
 * Neither is visible in a screenshot on a desktop monitor, which is why both survived
 * until they were found on a physical phone.
 */

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

/** The signed-out surface plus every seed each role can reach. */
const PUBLIC = ['/', '/auth/login', '/auth/register', '/auth/forgot-password', '/courses']
const BY_ROLE = {
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
    '/instructor/announcements',
    '/instructor/calendar',
  ],
  admin: [
    '/admin/dashboard',
    '/admin/users',
    '/admin/students',
    '/admin/courses',
    '/admin/payments',
  ],
} as const

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/auth/login`)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

type Finding = { kind: string; selector: string; text: string; detail: string }

/**
 * Run in the page.
 *
 * Narrow on purpose, and every exclusion below corresponds to a false positive found
 * while writing this. A legibility gate that fires on things nobody will fix is worse
 * than no gate, because it teaches people to ignore its output:
 *
 *   - `sr-only` elements are clipped to 1px BY DESIGN. That is the entire mechanism,
 *     and reporting it reports the accessibility feature as a defect.
 *   - elements with element children are containers, not lines of text; their
 *     `scrollWidth` describes their layout, not their copy.
 *   - zero-size boxes are not rendered.
 *   - a `title` attribute alongside the clip means the full text is reachable by
 *     hover, which is a real answer.
 */
function collect(): Finding[] {
  const out: Finding[] = []
  const describe = (el: Element): string => {
    const cls = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('[') && c.length < 40)
      .slice(0, 3)
      .join('.')
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
  }

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    // The accessibility mechanism. Clipping is the feature.
    if (el.classList.contains('sr-only')) continue

    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()

    // A. Text cut off, with no way to see the rest.
    //    `children.length > 0` excludes containers: their scrollWidth is layout, not
    //    prose, and every flex row with an overflowing child reports it.
    if (
      text &&
      el.children.length === 0 &&
      el.scrollWidth > el.clientWidth + 1 &&
      (style.textOverflow === 'ellipsis' || style.overflowX === 'hidden')
    ) {
      // `line-clamp` is an intentional, sanctioned clip: two lines is a decision about
      // density. It is only reported when the element also gives no way to see more -
      // no `title`, so a pointer user has nothing either.
      const clamped = style.webkitLineClamp !== 'none'
      if (clamped && el.hasAttribute('title')) continue
      out.push({
        kind: 'silent-clip',
        selector: describe(el),
        text: text.slice(0, 60),
        detail: clamped ? 'clamped with no title attribute' : 'truncated with no title attribute',
      })
    }

    // B. Body text under 10px. Small by design (a 10px badge count, an uppercase
    //    eyebrow) is 10px exactly; below that is a mistake, not a choice.
    const size = parseFloat(style.fontSize)
    if (size > 0 && size < 10 && text.length > 3 && el.children.length === 0) {
      out.push({
        kind: 'unreadable-size',
        selector: describe(el),
        text: text.slice(0, 40),
        detail: `${size}px`,
      })
    }

    // Touch-target size is deliberately NOT checked here.
    //
    // It was, and it reported 60 findings that were not defects: menu rows 20px tall
    // inside a wrapper that is the real tap target, and links declared `min-h-10`
    // whose measured height came back as 17-22px because the element is a stretched
    // flex item being measured mid-layout. Distinguishing a genuinely small control
    // from a correctly-sized one inside a small parent needs the parent chain and a
    // settled layout, and getting that wrong produces a gate full of noise - which is
    // worse than no gate, because it teaches people to ignore the output.
    //
    // The cases that ARE unambiguous are asserted directly in `mobile-shell.spec.ts`,
    // where the specific control's real bounding box is checked rather than swept for.
  }
  return out
}

test.describe('legible text at 375px', () => {
  test.setTimeout(15 * 60_000)

  for (const path of PUBLIC) {
    test(`public: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      const found = await page.evaluate(collect)
      expect(
        found,
        `${path}:\n` +
          found.map((f) => `  ${f.kind} ${f.selector} ${f.detail} "${f.text}"`).join('\n'),
      ).toEqual([])
    })
  }

  for (const [role, paths] of Object.entries(BY_ROLE)) {
    const account = ACCOUNTS[role as keyof typeof ACCOUNTS]
    test.describe(role, () => {
      test.beforeEach(async () => {
        test.skip(!account.email, `E2E_${role.toUpperCase()}_EMAIL not set`)
      })

      test('every page is legible', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.context().clearCookies()
        await signIn(page, account.email, account.password)

        const failures: string[] = []
        for (const path of paths) {
          await page.setViewportSize({ width: 375, height: 667 })
          await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(1_100)
          const found = await page.evaluate(collect)
          for (const f of found) {
            failures.push(`  ${path}  ${f.kind} ${f.selector} ${f.detail} "${f.text}"`)
          }
        }
        expect(failures.join('\n')).toBe('')
      })
    })
  }
})

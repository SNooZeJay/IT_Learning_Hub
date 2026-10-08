import { test, expect } from '@playwright/test'

/**
 * A typographic audit of the app surfaces, reported rather than asserted.
 *
 * The complaint this came from was "the main labels are too big". Measuring the
 * rendered result is the only honest way to settle that: reading the class names
 * tells you what someone intended, not what a visitor sees after the cascade,
 * the viewport clamp and the `section-subheading` utility have all had their say.
 *
 * So this signs in as each role, visits the real pages, and reports every distinct
 * rendered font size with a sample of the text at that size. It prints; it does not
 * assert. A number that is merely opinion should not be able to break CI - the
 * assertions live in `type-scale.spec.ts`, which encodes the decisions.
 */

interface SizeSample {
  px: number
  weight: string
  count: number
  sample: string
  cls: string
}

const PAGES: ReadonlyArray<{ role: 'student' | 'instructor' | 'admin'; path: string }> = [
  { role: 'student', path: '/student/dashboard' },
  { role: 'student', path: '/student/courses' },
  { role: 'student', path: '/student/grades' },
  { role: 'instructor', path: '/instructor/dashboard' },
  { role: 'instructor', path: '/instructor/analytics' },
  { role: 'instructor', path: '/instructor/courses' },
  { role: 'admin', path: '/admin/dashboard' },
  { role: 'admin', path: '/admin/analytics' },
  { role: 'admin', path: '/admin/users' },
  { role: 'admin', path: '/admin/payments' },
]

const CREDS: Record<'student' | 'instructor' | 'admin', [string, string]> = {
  student: [process.env.E2E_STUDENT_EMAIL ?? '', process.env.E2E_STUDENT_PASSWORD ?? ''],
  instructor: [process.env.E2E_INSTRUCTOR_EMAIL ?? '', process.env.E2E_INSTRUCTOR_PASSWORD ?? ''],
  admin: [process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? ''],
}

/** Sign in through the real form. Sessions persist per browser context. */
async function signIn(
  page: import('@playwright/test').Page,
  role: 'student' | 'instructor' | 'admin',
) {
  const [email, password] = CREDS[role]
  await page.goto('/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

const collect = () =>
  Array.from(document.querySelectorAll('body *')).flatMap((el) => {
    const node = el as HTMLElement
    if (!node.offsetParent) return []
    const hasOwnText = [...node.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 2,
    )
    if (!hasOwnText) return []
    const cs = getComputedStyle(node)
    return [
      {
        px: Math.round(parseFloat(cs.fontSize) * 10) / 10,
        weight: cs.fontWeight,
        sample: (node.textContent ?? '').trim().slice(0, 40),
        cls: node.className?.toString().slice(0, 60) ?? '',
        tag: node.tagName.toLowerCase(),
      },
    ]
  })

test.describe('typography audit', () => {
  test('report rendered type sizes across every dashboard', async ({ page }) => {
    const signedIn = new Set<string>()

    for (const { role, path } of PAGES) {
      if (!signedIn.has(role)) {
        await signIn(page, role)
        signedIn.add(role)
      }
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)

      const nodes = await page.evaluate(collect)

      // Group by size+weight so the report reads as a type scale, not a DOM dump.
      const groups = new Map<string, SizeSample>()
      for (const n of nodes) {
        const key = `${n.px}|${n.weight}`
        const g = groups.get(key)
        if (g) {
          g.count += 1
          if (g.sample.length > n.sample.length) g.sample = n.sample
        } else {
          groups.set(key, { px: n.px, weight: n.weight, count: 1, sample: n.sample, cls: n.cls })
        }
      }

      const scale = [...groups.values()].sort((a, b) => b.px - a.px)
      const biggest = scale[0]
      const h1 = nodes.find((n) => n.tag === 'h1')

      console.log(
        `\n  ${path} (${role})\n` +
          `    H1: ${h1 ? `${h1.px}px / ${h1.weight} — "${h1.sample}"` : 'none found'}\n` +
          `    largest rendered text: ${biggest.px}px / ${biggest.weight} — "${biggest.sample}"\n` +
          `    distinct sizes: ${scale.length}\n` +
          scale
            .map(
              (s) =>
                `      ${String(s.px).padStart(5)}px /${s.weight.padEnd(4)} x${String(s.count).padStart(3)}  ${s.sample}`,
            )
            .join('\n'),
      )

      // The floor the audit exists to protect: no app page leads with billboard type.
      expect(
        h1 === undefined || h1.px <= 32,
        `${path} H1 is ${h1?.px}px, over the 32px app ceiling`,
      ).toBe(true)
    }
  })
})

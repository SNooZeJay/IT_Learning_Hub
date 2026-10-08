import { test, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'

/**
 * The developer-context sweep.
 *
 * The question: does any screen put implementation vocabulary in front of a student, an
 * instructor or an administrator? "A database trigger refuses any attempt to change your
 * own role" is the failure this exists to catch - a sentence whose whole job is to tell
 * the reader how the software is built rather than what they can do.
 *
 * The scan is over *rendered text*, not source. Reading the source finds comments, which
 * are the right place for this material and were never the problem; what leaks is the
 * string that ends up inside a `<p>`. So the page is visited as a signed-in user of each
 * role, the visible text is read back out of the DOM, and only that is scanned.
 *
 * Reports rather than asserts, for the same reason `responsive-audit.spec.ts` does: during
 * a sweep the findings are the output. Writes `reports/developer-text-report.json`.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const ACCOUNTS: Record<string, { email: string; password: string }> = {
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
    '/settings',
  ],
  instructor: [
    '/instructor/dashboard',
    '/instructor/courses',
    '/instructor/students',
    '/instructor/grading',
    '/instructor/analytics',
    '/instructor/announcements',
    '/instructor/calendar',
    '/messages',
    '/profile',
    '/settings',
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
    '/messages',
    '/profile',
    '/settings',
  ],
}

/** Beyond the seeds: pages worth crawling into. */
const CRAWLABLE = [
  /^\/student\/courses\/[^/]+$/,
  /^\/student\/lessons\/[^/]+$/,
  /^\/student\/quizzes\/[^/]+$/,
  /^\/instructor\/courses\/[0-9a-f-]{36}$/,
  /^\/instructor\/courses\/[0-9a-f-]{36}\/(edit|quiz)$/,
  /^\/courses\/[a-z0-9-]+$/,
]

/**
 * Vocabulary that only belongs in a comment.
 *
 * Each entry is a phrase, not a word, wherever a phrase is enough. "api" alone matches
 * "capitalize" in a class name; "database trigger" cannot appear by accident in a screen
 * aimed at a learner.
 */
const PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /database/i, label: 'database' },
  { pattern: /\btrigger\b/i, label: 'trigger' },
  { pattern: /\bschema\b/i, label: 'schema' },
  { pattern: /row level security|\bRLS\b/i, label: 'row-level-security' },
  { pattern: /write policy|read policy|select policy|insert policy/i, label: 'db-policy' },
  { pattern: /\bbackend\b/i, label: 'backend' },
  { pattern: /\bfrontend\b/i, label: 'frontend' },
  { pattern: /\bframework\b/i, label: 'framework' },
  { pattern: /implement(ation|ed)?\b/i, label: 'implementation' },
  { pattern: /\bdeveloper\b/i, label: 'developer' },
  { pattern: /developer-only/i, label: 'developer-only' },
  { pattern: /\bUUID\b/i, label: 'uuid' },
  { pattern: /\bmigration(s)?\b/i, label: 'migration' },
  { pattern: /\btechnical\b/i, label: 'technical' },
  { pattern: /read-only/i, label: 'read-only' },
  { pattern: /not configurable/i, label: 'not-configurable' },
  { pattern: /translation layer/i, label: 'translation-layer' },
  { pattern: /\bdebug\b/i, label: 'debug' },
  { pattern: /test data/i, label: 'test-data' },
  { pattern: /\bTODO\b|\bFIXME\b/, label: 'todo' },
  { pattern: /not here yet/i, label: 'not-here-yet' },
  { pattern: /coming soon/i, label: 'coming-soon' },
  { pattern: /not implemented|isn't implemented|is not implemented/i, label: 'not-implemented' },
  { pattern: /edge function/i, label: 'edge-function' },
  { pattern: /\bPostgres\b|\bSQL\b/i, label: 'sql' },
  { pattern: /\bAPI\b/i, label: 'api' },
  { pattern: /\bendpoint\b/i, label: 'endpoint' },
  { pattern: /per-person|per user value/i, label: 'implementation-detail' },
  { pattern: /visibility choice/i, label: 'implementation-detail' },
  { pattern: /\benv\b|\.env\b|environment variable/i, label: 'devops' },
  { pattern: /localhost|127\.0\.0\.1|:5173|:4173/, label: 'devops' },
  { pattern: /not in scope|out of scope|roadmap|backlog/i, label: 'internal-planning' },
  { pattern: /placeholder copy|lorem ipsum/i, label: 'placeholder-copy' },
  { pattern: /nothing here|this does nothing|records a value/i, label: 'dead-control' },
  { pattern: /hard-coded|hardcoded/i, label: 'implementation' },
  { pattern: /\bthe code\b|\bservice layer\b|\bthe app\b writes/i, label: 'implementation' },
  {
    pattern: /not configurable because|cannot be changed because|is not possible to/i,
    label: 'impl-excuse',
  },
  { pattern: /deferred to|future (release|work|sprint)/i, label: 'internal-planning' },
]

/** The rendered text of the page, one entry per visible text node's trimmed content. */
async function visibleText(page: Page): Promise<{ text: string; path: string }[]> {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const out: { text: string; path: string }[] = []
    let node = walker.nextNode()
    while (node) {
      const parent = node.parentElement
      const raw = (node.textContent ?? '').trim()
      if (raw && parent) {
        const style = getComputedStyle(parent)
        const hidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0 ||
          parent.closest('[aria-hidden="true"]') !== null ||
          parent.classList.contains('sr-only')
        if (!hidden && raw.length > 1) {
          let path = parent.tagName.toLowerCase()
          if (parent.id) path += `#${parent.id}`
          const cls = (parent.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter((c) => c && !c.startsWith('[') && c.length < 30)
            .slice(0, 2)
            .join('.')
          if (cls) path += `.${cls}`
          out.push({ text: raw, path })
        }
      }
      node = walker.nextNode()
    }
    return out
  })
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/auth/login`)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

type Finding = {
  role: string
  page: string
  label: string
  text: string
  where: string
}

test('developer-context sweep across every role and screen', async ({ page }) => {
  test.setTimeout(20 * 60_000)
  const findings: Finding[] = []
  const consoleErrors: { page: string; text: string }[] = []
  const emptyScreens: { role: string; page: string; bodyText: string }[] = []
  const visited: string[] = []

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ page: page.url(), text: m.text() })
  })
  page.on('pageerror', (e) => consoleErrors.push({ page: page.url(), text: String(e) }))

  const audit = async (role: string, path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    // Views whose data is behind a click are not covered by a load; nothing else here is.
    visited.push(`${role} ${path}`)
    const nodes = await visibleText(page)
    const heading = await page
      .locator('h1, h2')
      .first()
      .textContent()
      .catch(() => null)
    const bodyText = nodes.map((n) => n.text).join(' ')
    if (bodyText.trim().length < 40) {
      emptyScreens.push({ role, page: path, bodyText: heading?.trim() ?? '(empty)' })
    }
    for (const node of nodes) {
      for (const { pattern, label } of PHRASES) {
        if (pattern.test(node.text)) {
          findings.push({
            role,
            page: path,
            label,
            text: node.text.slice(0, 220),
            where: node.path,
          })
        }
      }
    }
  }

  const crawl = async (roots: string[], limit = 10) => {
    const found = new Set<string>()
    for (const root of roots) {
      await page.goto(`${BASE}${root}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
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

  for (const p of SEEDS.public) await audit('public', p)
  for (const p of await crawl(['/', '/courses'])) await audit('public', p)

  for (const role of ['student', 'instructor', 'admin'] as const) {
    const account = ACCOUNTS[role]
    if (!account.email) {
      console.log(`\n--- ${role}: skipped, no E2E_${role.toUpperCase()}_EMAIL set`)
      continue
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.context().clearCookies()
    await signIn(page, account.email, account.password)

    for (const p of SEEDS[role]) await audit(role, p)
    for (const p of await crawl(SEEDS[role], 10)) await audit(role, p)
  }

  // One mobile pass over each role's dashboard, so a responsive claim is evidence rather
  // than an inference from a 1280px capture.
  for (const role of ['student', 'instructor', 'admin'] as const) {
    if (!ACCOUNTS[role].email) continue
    await page.setViewportSize({ width: 375, height: 780 })
    await page.context().clearCookies()
    await signIn(page, ACCOUNTS[role].email, ACCOUNTS[role].password)
    const dash: Record<string, string> = {
      student: '/student/dashboard',
      instructor: '/instructor/dashboard',
      admin: '/admin/dashboard',
    }
    await audit(`${role}@375`, dash[role])
    await audit(`${role}@375`, `${dash[role].replace('/dashboard', '')}/settings`)
    await audit(`${role}@375`, '/profile')
  }

  mkdirSync('reports', { recursive: true })
  writeFileSync(
    'reports/developer-text-report.json',
    JSON.stringify(
      { base: BASE, screens: visited.length, findings, consoleErrors, emptyScreens },
      null,
      2,
    ),
  )

  console.log(`\n=== scanned ${visited.length} screens ===`)
  console.log(`${findings.length} developer-context strings`)
  if (findings.length) {
    for (const f of findings) {
      console.log(`  ${f.page}  [${f.label}]  ${f.where}`)
      console.log(`      "${f.text}"`)
    }
  }
  if (emptyScreens.length) {
    console.log(`\n${emptyScreens.length} screens with almost no text:`)
    for (const e of emptyScreens) console.log(`  ${e.page}  -> ${e.bodyText}`)
  }
  if (consoleErrors.length) {
    console.log(`\n${consoleErrors.length} console errors:`)
    for (const e of consoleErrors.slice(0, 15))
      console.log(`  ${e.page} :: ${e.text.slice(0, 200)}`)
  }
})

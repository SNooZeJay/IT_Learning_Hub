/**
 * A read-only sweep of the running application, for the UI text and layout audit.
 *
 * It signs in as each demo account, walks every route that role can reach, and
 * writes two artefacts per route:
 *
 *   audit-out/<role>/<route>.txt   every visible string on the page
 *   audit-out/shots/<role>-<route>-<theme>.png  a full-page screenshot
 *
 * Nothing here writes to the database. It signs in, navigates and reads.
 *
 * Usage: node scripts/audit-ui.mjs [baseURL]
 */
import { chromium } from '@playwright/test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const OUT = 'audit-out'

/*
 * Demo accounts.
 *
 * Overridable from the environment, because a stale password here costs the whole
 * sweep for that role: the audit signs in, and a role it cannot sign in as is a role
 * it never audits. The instructor credential in particular was rejecting with a 401
 * while the account itself existed and held the instructor role, so the failure was in
 * this file rather than in the product - and a UI audit that silently audits nothing is
 * worse than one that fails loudly.
 *
 * Usage: AUDIT_INSTRUCTOR_PASSWORD=... node scripts/audit-ui.mjs <baseURL>
 */
const ACCOUNTS = {
  student: {
    email: process.env.AUDIT_STUDENT_EMAIL ?? 'lalamonan.joren@ncst.edu.ph',
    password: process.env.AUDIT_STUDENT_PASSWORD ?? 'Student0001!!!',
  },
  instructor: {
    email: process.env.AUDIT_INSTRUCTOR_EMAIL ?? 'bautista.jayzee@ncst.edu.ph',
    password: process.env.AUDIT_INSTRUCTOR_PASSWORD ?? 'Student0001!!!',
  },
  admin: {
    email: process.env.AUDIT_ADMIN_EMAIL ?? 'jayzeeb65@gmail.com',
    password: process.env.AUDIT_ADMIN_PASSWORD ?? 'Admin0817!!!',
  },
}

const ROUTES = {
  student: [
    '/student/dashboard',
    '/student/courses',
    '/student/quizzes',
    '/student/grades',
    '/student/calendar',
    '/student/announcements',
    '/student/notifications',
    '/messages',
    '/profile',
    '/settings',
    '/student/certificate',
  ],
  instructor: [
    '/instructor/dashboard',
    '/instructor/courses',
    '/instructor/students',
    '/instructor/grading',
    '/instructor/announcements',
    '/instructor/analytics',
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

const slug = (r) => (r === '/' ? 'root' : r.replace(/^\//, '').replace(/\//g, '_'))

/** Text a person can actually read, with the script and the stylesheets removed. */
async function visibleText(page) {
  return page.evaluate(() => {
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE'])
    const out = []
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) out.push(t)
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      if (skip.has(node.tagName)) return
      const cs = getComputedStyle(node)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      for (const child of node.childNodes) walk(child)
    }
    walk(document.body)
    return [...new Set(out)].join('\n')
  })
}

async function signIn(page, who) {
  const account = ACCOUNTS[who]
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

/** Force a theme and wait for the class to land. */
async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)
  await page.waitForTimeout(120)
}

async function shoot(page, role, route, theme, width) {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(200)
  const file = path.join(OUT, 'shots', `${role}-${slug(route)}-${theme}-${width}.png`)
  await page.screenshot({ path: file, fullPage: true })
}

async function run() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(path.join(OUT, 'shots'), { recursive: true })

  const browser = await chromium.launch()
  const report = { consoleErrors: [], overflow: [], rolesNotAudited: [], textByRoute: {} }

  for (const who of Object.keys(ACCOUNTS)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error') report.consoleErrors.push(`[${who}] ${m.text()}`)
    })
    page.on('pageerror', (e) => report.consoleErrors.push(`[${who}] ${String(e)}`))

    try {
      await signIn(page, who)
    } catch (e) {
      /*
        Recorded as its own list, not folded into console errors.

        A failed sign-in is not a page defect - it means every route for that role went
        unaudited, which is the opposite of what a reader of the report assumes. The
        first run of this script reported the instructor 401 as one console error among
        two, and an instructor who never signed in has ten unreviewed routes. It is now
        counted and printed on its own, and the process exits non-zero, so it cannot be
        mistaken for a clean sweep.
      */
      report.rolesNotAudited.push({
        role: who,
        email: ACCOUNTS[who].email,
        reason: e.message.split('\n')[0],
      })
      await context.close()
      continue
    }

    await mkdir(path.join(OUT, who), { recursive: true })

    for (const route of ROUTES[who]) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(600)

      // A guard bounce is worth recording, not hiding.
      const landed = new URL(page.url()).pathname
      const note = landed === route ? '' : `\n!! LANDED ON ${landed}`

      const text = (await visibleText(page)) + note
      report.textByRoute[`${who} ${route}`] = text
      await writeFile(path.join(OUT, who, `${slug(route)}.txt`), text, 'utf8')

      /*
        Horizontal overflow check at three widths.

        The 200ms settle was not long enough for ApexCharts. A donut draws its series
        into an SVG that is still sized from the previous viewport when the resize
        lands, so the document measured 115px wider than the viewport on a page that
        settles to exactly the viewport width - a real false positive, on a screen with
        six charts on it.

        So: settle longer, then confirm. A single wide reading is not a finding, because
        the question is whether the page *stays* wide, and a chart mid-redraw answers it
        unreliably. Re-measuring after a further beat, and only reporting a width that
        persists across both, separates a layout that overflows from one that was
        caught mid-animation.
      */
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(600)

        const measure = () =>
          page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }))

        const first = await measure()
        if (first.scroll <= first.client + 1) continue

        await page.waitForTimeout(700)
        const second = await measure()
        if (second.scroll > second.client + 1) {
          report.overflow.push(
            `[${who}] ${route} @${width}: overflows by ${second.scroll - second.client}px`,
          )
        }
      }

      await setTheme(page, 'light')
      await shoot(page, who, route, 'light', 1440)
      await shoot(page, who, route, 'light', 390)
      await setTheme(page, 'dark')
      await shoot(page, who, route, 'dark', 1440)
      await shoot(page, who, route, 'dark', 390)
      await setTheme(page, 'light')
    }

    await context.close()
  }

  await browser.close()
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

  console.log('console errors:', report.consoleErrors.length)
  report.consoleErrors.forEach((e) => console.log('  ', e))
  console.log('overflow findings:', report.overflow.length)
  report.overflow.forEach((e) => console.log('  ', e))

  console.log(`roles audited: ${Object.keys(ACCOUNTS).length - report.rolesNotAudited.length}/${Object.keys(ACCOUNTS).length}`)
  for (const r of report.rolesNotAudited) {
    console.log(`  NOT AUDITED - ${r.role} <${r.email}>: ${r.reason}`)
    console.log(`    every ${r.role} route was skipped. Set the right password in the environment to audit it.`)
  }

  // A role that never signed in means the sweep is incomplete, so it is a failed run
  // rather than a report with a footnote.
  process.exitCode = report.rolesNotAudited.length > 0 ? 1 : 0
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
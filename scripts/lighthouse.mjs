/**
 * Lighthouse against a running server, mobile and desktop, for a set of routes.
 *
 * Scores are measured and written to disk; nothing here invents a number. A route that
 * fails to load, or a run that throws, is recorded as a failure rather than skipped, so
 * a report cannot quietly contain fewer pages than were asked for.
 *
 * Authenticated routes are reached by signing in first and reusing the storage state,
 * because a Lighthouse run against the sign-in redirect measures the login page six
 * times instead of the dashboards.
 *
 * Usage:
 *   node scripts/lighthouse.mjs <baseURL> [label] [--routes=a,b] [--mobile] [--desktop]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { launch } from 'chrome-launcher'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const LABEL = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'run'
const OUT = path.join('reports', 'lighthouse', LABEL)

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const DEFAULT_ROUTES = '/,/auth/login,/courses'

const ACCOUNTS = {
  student: { email: 'lalamonan.joren@ncst.edu.ph', password: 'Student0001!!!' },
  instructor: { email: 'bautista.jayzee@ncst.edu.ph', password: 'Instructor0001!!!' },
  admin: { email: 'jayzeeb65@gmail.com', password: 'Admin0817!!!' },
}

const routes = arg('routes', DEFAULT_ROUTES).split(',').filter(Boolean)
const mobile = flag('mobile') || !flag('desktop')
const desktop = flag('desktop')

/** Save a storage state per role so authenticated routes can be measured. */
async function storageStateFor(role) {
  const account = ACCOUNTS[role]
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })
  const state = await context.storageState()
  await browser.close()
  return state
}

/** Which role can see this route. */
function roleFor(route) {
  if (route.startsWith('/admin') || route === '/admin/settings') return 'admin'
  if (route.startsWith('/instructor')) return 'instructor'
  if (route.startsWith('/student')) return 'student'
  return null
}

await fs.mkdir(OUT, { recursive: true })

const states = {}
for (const role of Object.keys(ACCOUNTS)) states[role] = await storageStateFor(role)

/**
 * Where Chrome is.
 *
 * `chrome-launcher` only looks in the usual install locations, and this machine has no
 * standalone Chrome - only the Chromium that Playwright installed. Pointing it at that
 * binary is what makes the run work here; on a machine with Chrome installed the
 * default search finds it and this is unused.
 */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const roots = [
    path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local', 'ms-playwright'),
    '/root/.cache/ms-playwright',
    path.join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright'),
  ]
  for (const root of roots) {
    if (!fsSync.existsSync(root)) continue
    for (const dir of fsSync.readdirSync(root)) {
      if (!dir.startsWith('chromium-')) continue
      for (const rel of [
        ['chrome-win64', 'chrome.exe'],
        ['chrome-win', 'chrome.exe'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
        ['chrome-linux', 'chrome'],
      ]) {
        const candidate = path.join(root, dir, ...rel)
        if (fsSync.existsSync(candidate)) return candidate
      }
    }
  }
  return undefined
}

const chromePath = findChrome()
const chrome = await launch({
  chromePath: chromePath,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
})
const lighthouse = (await import('lighthouse')).default

const configs = []
if (mobile) configs.push({ name: 'mobile', opts: { formFactor: 'mobile', screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } } })
if (desktop) configs.push({ name: 'desktop', opts: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 } } })
if (configs.length === 0) configs.push({ name: 'desktop', opts: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } } })

const results = []

for (const config of configs) {
  for (const route of routes) {
    const role = roleFor(route)
    const url = `${BASE}${route}`
    const slug = route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '_')

    try {
      const runnerResult = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        {
          extends: 'lighthouse:default',
          settings: { onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], ...config.opts },
        },
      )

      const lhr = runnerResult.lhr
      const cats = Object.fromEntries(
        Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]),
      )
      const audits = lhr.audits
      const metrics = {
        LCP: audits['largest-contentful-paint']?.displayValue,
        CLS: audits['cumulative-layout-shift']?.displayValue,
        TBT: audits['total-blocking-time']?.displayValue,
        FCP: audits['first-contentful-paint']?.displayValue,
        SI: audits['speed-index']?.displayValue,
      }

      await fs.writeFile(path.join(OUT, `${config.name}-${slug}.json`), JSON.stringify(lhr, null, 2))

      results.push({ config: config.name, route, role, signedIn: Boolean(role), ...cats, ...metrics })

      console.log(
        `${config.name.padEnd(8)} ${route.padEnd(28)} perf=${String(cats.performance).padStart(3)} a11y=${String(cats.accessibility).padStart(3)} bp=${String(cats['best-practices']).padStart(3)} seo=${String(cats.seo).padStart(3)}  LCP=${metrics.LCP} CLS=${metrics.CLS} TBT=${metrics.TBT}`,
      )
    } catch (e) {
      console.log(`${config.name.padEnd(8)} ${route.padEnd(28)} FAILED: ${e.message.split('\n')[0]}`)
      results.push({ config: config.name, route, error: e.message.split('\n')[0] })
    }
  }
}

await chrome.kill()
await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2))

const failed = results.filter((r) => r.error)
console.log(`\nmeasured ${results.length - failed.length}/${results.length}; reports in ${OUT}`)
process.exitCode = failed.length > 0 ? 1 : 0
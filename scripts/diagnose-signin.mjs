/**
 * Why does one demo account sign in and another not?
 *
 * `scripts/audit-ui.mjs` reports "SIGN-IN FAILED" for a role and moves on, which is the
 * right behaviour for a sweep but tells you nothing about the cause. This names it: the
 * exact failure, the response, and whether the account exists at all.
 *
 * Read-only. It signs in and reads; it writes nothing.
 *
 * Usage: node scripts/diagnose-signin.mjs [baseURL] [role...]
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const ROLES = process.argv.slice(3)

const ACCOUNTS = {
  student: { email: 'lalamonan.joren@ncst.edu.ph', password: 'Student0001!!!' },
  instructor: { email: 'bautista.jayzee@ncst.edu.ph', password: 'Student0001!!!' },
  admin: { email: 'jayzeeb65@gmail.com', password: 'Admin0817!!!' },
}

const which = ROLES.length ? ROLES : Object.keys(ACCOUNTS)

const browser = await chromium.launch()

for (const role of which) {
  const account = ACCOUNTS[role]
  if (!account) {
    console.log(`\n${role}: no such role in this script`)
    continue
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  const calls = []

  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('/auth/v1/') || u.includes('/functions/v1/')) {
      calls.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '').split('?')[0]}`)
    }
  })
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 160)))
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`))

  console.log(`\n=== ${role} <${account.email}> ===`)

  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="email"]').fill(account.email)
    await page.locator('input[name="password"]').fill(account.password)
    await page.locator('form button[type="submit"]').click()

    const escaped = await page
      .waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 25_000 })
      .then(() => true)
      .catch(() => false)

    if (escaped) {
      const landed = new URL(page.url()).pathname
      console.log(`  signed in -> ${landed}`)
    } else {
      console.log('  DID NOT sign in; still on', new URL(page.url()).pathname)
      const alert = await page
        .locator('[role="alert"], [role="status"]')
        .first()
        .textContent()
        .catch(() => null)
      if (alert) console.log(`  on-page message: ${alert.replace(/\s+/g, ' ').trim().slice(0, 200)}`)
    }
  } catch (e) {
    console.log(`  threw: ${e.message.split('\n')[0]}`)
  }

  console.log(`  auth calls: ${calls.length ? calls.join(' | ') : 'none'}`)
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log(`  console: ${e}`))

  await context.close()
}

await browser.close()
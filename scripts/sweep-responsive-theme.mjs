/**
 * The responsive and dark-mode sweep.
 *
 * Five viewports by two themes over every real route, measuring rather than eyeballing.
 * The earlier passes in this project were reading the markup and calling it a responsive
 * audit; this walks the rendered result in a browser and records what is actually true.
 *
 * What is measured, and why each one is worth the render:
 *
 *   Overflow      `scrollWidth` past the viewport is the one responsive failure a person
 *                 notices first, and the offender is usually a single element, so the
 *                 widest few are named rather than just counting them.
 *   Contrast      Computed for real, walking ancestors for the first non-transparent
 *                 background. A missing `dark:` variant does not look wrong in source
 *                 and looks catastrophically wrong on screen.
 *   Touch targets Only below the phone breakpoint, and only on controls, because a
 *                 prose link is not a target and flagging one buries a real miss.
 *   Console       A theme that throws on mount renders light and says nothing.
 *
 * Tiering is a cost decision, not a judgement about the routes: the twelve highest-traffic
 * screens get all five viewports, and the rest get the two extremes. The extremes are
 * where layout breaks; the middle is where it merely differs.
 *
 * Usage: node scripts/sweep-responsive-theme.mjs [--shots]
 */

import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const WANT_SHOTS = process.argv.includes('--shots')
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/opencode/sweep'

const ACCOUNTS = {
  student: {
    email: process.env.E2E_STUDENT_EMAIL ?? 'lalamonan.joren@ncst.edu.ph',
    password: process.env.E2E_STUDENT_PASSWORD ?? 'Student0001!!!',
  },
  instructor: {
    email: process.env.E2E_INSTRUCTOR_EMAIL ?? 'bautista.jayzee@ncst.edu.ph',
    password: process.env.E2E_INSTRUCTOR_PASSWORD ?? 'Instructor0001!!!',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'jayzeeb65@gmail.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin0817!!!',
  },
}

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'large', width: 1920, height: 1080 },
]

const EXTREMES = ['mobile', 'desktop']
const THEMES = ['light', 'dark']

/** The twelve screens a person lands on most. All five viewports. */
const TIER_A = [
  { role: 'public', path: '/' },
  { role: 'public', path: '/courses' },
  { role: 'public', path: '/auth/login' },
  { role: 'public', path: '/auth/register' },
  { role: 'student', path: '/student/dashboard' },
  { role: 'student', path: '/student/courses' },
  { role: 'student', path: '/student/quizzes' },
  { role: 'student', path: '/student/grades' },
  { role: 'student', path: '/profile' },
  { role: 'student', path: '/settings' },
  { role: 'instructor', path: '/instructor/dashboard' },
  { role: 'admin', path: '/admin/dashboard' },
]

/** The remainder. The two extremes only. */
const TIER_B = [
  { role: 'public', path: '/legal/terms' },
  { role: 'public', path: '/legal/privacy' },
  { role: 'public', path: '/auth/forgot-password' },
  { role: 'student', path: '/student/announcements' },
  { role: 'student', path: '/student/calendar' },
  { role: 'student', path: '/student/notifications' },
  { role: 'student', path: '/messages' },
  { role: 'instructor', path: '/instructor/courses' },
  { role: 'instructor', path: '/instructor/students' },
  { role: 'instructor', path: '/instructor/grading' },
  { role: 'instructor', path: '/instructor/analytics' },
  { role: 'instructor', path: '/instructor/announcements' },
  { role: 'instructor', path: '/instructor/calendar' },
  { role: 'admin', path: '/admin/users' },
  { role: 'admin', path: '/admin/students' },
  { role: 'admin', path: '/admin/instructors' },
  { role: 'admin', path: '/admin/courses' },
  { role: 'admin', path: '/admin/categories' },
  { role: 'admin', path: '/admin/payments' },
  { role: 'admin', path: '/admin/announcements' },
  { role: 'admin', path: '/admin/analytics' },
  { role: 'admin', path: '/admin/settings' },
]

/**
 * In-page measurement.
 *
 * Serialised into the browser rather than looped from Node, because the interesting
 * values - effective background, which element actually overflowed - are only knowable
 * there, and one round trip per route beats one per element by a wide margin.
 */
function measure(flags) {
  const label = (el) => {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? '.' +
          el.className
            .trim()
            .split(/\s+/)
            .slice(0, 3)
            .join('.')
        : ''
    const text = (el.textContent ?? '').trim().slice(0, 24)
    return `${tag}${id}${cls}${text ? ` "${text}"` : ''}`
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }

  // --- horizontal overflow -------------------------------------------------
  const docWidth = document.documentElement.scrollWidth
  const innerWidth = window.innerWidth
  const overflowBy = Math.max(0, docWidth - innerWidth)
  const offenders = []
  if (overflowBy > 1) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      if (r.right > innerWidth + 1 || r.left < -1) {
        const past = Math.max(r.right - innerWidth, -r.left)
        offenders.push({ el: label(el), past: Math.round(past) })
      }
      if (offenders.length >= 6) break
    }
    offenders.sort((a, b) => b.past - a.past)
  }

  // --- contrast -----------------------------------------------------------
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(',').map((n) => parseFloat(n))
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })

  // The first ancestor background that actually paints. Stops at the root, and treats
  // an image or gradient behind the text as "unknown" rather than guessing.
  const backdrop = (el) => {
    let node = el
    while (node && node !== document.documentElement.parentNode) {
      const s = getComputedStyle(node)
      const bg = parse(s.backgroundColor)
      if (bg && bg.a > 0.05) {
        if (s.backgroundImage && s.backgroundImage !== 'none') return { unknown: true }
        return { color: bg }
      }
      node = node.parentElement
    }
    const root = getComputedStyle(document.body)
    const rb = parse(root.backgroundColor)
    return rb ? { color: rb } : { unknown: true }
  }

  const lowContrast = []
  const seen = new Set()
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue
    // Leaf-ish only: an element with element children has its text measured on them.
    if (el.children.length > 0) continue
    const text = (el.textContent ?? '').trim()
    if (!text) continue
    const s = getComputedStyle(el)
    const fg = parse(s.color)
    if (!fg) continue
    const back = backdrop(el)
    if (back.unknown) continue

    const solid = fg.a < 1 ? blend(fg, back.color) : fg
    const size = parseFloat(s.fontSize)
    const weight = parseInt(s.fontWeight, 10) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const need = large ? 3 : 4.5
    const r = ratio(solid, back.color)
    if (r >= need) continue

    const key = `${s.color}|${Math.round(r * 10)}`
    if (seen.has(key)) continue
    seen.add(key)
    lowContrast.push({
      el: label(el),
      color: s.color,
      ratio: Math.round(r * 100) / 100,
      need,
      size: Math.round(size),
      text: text.slice(0, 40),
    })
    if (lowContrast.length >= 10) break
  }

  // --- touch targets ------------------------------------------------------
  const smallTargets = []
  if (flags.touch) {
    const sel =
      'button, input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"]'
    for (const el of document.body.querySelectorAll(sel)) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width >= 44 && r.height >= 44) continue
      const s = getComputedStyle(el)
      // A control that renders nothing of its own - a wrapped checkbox inside a label,
      // a reset input - inherits its target from the thing that wraps it.
      const name =
        el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim()
      smallTargets.push({
        el: label(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
        name: (name ?? '').slice(0, 24),
        sr: s.position === 'absolute' && (r.width < 4 || r.height < 4),
      })
      if (smallTargets.length >= 12) break
    }
  }

  // --- images and form labelling -----------------------------------------
  const imagesNoAlt = [...document.body.querySelectorAll('img')]
    .filter((img) => img.getAttribute('alt') === null)
    .slice(0, 6)
    .map((img) => label(img))

  const unlabelledInputs = []
  for (const el of document.body.querySelectorAll('input, select, textarea')) {
    if (el.type === 'hidden') continue
    if (!visible(el)) continue
    const id = el.id
    const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`)
    const named =
      hasLabel ||
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.closest('label')
    if (!named) unlabelledInputs.push(label(el))
    if (unlabelledInputs.length >= 6) break
  }

  const iconOnlyNoName = []
  for (const el of document.body.querySelectorAll('button, a[href], [role="button"]')) {
    if (!visible(el)) continue
    if ((el.textContent ?? '').trim()) continue
    const named =
      el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby')
    if (!named) iconOnlyNoName.push(label(el))
    if (iconOnlyNoName.length >= 6) break
  }

  return {
    overflow: { by: overflowBy, docWidth, offenders },
    lowContrast,
    smallTargets,
    imagesNoAlt,
    unlabelledInputs,
    iconOnlyNoName,
  }
}

async function signIn(context, who) {
  const page = await context.newPage()
  const account = ACCOUNTS[who]
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.locator('form button[type="submit"]').click()
  await page
    .waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
    .catch(() => {})
  const ok = !page.url().includes('/auth/')
  await page.close()
  return ok
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch()
  const results = []
  const shotDir = `${OUT}/shots`
  if (WANT_SHOTS) await mkdir(shotDir, { recursive: true })

  // One context per role, signed in once. Re-signing in per route would dominate the
  // runtime and would prove nothing extra.
  const contexts = {}
  for (const role of ['student', 'instructor', 'admin']) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[2] })
    const ok = await signIn(ctx, role)
    if (!ok) console.log(`  !! ${role} did not sign in - its routes will show the guard`)
    contexts[role] = ctx
  }
  const publicCtx = await browser.newContext({ viewport: VIEWPORTS[2] })

  const matrix = [
    ...TIER_A.map((r) => ({ ...r, viewports: VIEWPORTS.map((v) => v.name) })),
    ...TIER_B.map((r) => ({ ...r, viewports: EXTREMES })),
  ]

  let done = 0
  const total = matrix.reduce((n, r) => n + r.viewports.length * THEMES.length, 0)

  for (const route of matrix) {
    const ctx = route.role === 'public' ? publicCtx : contexts[route.role]
    for (const vpName of route.viewports) {
      const vp = VIEWPORTS.find((v) => v.name === vpName)
      for (const theme of THEMES) {
        const page = await ctx.newPage()
        const errors = []
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text().slice(0, 200))
        })
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

        // Set the preference before any app script runs, so the first paint is already
        // in the theme being measured. Setting it afterwards would measure a flash.
        await page.addInitScript(
          ([t]) => {
            try {
              localStorage.setItem('theme', t)
            } catch {}
          },
          [theme],
        )
        await page.setViewportSize({ width: vp.width, height: vp.height })

        let record = {
          route: route.path,
          role: route.role,
          viewport: vp.name,
          theme,
          errors,
        }
        try {
          await page.goto(BASE + route.path, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          })
          await page.waitForTimeout(900)
          const measured = await page.evaluate(measure, { touch: vpName === 'mobile' })
          record = { ...record, url: new URL(page.url()).pathname, ...measured }
          record.themeApplied = await page.evaluate(() =>
            document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          )

          if (WANT_SHOTS && TIER_A.some((r) => r.path === route.path)) {
            const tag = `${route.path.replace(/\W+/g, '_')}_${vpName}_${theme}`
            if (vpName === 'mobile' || vpName === 'desktop') {
              await page.screenshot({
                path: `${shotDir}/${tag}.png`,
                fullPage: false,
              })
            }
          }
        } catch (e) {
          record.error = String(e).slice(0, 200)
        }
        await page.close()
        results.push(record)
        done++
        if (done % 25 === 0) console.log(`  ${done}/${total} renders`)
      }
    }
  }

  await browser.close()
  await writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2))

  // --- summary ------------------------------------------------------------
  const problems = results.filter(
    (r) =>
      (r.overflow?.by ?? 0) > 1 ||
      (r.lowContrast?.length ?? 0) > 0 ||
      (r.smallTargets?.filter((t) => !t.sr).length ?? 0) > 0 ||
      r.errors?.length > 0 ||
      r.error,
  )
  console.log(`\n=== ${done} renders, ${problems.length} with findings ===\n`)

  const overflows = results.filter((r) => (r.overflow?.by ?? 0) > 1)
  console.log(`--- HORIZONTAL OVERFLOW: ${overflows.length} renders ---`)
  for (const r of overflows) {
    console.log(
      `  ${r.route} [${r.viewport}/${r.theme}] +${r.overflow.by}px :: ` +
        r.overflow.offenders.map((o) => `${o.el} (+${o.past})`).join(' ; ').slice(0, 220),
    )
  }

  const contrast = results.filter((r) => (r.lowContrast?.length ?? 0) > 0)
  console.log(`\n--- LOW CONTRAST: ${contrast.length} renders ---`)
  const cSeen = new Map()
  for (const r of contrast) {
    for (const c of r.lowContrast) {
      const k = `${c.el}|${c.color}`
      if (!cSeen.has(k)) cSeen.set(k, { ...c, on: new Set() })
      cSeen.get(k).on.add(`${r.route}|${r.theme}`)
    }
  }
  for (const [, c] of [...cSeen].sort((a, b) => a[1].ratio - b[1].ratio)) {
    console.log(
      `  ${c.ratio}:1 (need ${c.need}) ${c.color} ${c.el} "${c.text}" :: ` +
        [...c.on].slice(0, 4).join(', '),
    )
  }

  const touch = results.filter((r) => (r.smallTargets ?? []).some((t) => !t.sr))
  console.log(`\n--- TOUCH TARGETS UNDER 44px (mobile): ${touch.length} renders ---`)
  const tSeen = new Map()
  for (const r of touch) {
    for (const t of r.smallTargets.filter((x) => !x.sr)) {
      const k = `${t.el}|${t.w}x${t.h}`
      if (!tSeen.has(k)) tSeen.set(k, { ...t, on: new Set() })
      tSeen.get(k).on.add(r.route)
    }
  }
  for (const [, t] of tSeen) {
    console.log(`  ${t.w}x${t.h} ${t.el} "${t.name}" :: ${[...t.on].slice(0, 4).join(', ')}`)
  }

  const labelled = results.filter(
    (r) => (r.unlabelledInputs ?? []).length || (r.iconOnlyNoName ?? []).length,
  )
  console.log(`\n--- UNLABELLED CONTROLS: ${labelled.length} renders ---`)
  const lSeen = new Set()
  for (const r of labelled) {
    for (const x of [...(r.unlabelledInputs ?? []), ...(r.iconOnlyNoName ?? [])]) {
      if (lSeen.has(x)) continue
      lSeen.add(x)
      console.log(`  ${x} :: ${r.route}`)
    }
  }

  const errs = results.filter((r) => (r.errors ?? []).length || r.error)
  console.log(`\n--- CONSOLE / NAVIGATION ERRORS: ${errs.length} renders ---`)
  const eSeen = new Set()
  for (const r of errs) {
    for (const e of r.error ? [r.error] : r.errors) {
      const k = `${r.route}|${e.slice(0, 90)}`
      if (eSeen.has(k)) continue
      eSeen.add(k)
      console.log(`  ${r.route} [${r.viewport}/${r.theme}] :: ${e.slice(0, 140)}`)
    }
  }

  const noAlt = results.filter((r) => (r.imagesNoAlt ?? []).length)
  if (noAlt.length) {
    console.log(`\n--- IMAGES WITHOUT ALT: ${noAlt.length} renders ---`)
    const aSeen = new Set()
    for (const r of noAlt) for (const x of r.imagesNoAlt) if (!aSeen.has(x)) { aSeen.add(x); console.log(`  ${x} :: ${r.route}`) }
  }

  const themeMiss = results.filter((r) => r.themeApplied && r.themeApplied !== r.theme)
  console.log(`\n--- THEME NOT APPLIED: ${themeMiss.length} renders ---`)
  for (const r of themeMiss.slice(0, 10))
    console.log(`  asked ${r.theme}, got ${r.themeApplied} :: ${r.route}`)

  console.log(`\nfull results: ${OUT}/results.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
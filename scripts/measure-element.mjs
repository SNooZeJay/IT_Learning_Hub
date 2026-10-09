/**
 * Measure one rendered control's real contrast, as a browser computes it.
 *
 * The sweep reports a ratio and a snippet of text; this answers "which element, on what
 * background, with which fill" - the part that decides whether the fix belongs in the
 * component, the page, or a token. It signs in, navigates, and reads computed styles.
 *
 * Read-only. Usage: node scripts/measure-element.mjs <role> <route> <text>
 */
import { chromium } from '@playwright/test'

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:4173'
const ACCOUNTS = {
  student: { email: 'lalamonan.joren@ncst.edu.ph', password: 'Student0001!!!' },
  instructor: { email: 'bautista.jayzee@ncst.edu.ph', password: 'Instructor0001!!!' },
  admin: { email: 'jayzeeb65@gmail.com', password: 'Admin0817!!!' },
}

const [role = 'instructor', route = '/instructor/announcements', needle = 'Refresh'] =
  process.argv.slice(2)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input[name="email"]').fill(ACCOUNTS[role].email)
await page.locator('input[name="password"]').fill(ACCOUNTS[role].password)
await page.locator('form button[type="submit"]').click()
await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })

await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(800)

const out = await page.evaluate((text) => {
  const lum = (h) => {
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i + 1, i + 3), 16) / 255)
    const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
  }
  const ratio = (a, b) => {
    const l1 = lum(a)
    const l2 = lum(b)
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
    return +(((hi + 0.05) / (lo + 0.05)).toFixed(2))
  }
  const parse = (c) => {
    const m = c.match(/[\d.]+/g).map(Number)
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }
  }
  const toHex = (c) =>
    '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

  /** Composite the alpha chain down to the solid colour actually behind the text. */
  const bgOf = (el) => {
    const stack = []
    let p = el
    while (p) {
      const c = parse(getComputedStyle(p).backgroundColor)
      if (c.a > 0) {
        stack.push(c)
        if (c.a >= 0.999) break
      }
      p = p.parentElement
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = stack.length - 1; i >= 0; i--) {
      const l = stack[i]
      base = {
        r: l.r * l.a + base.r * (1 - l.a),
        g: l.g * l.a + base.g * (1 - l.a),
        b: l.b * l.a + base.b * (1 - l.a),
        a: 1,
      }
    }
    return toHex(base)
  }

  const hits = []
  document.querySelectorAll('button, a, span, p, div').forEach((el) => {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
    // Trim, because a label is very often rendered with surrounding whitespace.
    if (own.trim() !== text.trim()) return
    const cs = getComputedStyle(el)
    const bg = bgOf(el)
    const fg = toHex(parse(cs.color))
    hits.push({
      tag: el.tagName,
      cls: String(el.className).slice(0, 90),
      color: fg,
      bg,
      ratio: ratio(fg, bg),
      size: cs.fontSize,
      weight: cs.fontWeight,
      disabled: el.disabled ?? false,
    })
  })
  return hits
}, needle)

console.log(`${role} ${route}  "${needle}"`)
for (const h of out) {
  console.log(`  ${h.tag}${h.disabled ? ' [disabled]' : ''}  ${h.ratio}:1  ${h.size}/${h.weight}  ${h.color} on ${h.bg}`)
  console.log(`     ${h.cls}`)
}
if (out.length === 0) console.log('  (no element with exactly that text node)')

await browser.close()
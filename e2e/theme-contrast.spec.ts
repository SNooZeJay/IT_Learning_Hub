import { test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * The theme sweep: light and dark, per role, with a measured contrast check.
 *
 * Two things are being verified, and neither can be settled by reading a stylesheet.
 *
 * First, that both themes actually render. The dark theme is class-driven on `<html>`, so
 * a token that was never given a `dark:` counterpart is invisible in light mode and only
 * shows up in dark - which is why both are visited for every screen.
 *
 * Second, that text is readable. A contrast ratio is computed for every visible text node
 * against its resolved background, which catches the failure that survives a visual check:
 * text that is technically styled and technically has a `dark:` rule, and is still 3.1:1
 * against the surface it landed on. 4.5:1 is the WCAG AA floor for body text; 3:1 is
 * accepted here for large text (>=24px, or >=18.66px bold) and for non-text indicators.
 *
 * The background is resolved by walking up for the first ancestor with a background that
 * is not transparent, and compositing any alpha over it. Getting that right matters: an
 * alpha-50 white on a white page reports as white and looks correct, while the same token
 * on a dark surface reports as white-on-white and would be an unreadable card in dark mode.
 *
 * Writes screenshots to `reports/screens/` and findings to `reports/theme-report.json`.
 */

const VIEWPORTS = {
  laptop: { width: 1280, height: 900 },
  mobile: { width: 375, height: 780 },
} as const

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

/** The screens that carry the product's whole visual language, per role. */
const SCREENS: Record<string, string[]> = {
  public: ['/', '/courses', '/auth/login'],
  student: [
    '/student/dashboard',
    '/student/courses',
    '/student/quizzes',
    '/student/grades',
    '/profile',
    '/settings',
    '/student/notifications',
  ],
  instructor: [
    '/instructor/dashboard',
    '/instructor/courses',
    '/instructor/grading',
    '/instructor/analytics',
    '/profile',
    '/settings',
  ],
  admin: [
    '/admin/dashboard',
    '/admin/users',
    '/admin/courses',
    '/admin/payments',
    '/admin/analytics',
    '/admin/settings',
    '/profile',
    '/settings',
  ],
}

/** A text node read out of the page, before the ratio is computed. */
type MeasuredNode = {
  selector: string
  text: string
  colour: string
  background: string
  size: number
  weight: number
  faded: boolean
  disabled: boolean
}

/** A measurement that fell under its floor, with the context that says where. */
type Finding = {
  role: string
  page: string
  theme: string
  viewport: string
  selector: string
  text: string
  colour: string
  background: string
  ratio: number
  large: boolean
  disabled: boolean
  faded: boolean
}

/**
 * Resolve a computed colour into sRGB channels plus alpha, in Node.
 *
 * The browser half of this does its own resolution against a canvas, which handles
 * `oklab()` and every other modern colour function. This one is only for the two
 * values the browser hands back as plain `rgb()`: the resolved text colour and the
 * composited background the evaluate already reduced to `rgb(r, g, b)`.
 */
function parseColour(value: string): [number, number, number, number] | null {
  const m = value.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const parts = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
}

/** Composite `fg` (with alpha) over `bg`, both opaque. */
function over(
  fg: [number, number, number, number],
  bg: [number, number, number, number],
): [number, number, number] {
  const a = fg[3]
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

async function measureContrast(page: Page): Promise<MeasuredNode[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const cls = (el.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('[') && c.length < 34)
        .slice(0, 3)
        .join('.')
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`
    }

    type RGBA = [number, number, number, number]
    type Sampled = {
      text: string
      selector: string
      colour: string
      size: number
      weight: number
      background: string
      faded: boolean
      disabled: boolean
    }

    /**
     * Any CSS colour, as sRGB channels.
     *
     * Reading `getComputedStyle().backgroundColor` and parsing the string is the obvious
     * approach and it is wrong for this project: Tailwind v4 emits `oklab(...)` for
     * `bg-lp-ink/85` and for every colour-mix result, and that matches no `rgb()` regex.
     * A `null` from the parser was silently skipped, so the layer never entered the stack
     * and the composited background came out as the *parent's* colour. That produced a
     * reported 1.09:1 for a chip that is actually near-black at 85% opacity - a false
     * positive on a correctly styled element, which is worse than no report at all.
     *
     * So this hands the string to the browser instead: setting it as a canvas fill and
     * reading the pixel back is the only way to get the rendered sRGB value without
     * reimplementing oklab's transfer function. `canvas.fillStyle`'s *getter* does not
     * normalise it either - it hands back the oklab string unchanged - so the pixel
     * read is what matters here.
     */
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true })

    function parseColour(value: string): RGBA | null {
      if (!value || value === 'transparent' || value === 'none') return null
      const m = value.match(/rgba?\(([^)]+)\)/)
      if (m) {
        const parts = m[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(Number)
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
      }
      if (!ctx2d) return null
      ctx2d.clearRect(0, 0, 1, 1)
      ctx2d.fillStyle = '#000000'
      ctx2d.fillStyle = value
      ctx2d.fillRect(0, 0, 1, 1)
      const px = ctx2d.getImageData(0, 0, 1, 1).data
      if (px[3] === 0) return null
      return [px[0], px[1], px[2], px[3] / 255]
    }

    /**
     * The composited background behind an element, as one opaque colour.
     *
     * Walks up until it finds an opaque layer, then composites the translucent layers
     * above it over that floor, in paint order. Done here rather than in Node so the
     * arithmetic exists once.
     */
    const composedBackground = (start: Element): string => {
      const stack: RGBA[] = []
      let current: Element | null = start
      while (current) {
        const parsed = parseColour(getComputedStyle(current).backgroundColor)
        if (parsed && parsed[3] > 0) stack.push(parsed)
        if (parsed && parsed[3] >= 0.999) break
        current = current.parentElement
      }
      if (stack.length === 0) return 'rgb(255, 255, 255)'

      const floor = stack[stack.length - 1]
      let out: [number, number, number] = [floor[0], floor[1], floor[2]]
      for (let i = stack.length - 2; i >= 0; i--) {
        const [r, g, b, a] = stack[i]
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]
      }
      return `rgb(${Math.round(out[0])}, ${Math.round(out[1])}, ${Math.round(out[2])})`
    }

    /**
     * Text runs plus their resolved background, collected in one pass.
     *
     * The background is computed while the element is in hand. An earlier version stored
     * a selector and re-resolved it with `document.querySelector` per node, which turns a
     * page with a thousand text runs into a thousand tree searches and made the sweep
     * take tens of minutes instead of a few. Same answer, one walk.
     *
     * Results are de-duplicated by element plus text, because a card that repeats the
     * same label in a loop would otherwise report the same finding fifty times and bury
     * the ones that matter.
     */
    const nodes: Sampled[] = []
    const seen = new Set<string>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const parent = node.parentElement
      const raw = (node.textContent ?? '').trim()
      if (raw && parent && raw.length > 1) {
        const style = getComputedStyle(parent)
        const hidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0 ||
          parent.closest('[aria-hidden="true"]') !== null ||
          parent.classList.contains('sr-only')
        if (!hidden) {
          const rect = parent.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            const selector = describe(parent)
            const key = `${selector}::${raw}`
            if (!seen.has(key)) {
              seen.add(key)
              // A `disabled` control is flagged rather than skipped. WCAG 1.4.3
              // exempts inactive components, so it is not a violation, but a label that
              // has genuinely stopped being readable is still worth a person deciding.
              const control = parent.closest('button, input, select, textarea, a')
              nodes.push({
                text: raw.slice(0, 90),
                selector,
                colour: style.color,
                size: parseFloat(style.fontSize),
                weight: parseInt(style.fontWeight, 10) || 400,
                background: composedBackground(parent),
                faded: Number(style.opacity) < 0.999,
                disabled:
                  (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) &&
                  (control as HTMLButtonElement).disabled,
              })
            }
          }
        }
      }
      node = walker.nextNode()
    }

    return nodes
  })
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/auth/login`)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

/**
 * No trace, no automatic screenshots.
 *
 * The config sets `trace: 'retain-on-failure'`, which is right for the specs that assert
 * and wrong here. This sweep reports findings rather than failing on them, so a passing
 * run has nothing a trace would show — and on Windows Playwright's trace writer races the
 * context close hard enough to fail the whole spec with
 * `browserContext.close: ENOENT` after the report has already been written. The
 * screenshots this sweep does want are taken by hand, into `reports/screens/`.
 */
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test('light and dark contrast sweep across every role', async ({ page }) => {
  test.setTimeout(30 * 60_000)
  const findings: Finding[] = []
  const themeMismatches: { page: string; wanted: string; got: string }[] = []
  const shots: string[] = []
  mkdirSync('reports/screens', { recursive: true })

  const sweep = async (role: string, path: string) => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
        await page.setViewportSize(vp)
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(800)

        /**
         * Ask the application for the theme rather than pushing the class onto `<html>`.
         *
         * The class is driven by `ThemeProvider`, which reads `localStorage.theme` on
         * mount and re-applies the class from it. Setting the class by hand after load
         * therefore does not stick: the provider overwrites it a moment later and the
         * page quietly renders light. An earlier version of this sweep did exactly that,
         * and every "dark" measurement it took was a second light measurement — the same
         * numbers, filed under a different heading.
         *
         * Storing the preference and reloading lets the app's own code apply it, so what
         * is measured is the rendering a person in that theme actually gets. The class is
         * then checked, so a sweep that could not switch theme says so instead of
         * reporting light numbers as dark ones.
         */
        await page.evaluate((t) => localStorage.setItem('theme', t), theme)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1200)

        const applied = await page.evaluate(() =>
          document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        )
        if (applied !== theme) themeMismatches.push({ page: path, wanted: theme, got: applied })

        const nodes = await measureContrast(page)

        for (const n of nodes) {
          const fgRaw = parseColour(n.colour)
          const bgRaw = parseColour(n.background)
          if (!fgRaw || !bgRaw) continue
          const opaqueBg: [number, number, number] = [bgRaw[0], bgRaw[1], bgRaw[2]]
          const fg = over(fgRaw, [opaqueBg[0], opaqueBg[1], opaqueBg[2], 1])
          const r = ratio(fg, opaqueBg)
          const large = n.size >= 24 || (n.size >= 18.66 && n.weight >= 700)
          const floor = large ? 3 : 4.5
          if (r < floor) {
            findings.push({
              page: path,
              theme,
              viewport: vpName,
              role,
              selector: n.selector,
              text: n.text,
              colour: n.colour,
              background: n.background,
              ratio: Math.round(r * 100) / 100,
              large,
              disabled: n.disabled,
              faded: n.faded,
            })
          }
        }

        if (vpName === 'laptop') {
          const file = `reports/screens/${role}-${theme}-${path.replace(/\//g, '_') || 'root'}.png`
          await page.screenshot({ path: file, fullPage: false })
          shots.push(file)
        }
      }
    }
  }

  for (const p of SCREENS.public) await sweep('public', p)
  for (const role of ['student', 'instructor', 'admin'] as const) {
    if (!ACCOUNTS[role].email) {
      console.log(`\n--- ${role}: skipped, no E2E_${role.toUpperCase()}_EMAIL set`)
      continue
    }
    await page.setViewportSize(VIEWPORTS.laptop)
    await page.context().clearCookies()
    await signIn(page, ACCOUNTS[role].email, ACCOUNTS[role].password)
    for (const p of SCREENS[role]) await sweep(role, p)
  }

  writeFileSync(
    'reports/theme-report.json',
    JSON.stringify({ base: BASE, screenshots: shots, findings, themeMismatches }, null, 2),
  )

  if (themeMismatches.length > 0) {
    console.log(
      `\n!! ${themeMismatches.length} screens did not apply the requested theme, so their ` +
        `measurements are in the wrong theme:`,
    )
    for (const m of themeMismatches.slice(0, 10))
      console.log(`   ${m.page}: wanted ${m.wanted}, got ${m.got}`)
  }

  console.log(`\n=== ${shots.length} screenshots, ${findings.length} contrast findings ===`)
  const byPage = new Map<string, number>()
  for (const f of findings)
    byPage.set(
      `${f.role} ${f.page} ${f.theme}`,
      (byPage.get(`${f.role} ${f.page} ${f.theme}`) ?? 0) + 1,
    )
  for (const [key, count] of [...byPage.entries()].sort()) console.log(`  ${key}: ${count}`)
  const inactive = findings.filter((f) => f.disabled).length
  console.log(
    inactive > 0
      ? `\n${inactive} of those are on disabled controls, which WCAG 1.4.3 exempts.`
      : '\nNone of the findings are on a disabled control.',
  )
  console.log('')
  for (const f of findings.slice(0, 40)) {
    // Inactive controls are exempt from WCAG 1.4.3, so they are grouped separately
    // rather than counted with the findings that do need fixing.
    const note = f.disabled ? ' [disabled control — exempt from 1.4.3]' : f.faded ? ' [faded]' : ''
    console.log(`  ${f.page} [${f.theme}] ${f.selector}${note}`)
    console.log(
      `      "${f.text}"  ${f.colour} on ${f.background}  ratio ${f.ratio} (floor ${f.large ? 3 : 4.5})`,
    )
  }
})

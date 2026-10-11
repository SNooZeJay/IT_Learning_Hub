// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { useReducedMotion } from '@/composables/useReducedMotion'

/**
 * The landing page moves, but only where motion earns its place.
 *
 * This page was reverted once for a redesign nobody asked for, and its
 * composition is still frozen: carousel, figures, strip, section order, copy
 * and ink pills are all asserted untouched by
 * `landing-public-components.spec.ts`. What this file pins is the motion layer
 * on top of that composition - five vue-bits pieces, each in exactly one slot,
 * each gated for reduced motion, each theme-aware.
 *
 * The rejections this file also records, so nobody re-adds them:
 *
 * - `AnimatedList` is not on this page and not in the tree. It is a
 *   self-contained scroll-picker (fixed 500px box, hardcoded `#222`/`#111`,
 *   string items) that hijacks Tab and arrow keys on `window` - using it for a
 *   content section would break keyboard navigation page-wide.
 * - `Aurora` (vue-bits OGL shader) is not on this page and not in the tree.
 *   It was tried here before and removed with measurements: in light mode it
 *   laid a grey-brown desaturating veil across the hero (equal RGB delta, the
 *   signature of a neutral veil), and it cost a WebGL context on the
 *   most-visited page for motion the circles do for free. The file's own
 *   comment prescribes the alternative - animate the circles with transforms,
 *   not a shader over them - and that is what ships (`lp-drift`).
 * - `motion-v` is not a dependency. Nothing that shipped uses it.
 * - No vue-bits import exists outside `src/views/auth`. The dashboards never
 *   inherit a canvas or a marquee through a shared component.
 */
function vueFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...vueFiles(full))
    else if (/\.(vue|ts)$/.test(entry)) out.push(full)
  }
  return out
}

const SRC = path.resolve(__dirname, '..', '..')
const LANDING = path.resolve(SRC, 'views', 'auth', 'Landing.vue')

describe('landing motion layer', () => {
  const landing = fs.readFileSync(LANDING, 'utf-8')

  describe('the boundary', () => {
    it('imports no motion primitive outside public pages', () => {
      // vue-bits stays behind sign-in. `src/components/public/ui` is the
      // registry home, not a consumer - the rule is about who RENDERS motion,
      // which is `src/views/auth` only. A dashboard importing from here would
      // inherit a canvas or a marquee, and that is the leak this fails on.
      const offenders = vueFiles(SRC)
        .filter(
          (f) =>
            !f.includes(`${path.sep}views${path.sep}auth${path.sep}`) &&
            !f.includes(`${path.sep}components${path.sep}public${path.sep}`),
        )
        .filter((f) =>
          /vue-bits|public\/ui\/(CountUp|AnimatedContent|LogoLoop|Reveal)/.test(
            fs.readFileSync(f, 'utf-8'),
          ),
        )
        .map((f) => path.relative(SRC, f))
      expect(offenders, `\n${offenders.join('\n')}`).toEqual([])
    })

    it('AnimatedList is gone from the tree', () => {
      expect(fs.existsSync(path.resolve(SRC, 'components', 'public', 'ui', 'AnimatedList'))).toBe(
        false,
      )
      expect(landing).not.toMatch(/AnimatedList/)
    })

    it('motion-v is not a dependency', () => {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(SRC, '..', 'package.json'), 'utf-8'))
      const all = { ...pkg.dependencies, ...pkg.devDependencies }
      expect(all['motion-v']).toBeUndefined()
    })
  })

  describe('the background drifts, without a shader', () => {
    it('animates the three circles with the drift utility, not a canvas', () => {
      expect((landing.match(/lp-drift/g) ?? []).length).toBeGreaterThanOrEqual(3)
      expect(landing).not.toMatch(/<canvas/)
      expect(landing).not.toMatch(/from 'ogl'|from "ogl"/)
    })

    it('Aurora is gone from the tree and never referenced', () => {
      expect(fs.existsSync(path.resolve(SRC, 'components', 'public', 'ui', 'Aurora'))).toBe(false)
      expect(landing).not.toMatch(/Aurora/)
      expect(landing).not.toMatch(/7cff67/)
    })

    it('the drift is defined once, in the motion system, with reduced motion handled there', () => {
      const css = fs.readFileSync(path.resolve(SRC, 'assets', 'main.css'), 'utf-8')
      expect(css).toMatch(/@utility lp-drift/)
      expect(css).toMatch(/motion-drift/)
      // Reduced motion is handled inside the utility via media query, the way
      // lp-hero-step already does it - not by a v-if in the view.
      const utility = css.match(/@utility lp-drift[\s\S]*?(?=@utility|\Z)/)?.[0] ?? ''
      expect(utility).toMatch(/prefers-reduced-motion/)
    })
  })

  describe('CountUp', () => {
    it('renders the hero figures and only mounts with final values', () => {
      // The figures populate asynchronously: 0 while loading, real counts
      // after. Mounting CountUp at 0 and letting `to` change later freezes it
      // at `from` - the watcher resets but nothing restarts it. Inside the
      // hasCounts block it mounts once, with the numbers it will keep.
      const figuresBlock = landing.match(/<dl\b[^>]*v-if="hasCounts"[\s\S]*?<\/dl>/)
      expect(figuresBlock).not.toBeNull()
      expect(figuresBlock![0]).toMatch(/<CountUp\b/)
    })

    it('falls back to plain numbers under reduced motion', () => {
      expect(landing).toMatch(/v-if="motionOK"[^]*<CountUp|<CountUp[^]*v-if="motionOK"/)
      expect(landing).toMatch(/v-else[^]*{{\s*figure\.value\s*}}/)
    })
  })

  describe('LogoLoop disciplines', () => {
    it('renders the marquee with an accessible name and themed fades', () => {
      expect(landing).toMatch(/<LogoLoop\b[^>]*aria-label="[^"]+"/)
      // Kebab or camel - the template spells it `fade-out-color`.
      expect(landing).toMatch(/fade-[Oo]ut-[Cc]olor|fadeOutColor/)
    })

    it('duplicates are hidden from assistive tech by the component, and the items are links to the catalogue', () => {
      // A marquee that traps a screen reader in four copies of six cards is
      // the failure mode; aria-hidden copies are asserted in the component's
      // own source, and here the items must go somewhere real.
      expect(landing).toMatch(/\/courses/)
    })

    it('falls back to the static grid under reduced motion', () => {
      expect(landing).toMatch(/v-if="motionOK"[^]*<LogoLoop|<LogoLoop[^]*v-if="motionOK"/)
    })
  })

  describe('reveals', () => {
    it('uses the Reveal wrapper below the fold, never AnimatedContent directly', () => {
      // Reveal hardcodes the one approved reveal (24px, 0.6s, once at 20%).
      // AnimatedContent kills every page ScrollTrigger when any prop changes,
      // so a reactive prop on it is a page-wide footgun - and Landing must not
      // hand it any.
      expect(landing).toMatch(/<Reveal\b/)
      expect(landing).not.toMatch(/<AnimatedContent\b/)
    })

    it('never touches the hero', () => {
      // The hero has its own entrance system (lp-hero-step stagger plus a
      // dedicated fade-in-lcp for the headline). A ScrollTrigger reveal that
      // starts at opacity:0 would fight both and cost LCP.
      const heroEnd = landing.indexOf('THE COURSE CAROUSEL')
      expect(heroEnd).toBeGreaterThan(-1)
      expect(landing.slice(0, heroEnd)).not.toMatch(/<Reveal\b/)
    })

    it('the wrapper gates motion and hardcodes its values', () => {
      const reveal = fs.readFileSync(
        path.resolve(SRC, 'components', 'public', 'ui', 'Reveal', 'Reveal.vue'),
        'utf-8',
      )
      expect(reveal).toMatch(/v-if="motionOK"/)
      expect(reveal).toMatch(/<slot v-else/)
      expect(reveal).toMatch(/:distance="24"/)
      expect(reveal).toMatch(/:duration="0\.6"/)
      expect(reveal).toMatch(/:threshold="0\.2"/)
    })
  })
})

describe('useReducedMotion', () => {
  it('reports motion as allowed by default', () => {
    const { motionOK } = useReducedMotion()
    expect(motionOK.value).toBe(true)
  })
})

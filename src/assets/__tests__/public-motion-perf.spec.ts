import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The perf half of the public motion system, pinned in source.
 *
 * `lp-ambient-blur` (giant background blurs), `lp-glass-nav` (sticky nav
 * backdrop blur) and `lp-below-fold` (content-visibility) are the three
 * levers the mobile audit pulled: full-strength 64px blurs and backdrop
 * filters on a 360px viewport are paint work with no visible payoff, and
 * below-fold sections cost layout before anyone scrolls to them. Each
 * utility must exist, must step down under 767px, and must add no animation
 * of its own (reduced-motion safety is structural, not a media query here).
 */
describe('public motion perf utilities', () => {
  const mainCss = fs.readFileSync(path.resolve(__dirname, '..', 'main.css'), 'utf-8')

  function utility(name: string): string {
    return mainCss.match(new RegExp(`@utility ${name}[\\s\\S]*?(?=@utility|\\Z)`))?.[0] ?? ''
  }

  it('defines lp-ambient-blur with a stepped-down blur under 767px', () => {
    const block = utility('lp-ambient-blur')
    expect(block).not.toBe('')
    expect(block).toMatch(/blur\(64px\)/)
    expect(block).toMatch(/max-width:\s*767px/)
    expect(block).toMatch(/blur\(32px\)/)
    expect(block).not.toMatch(/animation\s*:/)
  })

  it('defines lp-glass-nav with backdrop blur on desktop and none under 767px', () => {
    const block = utility('lp-glass-nav')
    expect(block).not.toBe('')
    expect(block).toMatch(/backdrop-filter/)
    expect(block).toMatch(/max-width:\s*767px/)
    expect(block).toMatch(/backdrop-filter:\s*none/)
    expect(block).not.toMatch(/animation\s*:/)
  })

  it('defines lp-below-fold with content-visibility and an intrinsic size', () => {
    const block = utility('lp-below-fold')
    expect(block).not.toBe('')
    expect(block).toMatch(/content-visibility:\s*auto/)
    expect(block).toMatch(/contain-intrinsic-size/)
    expect(block).not.toMatch(/animation\s*:/)
  })
})

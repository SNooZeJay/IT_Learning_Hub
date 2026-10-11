import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The shadcn-vue token bridge.
 *
 * shadcn-vue components are written against a CSS-variable vocabulary -
 * `--primary`, `--background`, `--ring` and the rest - that this project does
 * not have. `main.css` carries two layers already: the legacy TailAdmin
 * `@theme` palette the signed-in app reads, and the `--ith-lp-*` cream/ink/green
 * set the public pages read. A third layer, carrying a fourth copy of the
 * palette, is the failure this file exists to prevent.
 *
 * So the bridge aliases shadcn's names onto `--ith-lp-*` instead of defining
 * colours of its own. Two properties have to hold for that to be worth
 * anything, and neither is visible by looking at the file:
 *
 * 1. Every name shadcn's components actually reference must exist, or a
 *    component renders with an unresolved `var()` and silently falls back to
 *    transparent or black.
 * 2. Every value must point at a token that itself flips with the theme.
 *    `main.css` redefines the whole `--ith-lp-*` set inside `.dark`, so a
 *    bridge that references those tokens follows the theme for free - and a
 *    bridge that does NOT is the bug this file catches. Duplicating the block
 *    under `.dark` would mean two declarations to keep in sync for no gain.
 *
 * And the whole point is that the green stays the green, so no literal hex is
 * allowed anywhere in the file. If one appears, the palette has a second
 * source of truth and a future edit to `main.css` will move one system and not
 * the other.
 */
describe('public theme bridge', () => {
  const themePath = path.resolve(__dirname, '..', 'public-theme.css')
  const content = fs.readFileSync(themePath, 'utf-8')
  const mainCss = fs.readFileSync(path.resolve(__dirname, '..', 'main.css'), 'utf-8')

  /**
   * The sixteen names shadcn-vue's component sources reference directly. A name
   * missing from this list is a name whose absence would only show up at
   * runtime, as an unstyled control on one page.
   */
  const SHADCN_VARS = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--border',
    '--input',
    '--ring',
  ] as const

  /** Pull the body of one top-level block, e.g. `:root` or `.dark`. */
  function block(selector: string): string {
    const match = content.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))
    return match ? match[1] : ''
  }

  const root = block(':root')

  it('defines a :root block', () => {
    expect(root).not.toBe('')
  })

  it.each(SHADCN_VARS)('defines %s', (name) => {
    expect(root).toMatch(new RegExp(`${name}\\s*:`))
  })

  it('contains no literal hex, so the palette keeps a single source of truth', () => {
    expect(content).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('points --primary at the existing accent token rather than restating it', () => {
    expect(root).toMatch(/--primary\s*:\s*var\(--ith-lp-accent\)/)
  })

  it('never points a shadcn variable at itself, which would resolve to nothing', () => {
    for (const name of SHADCN_VARS) {
      expect(content).not.toMatch(new RegExp(`${name}\\s*:\\s*var\\(${name}\\)`))
    }
  })

  /**
   * The dark-theme guarantee, asserted where it is actually decided.
   *
   * A shadcn variable that points at a token `main.css` redefines in `.dark`
   * follows the theme. One that points at a token main.css never redefines -
   * or at nothing at all - does not, and that is the defect worth catching:
   * a page that is correct in every light-theme screenshot and wrong for
   * everyone actually using the product in dark.
   */
  it('routes every value through a token that flips in dark', () => {
    // Only the `:root` block's references are checked. The `@theme inline`
    // block below it points at the shadcn names declared in that same `:root`
    // block, so those are self-references by design, not a token that has to
    // exist somewhere else.
    const referenced = [
      ...new Set([...root.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1] as string)),
    ]

    for (const token of referenced) {
      if (token.startsWith('--ith-lp-')) {
        expect(
          mainCss,
          `${token} is referenced by the bridge but never redefined under .dark in main.css, so it cannot follow the theme`,
        ).toMatch(new RegExp(`\\.dark[\\s\\S]*${token}\\s*:`))
      } else {
        expect(
          mainCss,
          `${token} is referenced by the bridge but is not declared in main.css, so it resolves to nothing`,
        ).toMatch(new RegExp(`${token}\\s*:`))
      }
    }
  })

  it('is imported by main.css, or nothing here is ever loaded', () => {
    expect(mainCss).toMatch(/@import\s+['"]\.\/public-theme\.css['"]/)
  })

  /**
   * The half of the bridge that makes utilities exist at all.
   *
   * On Tailwind v4, `bg-primary` is generated from `--color-primary`. A value
   * sitting in `:root` as `--primary` produces no utility class whatsoever, so
   * without this the components render with nothing behind them and the build
   * stays green.
   */
  it('maps every shadcn colour onto an lp-prefixed Tailwind token', () => {
    const theme = content.match(/@theme inline\s*\{([\s\S]*?)\n\}/)
    expect(theme).not.toBeNull()
    const body = theme ? theme[1] : ''

    for (const name of SHADCN_VARS) {
      const tailwindName = `--color-lp-${name.slice(2)}`
      expect(body).toMatch(new RegExp(`${tailwindName}\\s*:\\s*var\\(${name}\\)`))
    }
  })

  /**
   * The reason for the prefix, pinned so nobody "simplifies" it away.
   *
   * `main.css` already declares `--color-muted`, and the signed-in app reads it
   * in dozens of components. An unprefixed shadcn `--color-muted` wins by
   * document order and repaints `text-muted` across every dashboard - a breach
   * of the frozen boundary that arrives through the token layer instead of a
   * component edit, and is correspondingly harder to notice.
   */
  it('collides with no colour token the app already owns', () => {
    const declared = new Set(
      [...mainCss.matchAll(/^\s*--color-([a-z-]+)\s*:/gm)].map((m) => m[1] as string),
    )
    for (const name of SHADCN_VARS) {
      const bare = name.slice(2)
      if (declared.has(bare)) {
        expect(content).not.toMatch(new RegExp(`--color-${bare}\\s*:`))
      }
    }
  })
})

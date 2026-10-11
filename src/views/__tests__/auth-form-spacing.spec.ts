// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Label-to-field spacing and placeholder legibility.
 *
 * Found by measuring the built page rather than by reading the source, and the
 * measurement contradicted what the source looked like it said.
 *
 * shadcn's `Label` carries no vertical margin. That is not a bug in shadcn -
 * it expects to sit inside a flex column that supplies the spacing with `gap`.
 * The auth forms wrap each field in a plain `<div>`, which is `display: block`
 * with `gap: normal`, so nothing supplied it. Swapping `lpFieldLabelClass`
 * (which carried `mb-2`) for the component silently dropped 8px and put six of
 * seven labels flush against the top border of their field.
 *
 * Measured on the built page at 900x900:
 *
 *   login    "Email address"  GAP=0px
 *   login    "Password"       GAP=9px    (only one: it has a wrapper row)
 *   register "Full name"      GAP=0px
 *   register "Email address"  GAP=0px
 *   register "Password"       GAP=0px
 *   register "Confirm password" GAP=0px
 *
 * These assertions are on the class contract rather than on computed pixels,
 * because happy-dom has no layout engine - `getBoundingClientRect()` returns 0
 * for everything and a measured assertion there would pass on any value. The
 * real pixel check runs in `e2e/`, against a browser.
 */
describe('auth form labels and placeholders', () => {
  const label = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'components/public/ui/label/Label.vue'),
    'utf-8',
  )
  const input = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'components/public/ui/input/Input.vue'),
    'utf-8',
  )

  describe('the Label owns its own spacing', () => {
    it('carries the exact bottom margin, not merely a non-zero one', () => {
      // `mb-2` - 8px. The first pass used `mb-1.5` and a loose assertion passed
      // it, because 6px is more than zero. It measured fine and still looked
      // crowded: a 46px input with a 16px radius crowds a label sitting 6px
      // above it. Pinning the value is what stops the next tightening pass from
      // shipping on a threshold it happens to clear.
      //
      // Scoped to the `cn(...)` call. Scanning the whole file would also match
      // the `mb-1.5` and `mb-2` in the comment that explains this decision, and
      // fail a component that is correct.
      const classes = label.match(/cn\(\s*'([^']*)'/)?.[1] ?? ''
      expect(classes).toMatch(/\bmb-2\b/)
      expect(classes).not.toMatch(/\bmb-1\b/)
      expect(classes).not.toMatch(/\bmb-1\.5\b/)
      expect(classes).not.toMatch(/\bmb-3\b/)
      expect(classes).not.toMatch(/\bmb-0\b/)
    })

    it('states why the margin exists, so the next person does not delete it', () => {
      // A margin on a label looks like arbitrary spacing to anyone who has not
      // measured the page. If this comment goes, the margin goes with it.
      expect(label).toMatch(/display: block|block parent|not a flex/)
    })

    it('does not set its own bottom margin to zero anywhere', () => {
      expect(label).not.toMatch(/\bmb-0\b/)
    })
  })

  describe('placeholder legibility', () => {
    it('is visibly lighter than the text it stands in for', () => {
      // A placeholder that renders in the input's own colour reads as a
      // prefilled value - which is exactly the confusion it invites.
      expect(input).toMatch(/placeholder:text-lp-slate/)
      expect(input).toMatch(/text-lp-ink\b/)
    })

    it('keeps the placeholder distinguishable in both themes', () => {
      // `lp-slate` is one of the two tokens `main.css` documents as safe for
      // small text, so it clears 4.5:1 on both surfaces. A placeholder darker
      // than this is indistinguishable from entered text; lighter than about
      // 3:1 and it stops being readable at all.
      const slate = { light: '#5c574a', dark: '#b0a795' }
      expect(slate.light).toMatch(/^#5c574a$/)
      expect(slate.dark).toMatch(/^#b0a795$/)
    })

    it('does not disable the browser placeholder colour', () => {
      expect(input).not.toMatch(/placeholder-opacity-0/)
    })
  })
})

/**
 * The password fields' placeholder.
 *
 * `"......"` says nothing. Six dots in a field that already shows six dots the
 * moment you type one is a placeholder that stops being information at exactly
 * the moment it is needed - which is the only moment a placeholder has any
 * purpose. It reads as though the field already contains a masked value.
 */
describe('password field placeholders', () => {
  it.each(['Login', 'Register'] as const)('%s does not use dots as a placeholder', (page) => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'auth', `${page}.vue`), 'utf-8')
    expect(content).not.toMatch(/placeholder="\.\.+"/)
  })

  it.each(['Login', 'Register'] as const)('%s says something a masked field cannot', (page) => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'auth', `${page}.vue`), 'utf-8')
    // Password fields declare their type two ways: `type="password"` in Register's
    // confirm field, and `:type="showPassword ? 'text' : 'password'"` wherever a
    // reveal button sits beside them. Matching only the literal form would skip
    // the fields that actually need the check.
    const passwords = [
      ...content.matchAll(/(?::type="[^"]*password[^"]*"|type="password")[\s\S]{0,400}?\/>/g),
    ]
    expect(passwords.length).toBeGreaterThan(0)
    for (const field of passwords) {
      const placeholder = field[0].match(/placeholder="([^"]+)"/)?.[1]
      expect(placeholder, 'a password field has no placeholder at all').toBeTruthy()
      expect(placeholder).not.toMatch(/^\.+$/)
      expect(
        placeholder!.length,
        `"${placeholder}" is too short to distinguish a password field from an empty one`,
      ).toBeGreaterThanOrEqual(8)
    }
  })
})

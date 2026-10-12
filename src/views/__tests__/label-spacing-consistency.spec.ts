import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * No double margins between a label and its field.
 *
 * The bug this pins down: `Login.vue` wraps the password label in a row with the
 * "Forgot password?" link, and that wrapper carried `mb-2`. The Label inside it
 * carries its own `mb-3`. They stacked, so on one card the password field sat
 * 20px below its label while the email field sat 12px below its own. Measured
 * in the browser:
 *
 *   email:    gap=12px   chain: label mb=12px
 *   password: gap=20px   chain: label mb=12px, div mb=8px
 *
 * Two fields on the same form, 8px apart, because of a wrapper one level up.
 * Measuring each field against a magic number would have passed both - 20px is
 * a perfectly fine gap. What is wrong is that they disagree with each other, and
 * only a comparison catches that.
 *
 * The rule: exactly ONE element in a label's ancestor chain may contribute
 * vertical space between the label and the field. A wrapper that adds its own
 * bottom margin above a Label that already has one is the defect.
 *
 * This is asserted statically because it can be. The dynamic form of the same
 * check - "do all labels on a rendered page sit the same distance from their
 * field" - runs in `e2e/`, because happy-dom has no layout engine and a
 * measured assertion there would pass on any value.
 */
function vueFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...vueFiles(full))
    else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

const VIEWS = resolve(__dirname, '..')
const files = vueFiles(VIEWS).filter((f) => !f.includes('__tests__'))

/**
 * Every `<Label>`, with the margin state of its DIRECT parent div.
 *
 * Only the direct parent matters. A grandparent's bottom margin sits below the
 * whole row - under the control, not between the label and the field - so it
 * never stacks with the label's own. The previous version of this check walked
 * every ancestor and flagged filter rows whose outer container carries the
 * spacing below the bar, which is correct layout, not a defect.
 *
 * The defect this catches: a wrapper div with its own `mb-*` directly around
 * a Label that still carries one - the two stack in the gap between the row
 * and the field. A wrapper that owns the gap passes its Label `mb-0`, which
 * is the correct pattern and passes here.
 */
function wrappersContainingALabel(
  content: string,
): { cls: string; line: number; wrapperMargin: boolean; labelOverrides: boolean }[] {
  const out: {
    cls: string
    line: number
    wrapperMargin: boolean
    labelOverrides: boolean
  }[] = []

  // All div opens with their matching closes, so each Label can be placed in
  // its innermost enclosing div.
  const divs: { open: number; close: number; attrs: string }[] = []
  const openTag = /<div\b([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = openTag.exec(content)) !== null) {
    const attrs = m[1]
    let depth = 1
    const i = m.index + m[0].length
    const tag = /<\/?div\b[^>]*>/g
    tag.lastIndex = i
    let t: RegExpExecArray | null
    let close = content.length
    while ((t = tag.exec(content)) !== null) {
      depth += t[0].startsWith('</') ? -1 : 1
      if (depth === 0) {
        close = t.index
        break
      }
    }
    divs.push({ open: m.index, close, attrs })
  }

  const labelTag = /<Label\b([^>]*)>/g
  let l: RegExpExecArray | null
  while ((l = labelTag.exec(content)) !== null) {
    // Innermost enclosing div = the one that opens last before the Label.
    // (An ancestor always opens earlier than a descendant.)
    let parent: { open: number; close: number; attrs: string } | null = null
    for (const d of divs) {
      if (d.open < l.index && l.index < d.close) {
        if (!parent || d.open > parent.open) parent = d
      }
    }
    if (!parent) continue
    const line = content.slice(0, parent.open).split('\n').length
    const cls = parent.attrs.match(/class="([^"]*)"/)?.[1] ?? ''
    const labelCls = l[1].match(/class="([^"]*)"/)?.[1] ?? ''
    out.push({
      cls,
      line,
      wrapperMargin: /\bmb-\d/.test(cls),
      labelOverrides: /\bmb-0\b/.test(labelCls),
    })
  }
  return out
}

describe('label spacing is contributed exactly once', () => {
  it('found the views to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  const offenders: string[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    for (const w of wrappersContainingALabel(content)) {
      // The rule, precisely: a wrapper may own the gap below it OR the Label may
      // own it, never both.
      if (w.wrapperMargin && !w.labelOverrides) {
        offenders.push(
          `${file.split('\\').pop()}:${w.line} wrapper [${w.cls.slice(0, 44)}] and its Label both contribute margin`,
        )
      }
    }
  }

  it('never lets a wrapper and its Label both contribute vertical space', () => {
    // The failure message is the finding. A bare "expected [] to equal []" makes
    // the next person re-derive which view and which line.
    expect(
      offenders,
      `\n${offenders.join('\n')}\n\nBoth a wrapper and its Label carry a bottom margin, so the two ` +
        `stack and that field sits further from its label than its neighbours on the same ` +
        `form. Give the spacing to one of them - wrapper owns it and Label gets mb-0, ` +
        `or the wrapper has no margin and Label keeps its own.`,
    ).toEqual([])
  })

  it('every Label carries its own spacing, so an unwrapped field is never flush', () => {
    // The other half of the rule. If a Label ever loses its margin, the fields
    // that have no wrapper silently go back to 0px - which is how this started.
    const labelPath = resolve(VIEWS, '..', 'components/public/ui/label/Label.vue')
    const label = readFileSync(labelPath, 'utf-8')
    const classes = label.match(/cn\(\s*'([^']*)'/)?.[1] ?? ''
    expect(classes).toMatch(/\bmb-3\b/)
  })
})

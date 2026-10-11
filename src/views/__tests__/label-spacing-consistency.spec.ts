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
 * Every wrapper that contains a `<Label>`, with both margins reported.
 *
 * "Exactly one contributor" is not "no wrapper may have a margin". A row that
 * owns the spacing beneath it and passes its Label `mb-0` is correct - that is
 * the pattern this file ends up recommending. What is wrong is a wrapper with a
 * margin ABOVE a Label that still carries one of its own, because the two stack.
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
  const openTag = /<div\b([^>]*)>/g
  let m: RegExpExecArray | null

  while ((m = openTag.exec(content)) !== null) {
    const attrs = m[1]
    const line = content.slice(0, m.index).split('\n').length
    let depth = 1
    let i = m.index + m[0].length
    const tag = /<\/?div\b[^>]*>/g
    tag.lastIndex = i
    let t: RegExpExecArray | null
    while ((t = tag.exec(content)) !== null) {
      depth += t[0].startsWith('</') ? -1 : 1
      if (depth === 0) {
        i = t.index
        break
      }
    }
    const inner = content.slice(m.index, i)
    const labelTag = inner.match(/<Label\b([^>]*)>/)
    if (!labelTag) continue

    const cls = attrs.match(/class="([^"]*)"/)?.[1] ?? ''
    const labelCls = labelTag[1].match(/class="([^"]*)"/)?.[1] ?? ''
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

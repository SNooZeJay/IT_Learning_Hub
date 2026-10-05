/**
 * Scan Vue SFCs for template syntax the compiler rejects.
 *
 * A malformed attribute name - an unescaped quote inside a tag - is not a
 * TypeScript error, not a lint error, and not visible in the editor's script
 * pane. It only surfaces when Vite tries to compile the file, at which point it
 * kills the dev server and every route that imports it renders blank.
 *
 * This exists because that happened: `NotificationMenu.vue` took the dev server
 * down with
 *
 *     Pre-transform error: Attribute name cannot contain U+0022 ("), U+0027 (')
 *
 * and six student pages came back as empty documents with a clean console, which
 * looks exactly like a routing problem and is not one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src']

/** @param {string} dir */
function* vueFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* vueFiles(full)
    else if (full.endsWith('.vue')) yield full
  }
}

/**
 * Pull the template out and look for a tag whose attribute name contains a
 * quote. The compiler's own error is `Attribute name cannot contain`, so this
 * mirrors it rather than trying to be a general-purpose validator.
 *
 * @param {string} source
 * @returns {{ line: number, text: string }[]}
 */
function findBadAttributes(source) {
  const problems = []
  const templateStart = source.indexOf('<template>')
  if (templateStart === -1) return problems

  const lines = source.split('\n')
  let inTemplate = false

  lines.forEach((line, index) => {
    if (!inTemplate && line.trim().startsWith('<template')) {
      inTemplate = true
      return
    }
    if (inTemplate && line.trim() === '</template>') {
      inTemplate = false
      return
    }
    if (!inTemplate) return

    // A tag opening on this line: `<name ...`. Walk the attribute-name region,
    // which ends at the first `>`, whitespace-then-attribute, or `/`.
    const open = line.match(/<([a-zA-Z][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(=?)(\/?)>/)
    if (!open) return
    const attrRegion = open[2]
    // Anything between a quote-pair boundary that was never opened: count quotes
    // and look for a quote that appears before any `=` on an attribute name.
    const withoutStrings = attrRegion.replace(/"[^"]*"|'[^']*'/g, '')
    if (/["']/.test(withoutStrings)) {
      problems.push({ line: index + 1, text: line.trim().slice(0, 120) })
    }
  })

  return problems
}

let checked = 0
let failed = 0

for (const root of ROOTS) {
  for (const file of vueFiles(root)) {
    checked++
    const problems = findBadAttributes(readFileSync(file, 'utf8'))
    if (problems.length === 0) continue
    failed++
    console.log(`${file}`)
    for (const p of problems) console.log(`   L${p.line}: ${p.text}`)
  }
}

console.log(`\nchecked ${checked} .vue files, ${failed} with a malformed tag`)
process.exit(failed === 0 ? 0 : 1)
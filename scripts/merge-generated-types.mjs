/**
 * Splice the tables and functions missing from `src/services/supabase/types.ts`
 * out of a freshly generated `supabase gen types` output.
 *
 * The generated file is the authority on shape. It is not the authority on
 * meaning: the checked-in file carries doc comments explaining decisions - why
 * `quiz_attempts` has no UPDATE grant, why the quiz key is withheld - and
 * regenerating wholesale would delete all of it. So this adds what is absent and
 * leaves every hand-written comment where it is.
 *
 * Run as: node scripts/merge-generated-types.mjs <generated.ts> <target.ts>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [, , generatedPath, targetPath] = process.argv

if (!generatedPath || !targetPath) {
  console.error('usage: node merge-generated-types.mjs <generated.ts> <target.ts>')
  process.exit(1)
}

/**
 * Tidy the CLI's output.
 *
 * Two things are wrong with it as written to a file. npm writes its own notices to
 * the same stream, so the first dozen lines are PowerShell error decoration. And it
 * indents with tabs while the checked-in file uses spaces, so an exact match for
 * `    Tables: {` finds nothing and the merge silently reports "section not found".
 */
const stripNoise = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => !/^(npm notice|At line:|\+|\s*CategoryInfo|FullyQualifiedErrorId|node\.exe :)/.test(line.trim()))
    .map((line) => line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length)))
    .join('\n')

/**
 * Pull `      name: { ... },` blocks out of a section body.
 *
 * Six spaces of indent is what distinguishes a table or function entry from
 * anything nested inside one, so brace depth is tracked from that indent rather
 * than counted, which would break on braces inside comments or strings.
 */
function blocks(sectionBody) {
  const lines = sectionBody.split('\n')
  const found = new Map()
  let current = null
  let buffer = []

  for (const line of lines) {
    const match = line.match(/^ {6}([A-Za-z_][A-Za-z0-9_]*): \{/)
    if (match) {
      if (current) found.set(current, buffer.join('\n'))
      current = match[1]
      buffer = [line]
      continue
    }
    if (current) {
      buffer.push(line)
      // An entry ends at the `},` that closes it at six-space indent.
      if (/^ {6}\},?$/.test(line)) {
        found.set(current, buffer.join('\n'))
        current = null
        buffer = []
      }
    }
  }
  if (current) found.set(current, buffer.join('\n'))
  return found
}

function section(text, name) {
  const start = text.indexOf(`    ${name}: {`)
  if (start === -1) return null
  const bodyStart = text.indexOf('\n', start) + 1
  let depth = 1
  let index = bodyStart
  while (index < text.length && depth > 0) {
    const char = text[index]
    if (char === '{') depth++
    else if (char === '}') depth--
    index++
  }
  return text.slice(bodyStart, index - 1)
}

const generated = stripNoise(readFileSync(generatedPath, 'utf8'))
const target = stripNoise(readFileSync(targetPath, 'utf8'))

let targetText = target
const report = []

for (const sectionName of ['Tables', 'Functions', 'Enums']) {
  const generatedBody = section(generated, sectionName)
  const targetBody = section(targetText, sectionName)
  if (!generatedBody || !targetBody) {
    report.push(`${sectionName}: SKIPPED (section not found)`)
    continue
  }

  const generatedBlocks = blocks(generatedBody)
  const existing = new Set([...blocks(targetBody).keys()])

  const missing = [...generatedBlocks.keys()].filter((name) => !existing.has(name))
  if (missing.length === 0) {
    report.push(`${sectionName}: nothing missing`)
    continue
  }

  // Append just before the closing brace of the section, keeping alphabetical
  // order is not attempted - the generated file is already alphabetical among the
  // missing set, and the result is still valid TypeScript.
  const sectionStart = targetText.indexOf(`    ${sectionName}: {`)
  const bodyStart = targetText.indexOf('\n', sectionStart) + 1
  let depth = 1
  let index = bodyStart
  while (index < targetText.length && depth > 0) {
    const char = targetText[index]
    if (char === '{') depth++
    else if (char === '}') depth--
    index++
  }
  const insertAt = index - 1

  const addition = missing.map((name) => generatedBlocks.get(name)).join('\n')
  targetText = `${targetText.slice(0, insertAt)}${addition}\n    ${targetText.slice(insertAt)}`
  report.push(`${sectionName}: added ${missing.length} -> ${missing.join(', ')}`)
}

writeFileSync(targetPath, targetText)
console.log(report.join('\n'))
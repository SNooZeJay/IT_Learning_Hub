// Reports remaining British "enrol" spellings in src, grouped by file with full paths,
// so nothing is hidden behind a duplicated basename (there are three Analytics.vue).
//
// Usage: node scripts/report-enrol.mjs [--user-facing]
//   default   every remaining occurrence, with a kind
//   --user-facing  only the ones a person could read on screen

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// The `i` flag matches the rewrite rule. A case-sensitive report here silently hides every
// capitalised "Enrolments", which is most of the user-facing copy.
const RULE = /enrol(?!l)/gi

function walk(dir, acc) {
  const found = acc || []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else if (['.vue', '.ts'].includes(extname(full))) found.push(full)
  }
  return found
}

/** Split a .vue file into template and script so each is judged by its own rules. */
function regions(text) {
  const out = []
  const template = /<template>([\s\S]*?)<\/template>/
  const script = /<script[^>]*>([\s\S]*?)<\/script>/
  const tm = text.match(template)
  const sm = text.match(script)
  let consumed = []
  if (tm) {
    out.push({
      where: 'template',
      body: tm[1],
      offset: text.slice(0, tm.index).split('\n').length - 1,
    })
    consumed.push([tm.index, tm.index + tm[0].length])
  }
  if (sm) {
    out.push({
      where: 'script',
      body: sm[1],
      offset: text.slice(0, sm.index).split('\n').length - 1,
    })
    consumed.push([sm.index, sm.index + sm[0].length])
  }
  // Anything outside both blocks (rare) is treated as script so it is not lost.
  return out
}

function stripComments(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length))
}

/** True when the match sits inside a quoted string, backtick, or bare prose text node. */
function kindOf(line, template) {
  const trimmed = line.trim()
  if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*'))
    return 'comment'
  if (/^\s*[*/]/.test(line) || /^\s*\/\//.test(line)) return 'comment'

  // In a template, a quoted literal or a text node between tags is displayed.
  if (template) {
    const beforeTag = line.lastIndexOf('<')
    const afterTag = line.indexOf('>', beforeTag + 1)
    if (afterTag !== -1 && beforeTag !== -1 && beforeTag > afterTag) return 'displayed'
    if (/["'`]/.test(trimmed)) return 'expression'
    return 'displayed'
  }

  if (/^\s*[A-Za-z_$][\w$]*\s*:/.test(trimmed) && !/["'`]/.test(trimmed)) return 'identifier'
  if (/["'`]/.test(trimmed)) return 'string'
  return 'identifier'
}

const onlyUserFacing = process.argv.includes('--user-facing')
const DISPLAYED = new Set(['displayed'])

const rows = []
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const blocks =
    extname(file) === '.vue' ? regions(text) : [{ where: 'script', body: text, offset: 0 }]

  for (const block of blocks) {
    const lines = block.body.split('\n')
    const isTemplate = block.where === 'template'
    const clean = isTemplate ? lines : stripComments(block.body).split('\n')

    lines.forEach((line, index) => {
      RULE.lastIndex = 0
      if (!RULE.test(line)) return
      RULE.lastIndex = 0
      const hits = line.match(RULE) || []
      // A line that is only a comment in the script block is skipped outright.
      const kind = kindOf(clean[index] || line, isTemplate)
      if (onlyUserFacing && !DISPLAYED.has(kind)) return
      rows.push({
        file,
        line: block.offset + index + 1,
        kind,
        hits: hits.length,
        text: line.trim(),
      })
    })
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

let lastFile = null
for (const row of rows) {
  if (row.file !== lastFile) {
    console.log('')
    console.log(row.file)
    lastFile = row.file
  }
  console.log(
    '  ' +
      String(row.line).padStart(4) +
      '  ' +
      row.kind.padEnd(11) +
      '  ' +
      row.text.slice(0, 100),
  )
}

const byKind = {}
for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + r.hits
console.log('')
console.log('total occurrences: ' + rows.reduce((n, r) => n + r.hits, 0))
console.log('by kind: ' + JSON.stringify(byKind))

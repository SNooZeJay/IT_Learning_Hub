// Rewrites British "enrol" spelling to American "enroll" in USER-FACING TEXT only.
//
// Scope: enrol -> enroll, enrolment -> enrollment, enrolments -> enrollments.
// Nothing else. No other spelling rule lives in this file.
//
// Why this is not a repo-wide find-and-replace
// --------------------------------------------
// Things in this codebase contain "enrol" but are not prose, and rewriting them
// breaks the build rather than the copy:
//
//   'enrolment_confirmed'       a database enum value on notifications.type. Every
//                               comparison against that row reads this exact string.
//   enrollmentCount            an object key shared across a type and its producers.
//   enrolments.length          a variable name inside a binding expression.
//
// A blanket replace renames those, and type-check then reports 14 errors while the UI
// still reads "Enrolments". So this walks each file and only rewrites what a human reads.
//
//   templates   bare text nodes, plus the attributes whose value is displayed: title,
//               label, placeholder, alt and the aria-* descriptions. Everything else
//               inside a tag is an expression and is left alone, as are {{ }} and <!-- -->.
//   scripts     string literals containing whitespace, which is prose. A one-word literal
//               is an identifier, an enum value or a storage key.
//
// The negative lookahead is load-bearing: a plain enrol -> enroll turns "enrolment" into
// "enrollmment", because it matches the "enrol" inside "enrolment" and then leaves the
// trailing "ment" behind.
//
// Usage
//   node scripts/americanise-ui.mjs src            report which files would change
//   node scripts/americanise-ui.mjs src --apply    rewrite them

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// enrol|ments|s|t|led|ling -> enroll|ments|s|t|led|ling, but enrollment stays as it is.
//
// The `i` flag is load-bearing. Without it a lowercase `enrolment` is rewritten but a
// capitalised `Enrolment` - which is what a label, a heading or a sentence-initial word
// actually looks like - passes straight through. That produced the worst kind of result:
// "Could not load your enrollments" next to a page heading that still read "Enrolments",
// both from the same run. The negative lookahead is equally load-bearing: without it,
// enrol -> enroll turns "enrolment" into "enrollmment".
const RULE = /enrol(?!l)/gi

/** Enrolment -> Enrollment, ENROLMENTS -> ENROLLMENTS, Enrol -> Enroll. */
function americanise(text) {
  return text.replace(RULE, (match) => {
    if (match === match.toUpperCase() && match !== match.toLowerCase()) {
      return 'ENROLL'
    }
    if (match[0] === match[0].toUpperCase()) {
      return 'Enroll'
    }
    return 'enroll'
  })
}

// Attributes whose value a person reads on screen. Counted from this codebase, not guessed.
const READ_ATTRIBUTES = new Set([
  'title',
  'label',
  'placeholder',
  'alt',
  'description',
  'hint',
  'message',
  'aria-label',
  'aria-description',
  'aria-roledescription',
])

const marker = (n) => '@@HOLE' + n + '@@'

/** Rewrites only the string literals inside an expression, never the expression itself. */
function rewriteLiterals(expression) {
  // `${...}` inside a template literal is code: `` `${stats.enrolments} active` `` must
  // keep `stats.enrolments`, because that is the property the service actually returns.
  // Rewriting the literal without protecting the holes renamed the identifier and
  // type-check reported the property as missing on the payload.
  const holes = []
  const guarded = expression.replace(/\$\{[^{}]*\}/g, (m) => {
    holes.push(m)
    return marker(holes.length - 1)
  })

  const literal = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  const rewritten = guarded.replace(literal, (match, quote, body) => {
    if (!/\s/.test(body)) return match
    const next = americanise(body)
    return next === body ? match : quote + next + quote
  })

  return rewritten.replace(/@@HOLE(\d+)@@/g, (match, index) => holes[Number(index)])
}

/** Is this attribute name a Vue binding (`:x`, `v-bind:x`) rather than a literal? */
function isBound(name) {
  return name.startsWith(':') || name.startsWith('v-bind:') || name.startsWith('.')
}

/**
 * A bound attribute's value may be a bare sentence rather than a quoted literal:
 * `:description="Once students enrol, this panel plots new enrolments."` has no quote
 * characters at all, so the literal scan finds nothing to do. Whitespace with no quotes
 * means prose; a bare identifier such as `stats.enrolments` has no whitespace and is
 * therefore left alone.
 */
function rewriteBindingValue(value) {
  const next = rewriteLiterals(value)
  if (!/["'`]/.test(value) && /\s/.test(value)) return americanise(value)
  return next
}

export function rewriteTemplate(template) {
  const holes = []
  const protect = (m) => {
    holes.push(m)
    return marker(holes.length - 1)
  }

  // Step 1: HTML comments are for developers, never displayed.
  let work = template.replace(/<!--[\s\S]*?-->/g, protect)

  // Step 2: displayed attributes.
  //
  // A literal attribute (`label="Enrolments"`) has the whole value rewritten. A bound one
  // (`:hint="`${stats.enrolments} active enrolment`"`) must not: that value is an
  // expression, and rewriting it wholesale would rename `stats.enrolments` to
  // `stats.enrollments` while the service still returns the former. So a binding only has
  // its embedded string literals rewritten.
  //
  // The `:` matters. An earlier version compared the raw name against the allowlist, so
  // `:hint` and `:description` never matched and a card could read "5 active enrolments"
  // directly under a heading the same pass had already fixed to "Enrollments".
  const attribute = /([\w:.-]+)\s*=\s*"([^"]*)"/g
  work = work.replace(attribute, (match, name, value) => {
    const plain = isBound(name) ? name.replace(/^(\.|v-bind:)/, ':').slice(1) : name.toLowerCase()
    if (!READ_ATTRIBUTES.has(plain)) return match
    const next = isBound(name) ? rewriteBindingValue(value) : americanise(value)
    return next === value ? match : name + '="' + next + '"'
  })

  // Step 3: hide EVERY remaining attribute value before touching text nodes. Without this,
  // `:options="enrolmentChartOptions"` is rewritten by the text pass while the script still
  // defines the other name, and type-check reports the property as missing. An allowlist
  // that does not exclude the rest of the set is not an allowlist.
  work = work.replace(/([\w:.-]+)\s*=\s*(?:"[^"]*"|'[^']*')/g, (m) => protect(m))

  // Step 4: interpolations are expressions too, but they can hold sentences in a ternary -
  // `{{ isPaid ? 'Enroll for free' : 'Enrol to see the lessons' }}`. Treat them like a
  // binding: rewrite the literals, then hide the whole thing behind a marker so the text
  // pass cannot rename `course.enrolments` to `course.enrollments`.
  work = work.replace(/\{\{[\s\S]*?\}\}/g, (m) => {
    const rewritten = rewriteLiterals(m)
    holes.push(rewritten)
    return marker(holes.length - 1)
  })

  // Step 5: what is left between the tags is the prose the user reads.
  work = americanise(work)

  return work.replace(/@@HOLE(\d+)@@/g, (match, index) => holes[Number(index)])
}

/**
 * Inside a script: only string literals containing whitespace are prose.
 *
 * Comments are protected first, and that ordering is the whole correctness of this
 * function. An apostrophe in prose - "the message's own created_at", "don't", "author's" -
 * otherwise looks like an opening quote, and the scan then runs to the *next* apostrophe
 * anywhere in the file, swallowing every identifier in between and renaming it as though
 * it were a sentence. The first version of this script did exactly that and renamed
 * exported functions in some files but not their callers, which type-check caught with
 * 33 errors. A rewrite pass that renames code has to prove it did not, not assume it.
 */
function rewriteScript(script) {
  const holes = []
  const protect = (m) => {
    holes.push(m)
    return marker(holes.length - 1)
  }

  const withoutComments = script
    .replace(/\/\*[\s\S]*?\*\//g, protect)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => protect(lead + m.slice(lead.length)))

  const literal = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  const rewritten = withoutComments.replace(literal, (match, quote, body) => {
    if (!/\s/.test(body)) return match
    const next = americanise(body)
    return next === body ? match : quote + next + quote
  })

  return rewritten.replace(/@@HOLE(\d+)@@/g, (match, index) => holes[Number(index)])
}

let APPLY = false

/**
 * Finds every top-level `<template>...</template>` region, nested templates included,
 * and returns their inner spans as [start, end).
 *
 * The naive non-greedy regex in an earlier version of this script stopped at the first
 * `</template>` it met - which is the close of the first *nested* `<template v-if=...>`,
 * not the outer one. Every marker after that (an `{{ ... }}` ternary, a bound `:hint`,
 * a heading inside the second block) was then rewritten by no pass at all, and the UI
 * ended up with half-American, half-British copy. Balanced matching is the difference.
 */
function templateSpans(text) {
  const spans = []
  const re = /<\/?template[^>]*>/g
  let m
  const stack = []
  while ((m = re.exec(text))) {
    const tag = m[0]
    if (tag.startsWith('</')) {
      const start = stack.pop()
      if (stack.length === 0 && start !== undefined) spans.push([start, m.index])
    } else if (!tag.endsWith('/>')) {
      stack.push(m.index + tag.length)
    }
  }
  return spans
}

function scriptSpans(text) {
  const spans = []
  const re = /<script[^>]*>|<\/script>/g
  let m
  let start = -1
  while ((m = re.exec(text))) {
    if (m[0].startsWith('</')) {
      if (start !== -1) spans.push([start, m.index])
      start = -1
    } else if (start === -1) {
      start = m.index + m[0].length
    }
  }
  return spans
}

function spliceSpans(text, spans, transform) {
  if (!spans.length) return text
  let out = ''
  let cursor = 0
  for (const [start, end] of spans) {
    out += text.slice(cursor, start)
    out += transform(text.slice(start, end))
    cursor = end
  }
  out += text.slice(cursor)
  return out
}

function processFile(path) {
  const original = readFileSync(path, 'utf8')
  let out = original

  if (extname(path) === '.vue') {
    out = spliceSpans(out, templateSpans(out), rewriteTemplate)
    out = spliceSpans(out, scriptSpans(out), rewriteScript)
  } else if (['.ts', '.mjs', '.js'].includes(extname(path))) {
    out = rewriteScript(original)
  }

  if (out === original) return false
  // Gated on the flag. An earlier version reported "would rewrite" while writing anyway,
  // which is the one behaviour a tool like this must not have: a dry run that silently
  // edits is worse than no dry run.
  if (APPLY) writeFileSync(path, out)
  return true
}

function walk(dir, acc) {
  const found = acc || []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else if (['.vue', '.ts', '.mjs', '.js'].includes(extname(full))) found.push(full)
  }
  return found
}

const args = process.argv.slice(2)
APPLY = args.includes('--apply')
const roots = args.filter((a) => a !== '--apply')
const files = roots.flatMap((r) => (statSync(r).isDirectory() ? walk(r) : [r]))

const touched = []
for (const file of files) if (processFile(file)) touched.push(file)

console.log(
  (APPLY ? 'rewrote ' : 'would rewrite ') + touched.length + ' of ' + files.length + ' files',
)
for (const f of touched) console.log('  ' + f)

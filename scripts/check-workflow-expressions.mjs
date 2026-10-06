/**
 * Check GitHub Actions expressions against the contexts each key actually allows.
 *
 * A workflow whose `if:` names a context it may not use is not a workflow with one
 * failing job. It is a workflow GitHub refuses to parse at all, and the run is
 * reported as "No jobs were found" with zero jobs and a zero-second duration. That is
 * what this file was written to prevent, after `ci.yml` said:
 *
 *     if: ${{ github.event_name == 'push' || secrets.E2E_SUPABASE_URL != '' }}
 *
 * where `secrets` is not an available context for `jobs.<job_id>.if`. GitHub's
 * annotation was precise about it:
 *
 *     (Line: 131, Col: 9): Unrecognized named-value: 'secrets'.
 *       Located at position 32 within expression: github.event_name == 'push' ||
 *       secrets.E2E_SUPABASE_URL != ''
 *
 * and the cost was nine consecutive pushes with no CI at all. Not just the job that
 * was wrong: `verify` and `schema` carry no conditions of their own and were never
 * scheduled either. The gates this repository relies on had never run once, and the
 * red marks in the Actions list were the only signal.
 *
 * Why this is a script and not a lint rule
 * ----------------------------------------
 * actionlint is the right tool and is not a dependency here, and adding one for this
 * would be the wrong trade. The rule being enforced is small, stable and stated in one
 * table, and the failure it prevents is invisible locally: YAML that is perfectly valid,
 * that this repository's own formatter is happy with, and that no TypeScript or ESLint
 * pass will ever look at.
 *
 * The parse is deliberately not a YAML parse. A real parser is needed to know which key
 * an expression sits under, and pulling one in as a dependency for a check this small is
 * not worth it. Instead the walk is indentation-based and answers exactly one question:
 * for every `if:` in the file, which key path is it under, and which context names does
 * its expression use. That is enough, and it cannot drift into a half-parser that
 * silently passes what it should have rejected.
 *
 * The table below is GitHub's "Context availability" reference, which is a list of
 * specific workflow keys rather than a general rule. It is reproduced per key rather
 * than approximated, because the approximation is the bug: `secrets` is available in
 * `steps.env`, `steps.run` and `jobs.<job_id>.env`, and unavailable in every `if`. A
 * single "is secrets allowed here" boolean cannot express that.
 */

/**
 * Contexts GitHub permits, per workflow key.
 *
 * A key that is absent from this table is not validated, on purpose. An unknown key is
 * either one this table has not caught up with or one from a newer GitHub than this was
 * written against, and silently failing a workflow over a table gap would make people
 * delete the check. The `if` keys are all present because they are the ones that break.
 *
 * Source: docs.github.com/en/actions/learn-github-actions/contexts#context-availability
 */
const ALLOWED = {
  // The two that caused this, and the only `if` keys in a normal workflow.
  'jobs.<job_id>.if': new Set(['github', 'needs', 'vars', 'inputs']),
  'jobs.<job_id>.steps.if': new Set([
    'github',
    'needs',
    'strategy',
    'matrix',
    'job',
    'runner',
    'env',
    'vars',
    'steps',
    'inputs',
  ]),

  // Present for completeness. `secrets` appears in several of these and in none of the
  // `if` keys above, which is the whole point of listing them separately.
  'jobs.<job_id>.env': new Set([
    'github',
    'needs',
    'strategy',
    'matrix',
    'vars',
    'secrets',
    'inputs',
  ]),
  'jobs.<job_id>.steps.env': new Set([
    'github',
    'needs',
    'strategy',
    'matrix',
    'job',
    'runner',
    'env',
    'vars',
    'secrets',
    'steps',
    'inputs',
  ]),
  'jobs.<job_id>.steps.run': new Set([
    'github',
    'needs',
    'strategy',
    'matrix',
    'job',
    'runner',
    'env',
    'vars',
    'secrets',
    'steps',
    'inputs',
  ]),
  'jobs.<job_id>.steps.with': new Set([
    'github',
    'needs',
    'strategy',
    'matrix',
    'job',
    'runner',
    'env',
    'vars',
    'secrets',
    'steps',
    'inputs',
  ]),
  env: new Set(['github', 'secrets', 'inputs', 'vars']),
  concurrency: new Set(['github', 'inputs', 'vars']),
  'run-name': new Set(['github', 'inputs', 'vars']),
}

/**
 * Reserved words in an expression that are not contexts.
 *
 * Without this, `contains(github.ref, 'needs')` reports a use of `needs` and a workflow
 * comparing a branch name against the word `strategy` fails for no reason. Each one is
 * either a function, a literal, or a status keyword.
 */
const NOT_CONTEXTS = new Set([
  'always',
  'cancelled',
  'success',
  'failure',
  'true',
  'false',
  'null',
  'contains',
  'startsWith',
  'endsWith',
  'format',
  'join',
  'toJSON',
  'fromJSON',
  'hashFiles',
])

const WORKFLOW_DIR = '.github/workflows'

/**
 * Every `${{ ... }}` in a line, with its offset, so the offending context can be
 * pointed at by line number rather than described.
 *
 * The expression body is matched lazily so a `${{` inside a string literal cannot run
 * away with the rest of the file.
 *
 * @param {string} line
 * @returns {{ text: string, offset: number }[]}
 */
function expressionsIn(line) {
  const found = []
  const open = /\$\{\{/g
  let match
  while ((match = open.exec(line)) !== null) {
    const close = line.indexOf('}}', match.index + 3)
    if (close === -1) break
    found.push({ text: line.slice(match.index + 3, close), offset: match.index })
    open.lastIndex = close + 2
  }
  return found
}

/**
 * Context names referenced by an expression.
 *
 * Matches `word.` at a position that is not inside an identifier, then excludes the
 * reserved words. A bare `secrets` with no property - which dereferences to an empty
 * string rather than failing - is deliberately not matched: there is nothing to catch
 * and reporting it would be noise.
 *
 * @param {string} expression
 * @returns {string[]}
 */
function contextsUsed(expression) {
  const names = new Set()
  const pattern = /(^|[^\w.])([a-zA-Z_][a-zA-Z0-9_-]*)\s*\./g
  let match
  while ((match = pattern.exec(expression)) !== null) {
    const name = match[2]
    if (!NOT_CONTEXTS.has(name)) names.add(name)
  }
  return [...names]
}

/**
 * Reduce a key path to the shape in `ALLOWED`.
 *
 * Only the *job name* is replaced, because that is the one segment GitHub's own table
 * writes as a placeholder: `jobs.verify.if` becomes `jobs.<job_id>.if`. Everything below
 * it is significant and kept.
 *
 * Replacing every segment after `jobs` instead - which is what the first version of this
 * did - produced `jobs.<job_id>.<job_id>` and matched no table entry. That is the worst
 * possible failure for a checker: the key lookup returned undefined, the loop skipped,
 * and the script reported success having validated nothing. A check that cannot fail is
 * worse than no check, because it is trusted. Hence this shape, and hence the probes
 * that proved it catches a known-bad file.
 *
 * @param {string[]} path
 * @returns {string}
 */
function normaliseKey(path) {
  const out = []
  let jobNameSeen = false
  for (const segment of path) {
    if (segment === 'jobs') {
      out.push(segment)
      continue
    }
    if (!jobNameSeen && out[0] === 'jobs') {
      out.push('<job_id>')
      jobNameSeen = true
      continue
    }
    out.push(segment)
  }
  return out.join('.')
}

/**
 * Check one workflow file.
 *
 * @param {string} file
 * @param {string} source
 * @returns {string[]} problems, one per line
 */
function checkWorkflow(file, source) {
  const problems = []
  // A UTF-8 BOM makes the first key unrecognisable, so the walk would silently start one
  // line late. Every probe file written by PowerShell's `Out-File` arrived with one.
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/)

  /** @type {{ indent: number, key: string }[]} */
  const stack = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNo = i + 1

    // A comment cannot open a key, and a block scalar's contents are shell or YAML,
    // not workflow structure. Skipping both keeps the walk from inventing a key path
    // out of the inside of a `run:` block.
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const indent = raw.length - raw.trimStart().length

    // Block scalar: everything more indented than the `|` or `>` belongs to the script.
    if (stack.length > 0) {
      const parent = stack[stack.length - 1]
      if (parent.blockScalar && indent > parent.indent) continue
      parent.blockScalar = false
    }

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()

    // A list item: `- name: ...` or `- uses: ...`. Treated as the key it opens, at the
    // indent of the dash plus the usual offset, which is close enough for the `if`
    // keys this checks.
    const itemMatch = /^-\s+([A-Za-z_][\w-]*)\s*:/.exec(trimmed)
    const keyMatch = itemMatch ?? /^([A-Za-z_][\w-]*)\s*:/.exec(trimmed)
    if (!keyMatch) continue

    const key = keyMatch[1]
    const valueStart =
      raw.indexOf(':', keyMatch.index + (itemMatch ? key.length + 1 : key.length)) + 1
    const value = raw.slice(valueStart).trim()
    const blockScalar = value === '|' || value === '>' || /^[|>]-?\d*$/.test(value)

    stack.push({ indent, key, blockScalar })

    if (key !== 'if') continue

    const path = stack.map((entry) => entry.key)
    const keyPath = normaliseKey(path)
    const allowed = ALLOWED[keyPath]
    if (!allowed) continue

    const expressions = expressionsIn(value)
    if (expressions.length === 0) continue

    for (const expression of expressions) {
      for (const context of contextsUsed(expression.text)) {
        if (allowed.has(context)) continue
        problems.push(
          `${file}:${lineNo}  '${context}' is not available in ${keyPath}\n` +
            `    ${trimmed}\n` +
            `    GitHub rejects the whole workflow file for this, not just this job, so ` +
            `no job runs at all. Pass the value through env: and decide in a run: step.`,
        )
      }
    }
  }

  return problems
}

/**
 * @param {string} dir
 * @returns {string[]} paths of every .yml and .yaml file beneath it
 */
function workflowFiles(dir) {
  const found = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...workflowFiles(full))
    else if (/\.ya?ml$/.test(entry)) found.push(full)
  }
  return found
}

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * A workflow that parses as YAML but names a context its key does not allow.
 *
 * GitHub does not report this as a failing job. It refuses the file, schedules nothing,
 * and the run appears as an instant red mark reading "No jobs were found" - which
 * looks like a permissions problem or an empty workflow rather than a syntax error,
 * and is why this check exists.
 *
 * Nothing in the repository's own gates can catch it: the file is valid YAML, Prettier
 * is happy with it, and no TypeScript or ESLint pass reads it. It was found by reading
 * a GitHub annotation on a red run, after nine pushes had gone by with no CI at all -
 * including the lint, type-check and test jobs that were never scheduled.
 *
 * Only `if:` expressions are checked, because those are the ones GitHub refuses a file
 * over. An `env:` or `run:` reference to `secrets` is ordinary and expected.
 *
 * @example
 * // Fails. `secrets` is not available in a job-level if, and the whole
 * // workflow stops running rather than just this job.
 * if: ${{ github.event_name == 'push' || secrets.E2E_SUPABASE_URL != '' }}
 *
 * @example
 * // Passes. The same secret, read where it is allowed.
 * env:
 *   URL: ${{ secrets.E2E_SUPABASE_URL }}
 * steps:
 *   - run: '[ -n "$URL" ] && npx playwright test || echo "no credentials"'
 */
export function checkWorkflowContexts(root = process.cwd()) {
  const dir = join(root, WORKFLOW_DIR)

  // A missing directory used to return "no problems", and `main` then printed
  // "checked .github/workflows" and exited 0. Run from the wrong directory, or after the
  // folder is moved, the check passed having validated nothing - which is the one failure
  // mode this file exists to avoid and the reason its own tests pin the known-bad case.
  //
  // An empty *file* is fine: a workflow with no `if:` has nothing to check and saying so
  // would be noise. A missing directory is not fine, because it means the check never ran.
  if (!existsSync(dir)) {
    throw new Error(
      `no ${WORKFLOW_DIR} directory under ${root}. The check validated nothing, so it fails rather than reporting success.`,
    )
  }

  const problems = []
  for (const file of workflowFiles(dir)) {
    const label = file.startsWith(root) ? file.slice(root.length).replace(/^[\\/]/, '') : file
    problems.push(...checkWorkflow(label, readFileSync(file, 'utf8')))
  }
  return problems
}

/** @param {string[]} argv */
function main(argv) {
  let problems
  try {
    problems = checkWorkflowContexts(argv[2] ?? process.cwd())
  } catch (error) {
    console.error(
      `workflow expression check could not run: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }

  if (problems.length > 0) {
    console.error(`${problems.length} workflow expression problem(s):\n`)
    for (const problem of problems) console.error(`  ${problem}\n`)
    process.exit(1)
  }

  console.log('checked .github/workflows: every expression uses a context its key allows')
}

// Only run as a CLI when executed directly, so importing it from a test is silent.
const invokedDirectly =
  process.argv[1] !== undefined && basename(process.argv[1]) === 'check-workflow-expressions.mjs'

if (invokedDirectly) main(process.argv)

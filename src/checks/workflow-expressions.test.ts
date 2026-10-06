import { describe, expect, it } from 'vitest'
import { checkWorkflowContexts } from '../../scripts/check-workflow-expressions.mjs'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The checker must be able to fail.
 *
 * This file exists because the first version of the checker could not. Its key-path
 * normalisation replaced every segment below `jobs`, so a job-level `if` was looked up as
 * `jobs.<job_id>.<job_id>`, matched no table entry, was skipped, and the script printed
 * success having examined nothing. It reported no problem on a workflow file containing
 * the exact expression that had silently disabled CI for nine pushes.
 *
 * So every case below states what the checker must catch, and the first one is the real
 * line from that file rather than a paraphrase of it. A test that only asserts the happy
 * path cannot tell a working checker from a silent one.
 */

function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'workflow-check-'))
  for (const [name, content] of Object.entries(files)) {
    const dir = join(root, '.github', 'workflows')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), content, 'utf8')
  }
  return root
}

const HEADER = 'name: CI\non:\n  push:\n    branches: [main]\n'

describe('a workflow whose if names a context its key does not allow', () => {
  it('catches the expression that stopped CI running at all', () => {
    // Verbatim from ci.yml line 131. GitHub's annotation was:
    //   (Line: 131, Col: 9): Unrecognized named-value: 'secrets'.
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  e2e:
    runs-on: ubuntu-latest
    if: \${{ github.event_name == 'push' || secrets.E2E_SUPABASE_URL != '' }}
    steps:
      - run: echo hi
`,
      }),
    )

    expect(problems).toHaveLength(1)
    // HEADER is four lines, then jobs:, the job, runs-on:, and the `if:`.
    expect(problems[0]).toContain('ci.yml:8')
    expect(problems[0]).toContain("'secrets' is not available in jobs.<job_id>.if")
  })

  it('catches it at step level too, which is also disallowed', () => {
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - if: \${{ secrets.TOKEN != '' }}
        run: echo hi
`,
      }),
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("'secrets' is not available in jobs.<job_id>.steps.if")
  })

  it('names every offending context, not just the first', () => {
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  a:
    runs-on: ubuntu-latest
    if: \${{ secrets.A != '' || matrix.X != '' }}
    steps:
      - run: echo hi
`,
      }),
    )

    expect(problems).toHaveLength(2)
    expect(problems.join('\n')).toContain("'secrets'")
    expect(problems.join('\n')).toContain("'matrix'")
  })
})

describe('uses of secrets that GitHub allows', () => {
  it('passes a secret read in env, run and with', () => {
    // `secrets` is available in all three. Treating it as uniformly banned would make
    // the checker push people towards hardcoding credentials, which is the opposite of
    // what it is for.
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}env:
  GLOBAL: \${{ secrets.ANYTHING }}
jobs:
  e2e:
    runs-on: ubuntu-latest
    env:
      URL: \${{ secrets.E2E_SUPABASE_URL }}
    steps:
      - with:
          token: \${{ secrets.TOKEN }}
        uses: some/action@v1
      - run: echo "\$URL"
`,
      }),
    )

    expect(problems).toEqual([])
  })

  it('passes the contexts each if key does allow', () => {
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  a:
    runs-on: ubuntu-latest
    if: \${{ github.event_name == 'push' || vars.FLAG != '' }}
    steps:
      - run: echo hi
  b:
    runs-on: ubuntu-latest
    steps:
      - if: \${{ failure() && steps.check.outputs.skip == 'false' }}
        run: echo bye
`,
      }),
    )

    expect(problems).toEqual([])
  })

  it('does not mistake a branch name or function for a context', () => {
    // `contains` and `startsWith` are functions, not contexts, and a branch called
    // `matrix` is a string. Neither is a reason to fail a workflow.
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  a:
    runs-on: ubuntu-latest
    if: \${{ contains(github.ref, 'matrix') && startsWith(github.ref, 'needs') }}
    steps:
      - run: echo hi
`,
      }),
    )

    expect(problems).toEqual([])
  })
})

describe('the walk itself', () => {
  it('ignores an if inside a run block scalar', () => {
    // `if [ -z "$TOKEN" ]` is shell, not an expression. A walk that treats it as a key
    // invents `jobs.<job_id>.steps.<something>.if` out of the inside of a script.
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: |
          if [ -z "$TOKEN" ]; then
            echo "no credentials"
          fi
`,
      }),
    )

    expect(problems).toEqual([])
  })

  it('finds a real if after a block scalar, which a naive skip would swallow', () => {
    // The mirror of the case above. A "skip until the indent drops" rule that never
    // re-enters the walk passes that test and misses this one.
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `${HEADER}jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo hello
          echo world
      - if: \${{ secrets.TOKEN != '' }}
        run: echo hi
`,
      }),
    )

    expect(problems).toHaveLength(1)
    // 4 header lines, jobs:, a:, runs-on:, steps:, run: |, two echoed lines, then the `if:`.
    expect(problems[0]).toContain('ci.yml:12')
  })

  it('reads a file that begins with a UTF-8 BOM', () => {
    // PowerShell's `Out-File -Encoding utf8` writes one, and the first probe files all
    // arrived with it. Without the strip, the walk starts a line late.
    const problems = checkWorkflowContexts(
      projectWith({
        'ci.yml': `\uFEFF${HEADER}jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - if: \${{ secrets.TOKEN != '' }}
        run: echo hi
`,
      }),
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('ci.yml:9')
  })

  it('reports nothing when there are no workflows', () => {
    expect(checkWorkflowContexts(join(tmpdir(), 'lms-no-such-workflow-dir'))).toEqual([])
  })
})

describe('this repository', () => {
  it('has no workflow expression GitHub would refuse', () => {
    // The check as it applies to us. This is the assertion that would have caught the
    // original file before it was pushed.
    expect(checkWorkflowContexts(process.cwd())).toEqual([])
  })
})

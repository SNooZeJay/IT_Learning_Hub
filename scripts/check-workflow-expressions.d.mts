/**
 * Types for the workflow expression checker, which is plain `.mjs`.
 *
 * The script is deliberately not TypeScript: it runs as the first thing in CI, before
 * `npm ci` has installed anything, and a compile step in front of a guard is a step that
 * can fail for reasons unrelated to what the guard is for. This file is the bridge, so
 * the test that covers the checker is type-checked like everything else.
 */

/**
 * One problem, as the checker reports it.
 *
 * A single string rather than a structured result, because the checker exists to be read
 * by a person in a terminal and by `grep` in CI. The message carries the file, the line,
 * the offending context and the key path, which is everything needed to find it.
 */
export type WorkflowExpressionProblem = string

/**
 * Check every workflow under `<root>/.github/workflows`.
 *
 * Returns one entry per offending expression, and an empty array when there are none.
 * A missing `.github/workflows` directory is not an error - a repository without
 * workflows has nothing wrong with it.
 *
 * @param root Repository root. Defaults to the current working directory.
 */
export function checkWorkflowContexts(root?: string): WorkflowExpressionProblem[]

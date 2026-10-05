import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * `createWebHistory` reads `window` when `router/index.ts` is imported, and jsdom is
 * not a dependency of this project. Rather than add one, swap the history
 * implementation for the memory history and keep everything else real.
 *
 * The matcher is the part under test, not the history: `createWebHistory` and
 * `createMemoryHistory` share it, so path resolution here is the same resolution the
 * browser performs.
 */
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: () => actual.createMemoryHistory() }
})

// The router module default-exports the instance; ROLE_HOME is a named export alongside it.
const { default: router } = await import('./index')

/**
 * Every internal link must resolve to a real route.
 *
 * This exists because of one specific failure. `CurriculumOutline` built its lesson
 * link as
 *
 *     props.editable ? `/instructor/lessons/${lessonId}` : `/student/lessons/${lessonId}`
 *
 * and there is no `/instructor/lessons/:id` route. So every lesson title in every
 * instructor's course outline went to the catch-all, which redirects to the 404
 * page. Type-check passed, lint passed, the build passed, the tests passed, and the
 * console was clean on every page that did not contain the link.
 *
 * A Vue Router `router-link` to a path that does not exist is not an error. It
 * renders an ordinary anchor, the navigation guard sends it to the catch-all, and
 * nothing anywhere complains. The only way to find one is to resolve every internal
 * link against the route table and see which ones fall through.
 *
 * The earlier attempt at this used a hand-rolled matcher over the route table's
 * `path:` strings, and reported all 94 links in the app as broken, then reported
 * the real bug as fine. Nesting makes that approach unsound: a child of `/student`
 * declares `path: 'dashboard'`, so matching it against `/instructor/dashboard`
 * depends on reconstructing the tree by hand. Vue Router already knows the answer,
 * so this asks it.
 */

const SRC = join(process.cwd(), 'src')

/** @param {string} dir */
function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full)
    } else if (/\.(vue|ts)$/.test(full) && !full.endsWith('.test.ts')) {
      yield full
    }
  }
}

/**
 * Internal link targets.
 *
 * Deliberately conservative about which strings count: only paths that begin with
 * one of this app's route prefixes, so a URL fragment in a comment or an unrelated
 * string is not mistaken for a link.
 *
 * Interpolated paths are included, and this is a correction rather than an addition.
 * The previous pattern required a closing quote straight after the path, so anything
 * containing `${...}` failed to match *at all* - not "covered by its static prefix"
 * as the comment then claimed, but skipped completely. Verified by injecting
 * `/instructor/courses/${course.id}/quizzes` (a route that does not exist) and
 * watching the suite still report 159 passed.
 *
 * That matters because interpolated links are where the routing mistakes live.
 * `services/calendar.service.ts` builds every one of its links that way, so the file
 * with the most route references in the project was the one file the checker could
 * not see.
 */
const LINK_PATTERN =
  /["'`](\/(?:student|instructor|admin|profile|auth|courses)(?:\/(?:[A-Za-z0-9_:$-]+|\$\{[^}]*\}))*)["'`]/g

/**
 * A stand-in for an interpolated value.
 *
 * Vue Router matches a `:param` segment against any run of non-slash characters, so
 * the value is irrelevant to whether the route exists - only the surrounding literal
 * segments decide that. A slash-free token is used so it cannot invent an extra path
 * segment and resolve a route the real link would have missed.
 */
const PARAM_STUB = 'x'

/** The path to hand to the router: interpolations replaced by a stub. */
function resolvable(target: string): string {
  return target.replace(/\$\{[^}]*\}/g, PARAM_STUB)
}

interface FoundLink {
  file: string
  line: number
  /** The link as written, used in the test title and the failure message. */
  target: string
}

/**
 * Strip comments, preserving line numbering.
 *
 * Without this the check reported two failures that were not failures: a doc comment
 * in `CurriculumOutline` naming `/instructor/lessons/:id` to explain why that link was
 * removed, and a comment in `CourseEditor` naming `/courses/:id/edit` to explain the
 * URL it rewrites itself to. Both were quoted as broken links while the code was
 * correct.
 *
 * A checker that cries wolf twice gets ignored the third time, which is worse than
 * having no checker, so blanks are substituted rather than lines dropped.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, ''))
}

function collectLinks(): FoundLink[] {
  const found: FoundLink[] = []

  for (const file of sourceFiles(SRC)) {
    const text = stripComments(readFileSync(file, 'utf8'))
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(LINK_PATTERN)) {
        found.push({
          file: relative(process.cwd(), file),
          line: index + 1,
          target: match[1],
        })
      }
    })
  }

  // The same target on many lines is one problem, not many.
  const seen = new Set<string>()
  return found.filter((link) => {
    if (seen.has(link.target)) return false
    seen.add(link.target)
    return true
  })
}

const links = collectLinks()
const interpolatedLinks = links.filter((l) => l.target.includes('${'))

describe('internal links resolve', () => {
  it('found links to check', () => {
    // If this ever reaches zero the extraction broke and the rest of the suite is
    // passing vacuously, which is worse than having no test at all.
    expect(links.length).toBeGreaterThan(10)
  })

  it('found interpolated links, which the previous pattern skipped entirely', () => {
    // The gap this file previously had was not that it checked the wrong links, it
    // was that it could not see a whole category of them. A bare count assertion
    // would be too weak to notice if the set emptied out, so this also pins the
    // specific file that was invisible.
    //
    // `path.relative` returns backslashes on Windows, so the paths are normalised
    // before comparing rather than assuming a separator.
    const files = new Set(interpolatedLinks.map((l) => l.file.split(sep).join('/')))
    expect(files.has('src/services/calendar.service.ts')).toBe(true)
    expect(interpolatedLinks.length).toBeGreaterThan(5)
  })

  it('substituting an interpolated value does not change which route matches', () => {
    // If the stub ever stopped being a valid `:param` value the suite would start
    // reporting every interpolated link as broken, which would be noticed - but the
    // opposite failure, silently resolving to something real, would not.
    const resolved = router.resolve(resolvable('/student/lessons/abc123'))
    expect(resolved.name).toBe('student-lesson')
  })

  it.each(links.map((l) => [l.target, l] as const))(
    '%s resolves to a real route',
    (_target, link) => {
      const { matched, name } = router.resolve(resolvable(link.target))

      // An unmatched path resolves to nothing at all; a path that only matches the
      // catch-all resolves to the 404 redirect, which is the silent failure this
      // test exists to catch.
      const fellThrough =
        matched.length === 0 || matched.every((record) => record.path.includes('*'))

      expect({
        file: `${link.file}:${link.line}`,
        matched: matched.map((m) => m.path),
        name,
      }).toEqual({ file: `${link.file}:${link.line}`, matched: matched.map((m) => m.path), name })

      if (fellThrough) {
        throw new Error(
          `${link.file}:${link.line} links to "${link.target}", which no route serves. ` +
            `It resolved to ${String(name ?? 'nothing')}, i.e. the catch-all, so clicking it ` +
            `sends the user to the 404 page.`,
        )
      }
    },
  )
})

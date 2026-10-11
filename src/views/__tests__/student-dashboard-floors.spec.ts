import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Student dashboard touch and motion floors.
 *
 * The `min-h-9` (36px) text links - "All results", "Read them", "Calendar" - sit
 * below the 44px floor this codebase holds everywhere else. An inline link inside
 * running text would be exempt; these stand alone as rows, so they are targets.
 * The resume pulse has no reduced-motion variant, so users who ask for less
 * motion get a perpetually blinking dot beside every open attempt.
 */
describe('student dashboard floors', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '..', 'student/Dashboard.vue'), 'utf-8')

  it('holds standalone links to 44px', () => {
    expect(content).not.toMatch(/min-h-9/)
  })

  it('respects reduced motion on the resume pulse', () => {
    expect(content).toMatch(
      /animate-pulse[^"]*motion-reduce:animate-none|motion-reduce:animate-none[^"]*animate-pulse/,
    )
  })
})

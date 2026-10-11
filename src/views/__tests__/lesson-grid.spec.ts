import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The lesson grid declares its mobile track explicitly.
 *
 * `grid gap-6 lg:grid-cols-3` with no base column definition leaves a single
 * implicit `auto` track, which sizes to its content rather than to the screen:
 * the lesson column measured 439px on a 390px viewport and every paragraph ran
 * off the edge. `grid-cols-1` pins the track to the container so `min-w-0` on
 * the items has something to work against. This is the same failure the
 * instructor dashboard documents in its own comment; the lesson view simply
 * never got the fix.
 */
describe('lesson grid mobile track', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '..', 'student/Lesson.vue'), 'utf-8')

  it('declares an explicit single column below lg', () => {
    expect(content).toMatch(
      /grid grid-cols-1 gap-6 lg:grid-cols-3|grid gap-6 grid-cols-1 lg:grid-cols-3/,
    )
  })
})

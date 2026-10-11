import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Instructor dashboard touch floors.
 *
 * Same two findings as the student dashboard: the standalone "Insights" and
 * "Students" links sit at 36px (`min-h-9`), and the Refresh control uses the
 * compact `sm` button (~36px). Standalone rows are targets, not inline text.
 */
describe('instructor dashboard floors', () => {
  const content = fs.readFileSync(
    path.resolve(__dirname, '..', 'instructor/Dashboard.vue'),
    'utf-8',
  )

  it('holds standalone links to 44px', () => {
    expect(content).not.toMatch(/min-h-9/)
  })

  it('uses the default Refresh size, not the compact one', () => {
    expect(content).not.toMatch(/<Button variant="outline" size="sm" @click="load">/)
  })
})

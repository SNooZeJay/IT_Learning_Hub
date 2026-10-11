import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Admin dashboard touch floors.
 *
 * The standalone "All payments" link sat at 36px (`min-h-9`). Same rule as
 * both other dashboards: a standalone row is a target, not inline text.
 */
describe('admin dashboard floors', () => {
  it('holds standalone links to 44px', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'admin/Dashboard.vue'), 'utf-8')
    expect(content).not.toMatch(/min-h-9/)
  })
})

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf-8')
}

/**
 * Every destructive action passes through a confirmation.
 *
 * Removing an instructor's edit access is reversible (re-assign them), but
 * "reversible by doing the whole thing again" is not the same as harmless:
 * between the click and the re-assign, the instructor cannot work. The admin
 * Courses view fired `removeInstructor` on a single click of a 24px X with no
 * question asked. A destructive action without a confirmation is how a
 * mis-tap becomes an incident report.
 */
describe('destructive actions confirm first', () => {
  it('admin unassign-instructor asks before removing access', () => {
    const content = read('views/admin/Courses.vue')
    expect(content).toMatch(/useConfirm/)
    // The unassign path must pass through the asker, not call the service direct.
    const handler = content.match(/async function onUnassign[\s\S]*?\n}/)
    expect(handler).not.toBeNull()
    expect(handler?.[0]).toMatch(/confirm\.ask|ask\(\{/)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The instructor dashboard counts only what that instructor teaches.
 *
 * Every figure here used to be a bare `head: true` count over the whole table. It
 * looked right for students, enrolments and attempts, because RLS already narrows
 * those to `is_instructor_of` - so the aggregates inherited the scoping for free.
 *
 * Courses did not. A course row is readable by any signed-in account, because the
 * catalogue is public, so `countOf(courses)` was the whole platform. An instructor
 * with four courses was shown six, immediately beside a quiz count that was
 * correctly their own - which is worse than either number alone, because it makes
 * the wrong one look deliberate.
 *
 * RLS scopes reads. It cannot scope a count whose filter was never written. These
 * tests assert the filter is sent, so dropping it fails here rather than quietly
 * inflating a teacher's own dashboard during a demo.
 */

const from = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'instructor-1' } } })) },
  },
  isSupabaseConfigured: true,
}))

import { loadInstructorDashboard } from '@/services/dashboard.service'

/** Every filter each table was asked to apply, recorded as they are sent. */
let filters: Record<string, Array<{ in?: [string, unknown]; eq?: [string, unknown] }>>

function builder(table: string, data: unknown = []) {
  const record: { in?: [string, unknown]; eq?: [string, unknown] } = {}
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.order = () => b
  b.limit = () => b
  b.maybeSingle = () => b
  b.single = () => b
  b.in = vi.fn((column: string, values: unknown) => {
    record.in = [column, values]
    return b
  })
  b.eq = vi.fn((column: string, value: unknown) => {
    record.eq = [column, value]
    return b
  })
  b.then = (resolve: (v: unknown) => void) =>
    resolve({ data, error: null, count: Array.isArray(data) ? data.length : 0 })
  // Every call, not just the last: `lesson_materials` is read twice, once counted
  // and once for the recent list, and it is the counted one this file is about.
  filters[table] = [...(filters[table] ?? []), record]
  return b
}

/** The recorded calls for a table that carry a given filter. */
function callsWithIn(table: string, column: string): unknown[] {
  return (filters[table] ?? [])
    .map((r) => r.in)
    .filter((call): call is [string, unknown] => call?.[0] === column)
    .map((call) => call[1])
}

const TAUGHT = ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']

beforeEach(() => {
  filters = {}
  from.mockReset()
  from.mockImplementation((table: string) => {
    if (table === 'course_instructors') {
      return builder(
        table,
        TAUGHT.map((course_id) => ({ course_id })),
      )
    }
    if (table === 'modules') return builder(table, [{ id: 'module-1' }])
    if (table === 'lessons') return builder(table, [{ id: 'lesson-1' }])
    return builder(table, [])
  })
})

describe('loadInstructorDashboard scoping', () => {
  it('counts courses within the ids this instructor teaches', async () => {
    await loadInstructorDashboard().catch(() => undefined)
    expect(callsWithIn('courses', 'id')).toContainEqual(TAUGHT)
  })

  it('distinguishes published from draft inside the same set', async () => {
    await loadInstructorDashboard().catch(() => undefined)
    const statuses = (filters.courses ?? []).map((r) => r.eq?.[0])
    expect(statuses).toContain('status')
    expect(callsWithIn('courses', 'id')).toContainEqual(TAUGHT)
  })

  it('counts quizzes within the courses taught', async () => {
    await loadInstructorDashboard().catch(() => undefined)
    expect(callsWithIn('quizzes', 'course_id')).toContainEqual(TAUGHT)
  })

  it('counts materials by lesson, because lesson_materials has no course_id', async () => {
    await loadInstructorDashboard().catch(() => undefined)
    // Filtering lesson_materials by course_id is a 400 from PostgREST, not a zero.
    expect(callsWithIn('lesson_materials', 'course_id')).toHaveLength(0)
    expect(callsWithIn('lesson_materials', 'lesson_id')).toContainEqual(['lesson-1'])
  })

  it('reports null rather than zero for an instructor who teaches nothing', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'course_instructors') return builder(table, [])
      return builder(table, [])
    })
    const result = await loadInstructorDashboard()
    expect(result.courses).toBeNull()
    expect(result.publishedCourses).toBeNull()
    expect(result.quizzes).toBeNull()
    expect(result.materials).toBeNull()
  })
})

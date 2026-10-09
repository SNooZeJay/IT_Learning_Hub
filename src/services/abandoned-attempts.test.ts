import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * An `abandoned` quiz attempt is not a result.
 *
 * `start_quiz_attempt` sweeps an expired sitting to `ended_via = 'abandoned'` and
 * stops counting it against the allowance. But a sweep does not stop the read side
 * counting it: the row is still `status = 'submitted'` with `percentage = 0`, so
 * every query shaped `status = 'submitted'` picked it up.
 *
 * That was not cosmetic. A student with 87.5%, 75% and 87.5% was shown an average of
 * 45%, because two timed-out sittings with no answers sat in the denominator. The
 * same rows also inflated `attemptsUsed`, which could hide a quiz from "Continue
 * learning" that the RPC would still have let the student sit.
 *
 * These tests pin the rule at the place it is easy to break: the query. Each asserts
 * that the chain sent to PostgREST excludes `ended_via = 'abandoned'`, so a future
 * read that drops the filter fails here rather than quietly moving a student's grade.
 */

const from = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: vi.fn(),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'student-1' } } })) },
  },
  describeSupabaseError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  isSupabaseConfigured: true,
}))

import { getStudentGrades } from '@/services/learning.service'
import { loadTrend } from '@/services/trend.service'
import { listStudentQuizzes, listMyAttempts } from '@/services/quiz.service'

/** Every `.neq(column, value)` any builder was asked to send. */
const neqCalls: Array<[string, unknown]> = []

/**
 * A query builder that records every filter and resolves empty. A different table
 * shape per test is not needed: these tests are about which filters were sent.
 */
function recordingBuilder(data: unknown = []): Record<string, unknown> {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'select',
    'eq',
    'not',
    'in',
    'order',
    'limit',
    'range',
    'single',
    'maybeSingle',
  ]) {
    builder[method] = vi.fn(() => builder)
  }
  builder.neq = vi.fn((column: string, value: unknown) => {
    neqCalls.push([column, value])
    return builder
  })
  builder.then = (resolve: (v: unknown) => void) => resolve({ data, error: null, count: 0 })
  return builder
}

beforeEach(() => {
  from.mockReset()
  neqCalls.length = 0
  from.mockImplementation((table: string) =>
    recordingBuilder(
      // The per-course quiz list returns early when the course has no quizzes, so the
      // mock has to hand back one or the guarded query is never reached.
      table === 'quizzes'
        ? [{ id: 'quiz-1', course_id: 'course-1', module_id: null, lesson_id: null }]
        : [],
    ),
  )
})

describe('abandoned attempts are excluded from student reads', () => {
  it('the grades transcript excludes abandoned attempts', async () => {
    await getStudentGrades('student-1').catch(() => undefined)
    expect(neqCalls).toContainEqual(['ended_via', 'abandoned'])
  })

  it('the activity trend excludes abandoned attempts', async () => {
    await loadTrend('student_activity').catch(() => undefined)
    expect(neqCalls).toContainEqual(['ended_via', 'abandoned'])
  })

  it('the student quiz list excludes abandoned attempts', async () => {
    await listStudentQuizzes().catch(() => undefined)
    expect(neqCalls).toContainEqual(['ended_via', 'abandoned'])
  })

  it('the per-quiz attempt history excludes abandoned attempts', async () => {
    await listMyAttempts('quiz-1').catch(() => undefined)
    expect(neqCalls).toContainEqual(['ended_via', 'abandoned'])
  })
})

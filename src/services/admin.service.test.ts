import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same mocked-client harness as instructor.service.test.ts: assertions are
 * about what the service ASKS the database, because an insert against a table
 * the caller may not read is refused by RLS and nothing about that appears in
 * a type-check or a green unit test. Only the column lists show what was
 * requested.
 */

const from = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { listAdminRecentResults } from '@/services/admin.service'

/** A thenable chain that resolves to whatever the test queued for that table. */
function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

const builders: Record<string, ReturnType<typeof chain>[]> = {}

function respondByTable(
  responses: Record<string, { data?: unknown; error?: { message: string } | null }>,
) {
  for (const key of Object.keys(builders)) delete builders[key]
  from.mockImplementation((table: string) => {
    const builder = chain(responses[table] ?? { data: [] })
    ;(builders[table] ??= []).push(builder)
    return builder
  })
}

beforeEach(() => {
  from.mockReset()
})

describe('listAdminRecentResults', () => {
  function respondWithResults() {
    respondByTable({
      quiz_attempts: {
        data: [
          {
            id: 'qa1',
            quiz_id: 'q1',
            course_id: 'c1',
            student_id: 's1',
            percentage: '91',
            passed: true,
            submitted_at: '2026-10-09T04:04:00Z',
            status: 'submitted',
          },
        ],
      },
      assignment_submissions: {
        data: [
          {
            id: 'as1',
            assignment_id: 'a1',
            course_id: 'c2',
            student_id: 's2',
            grade: '7.5',
            status: 'graded',
            submitted_at: '2026-10-08T20:13:00Z',
          },
        ],
      },
      quizzes: { data: [{ id: 'q1', title: 'Threats exam' }] },
      assignments: { data: [{ id: 'a1', title: 'Decision table', max_points: '10' }] },
      courses: {
        data: [
          { id: 'c1', title: 'Security+ Exam Preparation' },
          { id: 'c2', title: 'Programming Foundations' },
        ],
      },
      profiles: {
        data: [
          { id: 's1', full_name: 'Ann Reyes', email: 'ann@example.com' },
          { id: 's2', full_name: 'Bo Tan', email: 'bo@example.com' },
        ],
      },
    })
  }

  it('merges attempts and graded submissions across all courses, newest first', async () => {
    respondWithResults()

    const rows = await listAdminRecentResults()

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      kind: 'quiz',
      studentName: 'Ann Reyes',
      courseTitle: 'Security+ Exam Preparation',
      itemTitle: 'Threats exam',
      scoreText: '91%',
      passed: true,
    })
    expect(rows[1]).toMatchObject({
      kind: 'assignment',
      studentName: 'Bo Tan',
      scoreText: '7.5/10',
      passed: null,
    })
  })

  it('asks for submitted attempts and graded submissions only', async () => {
    respondWithResults()
    await listAdminRecentResults()

    const attemptEq = builders['quiz_attempts']?.[0]?.eq as ReturnType<typeof vi.fn> | undefined
    expect(attemptEq?.mock.calls).toContainEqual(['status', 'submitted'])
    const submissionEq = builders['assignment_submissions']?.[0]?.eq as
      ReturnType<typeof vi.fn> | undefined
    expect(submissionEq?.mock.calls).toContainEqual(['status', 'graded'])
  })

  it('reports a refusal rather than an empty history', async () => {
    respondByTable({
      quiz_attempts: { error: { message: 'permission denied for table quiz_attempts' } },
      assignment_submissions: { data: [] },
    })

    await expect(listAdminRecentResults()).rejects.toThrow('You do not have access to that.')
  })
})

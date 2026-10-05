import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The client is mocked so the assertions can be about what the service sends.
 *
 * The interesting assertions here are negative ones. `submitAssignment` has to
 * send a `course_id` that the database derives itself (`sync_submission_course`
 * overwrites whatever arrives), and it has to leave `grade`, `feedback` and
 * `status` alone: a student who set their own status to `graded`, or their own
 * grade to 100, would be editing the instructor's record, and the only thing
 * standing between that and the transcript is that this code does not send the
 * columns.
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

import {
  LearningError,
  listStudentAssignments,
  submitAssignment,
  validateSubmissionText,
} from '@/services/learning.service'

/** A thenable chain that resolves to whatever the test queued. */
function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'select',
    'eq',
    'in',
    'order',
    'limit',
    'insert',
    'update',
    'delete',
    'is',
    'maybeSingle',
  ]) {
    builder[method] = vi.fn(() => builder)
  }
  builder.single = vi.fn(() => builder)
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

/**
 * The payloads a table was written with, across every builder handed out for it.
 *
 * Scanning all of them rather than the first is load-bearing: `submitAssignment`
 * reads the existing row before it writes, so the write lands on the *second*
 * builder for the same table. Reading the first builder's `insert` would find a
 * mock that was never called.
 */
function writesOn(table: string, method: 'insert' | 'update'): unknown[] {
  const payloads: unknown[] = []
  for (const builder of builders[table] ?? []) {
    const fn = builder[method] as ReturnType<typeof vi.fn> | undefined
    for (const call of fn?.mock.calls ?? []) payloads.push(call[0])
  }
  return payloads
}

/** The row a table was written with, insert first and then update. */
function writtenRow(table: string): Record<string, unknown> | undefined {
  const args = writesOn(table, 'insert')[0] ?? writesOn(table, 'update')[0]
  return args as Record<string, unknown> | undefined
}

function didInsert(table: string): boolean {
  return writesOn(table, 'insert').length > 0
}

function didUpdate(table: string): boolean {
  return writesOn(table, 'update').length > 0
}

const assignmentRow = {
  id: 'a1',
  course_id: 'course-1',
  module_id: null,
  title: 'Reflection on module one',
  instructions: 'Write 300 words.',
  due_at: '2026-10-20T09:00:00Z',
  max_points: '50',
  status: 'published',
}

const submissionRow = {
  id: 's1',
  assignment_id: 'a1',
  course_id: 'course-1',
  student_id: 'student-1',
  submission_text: 'My answer.',
  file_path: null,
  submitted_at: '2026-10-06T10:00:00Z',
  grade: null,
  feedback: null,
  graded_by: null,
  graded_at: null,
  status: 'submitted',
}

beforeEach(() => {
  from.mockReset()
})

// ---------------------------------------------------------------------------
// Validation, which mirrors `submission_has_content`
// ---------------------------------------------------------------------------

describe('validateSubmissionText', () => {
  it('refuses blank work, because a hand-in with no content is not a hand-in', () => {
    // `submission_has_content` is `submission_text is not null or file_path is
    // not null`. With no upload available the text is the only possible body, so
    // this is the same rule stated before the round trip.
    for (const text of ['', '   ', '\n\t']) {
      const check = validateSubmissionText(text)
      expect(check.ok).toBe(false)
      if (!check.ok) expect(check.reason).toMatch(/before handing/)
    }
    expect(validateSubmissionText('something').ok).toBe(true)
  })

  it('imposes no length rule, because the schema has none', () => {
    // The column is `text`. A maximum invented here would be a limit only this
    // form enforced, which is the kind of rule that surprises the second student
    // to write a long answer and the first to be told no.
    expect(validateSubmissionText('x'.repeat(50_000)).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Handing in
// ---------------------------------------------------------------------------

describe('submitAssignment', () => {
  it('inserts one row the first time, naming the assignment and the student', async () => {
    respondByTable({ assignment_submissions: { data: submissionRow } })

    const result = await submitAssignment('a1', '  My answer.  ')

    expect(didInsert('assignment_submissions')).toBe(true)
    expect(writtenRow('assignment_submissions')).toMatchObject({
      assignment_id: 'a1',
      student_id: 'student-1',
      submission_text: 'My answer.',
    })
    expect(result.status).toBe('submitted')
    expect(result.submissionText).toBe('My answer.')
  })

  it('updates the existing row rather than inserting a second one', async () => {
    // The unique index `assignment_submissions_unique_student` would refuse the
    // duplicate, and the grading queue is built on there being one submission
    // per assignment. So the row that exists is the row that gets written.
    respondByTable({ assignment_submissions: { data: [submissionRow] } })

    await submitAssignment('a1', 'A better answer.')

    expect(didInsert('assignment_submissions')).toBe(false)
    expect(didUpdate('assignment_submissions')).toBe(true)
    expect(writtenRow('assignment_submissions')).toMatchObject({
      submission_text: 'A better answer.',
    })
  })

  it('never sends course_id, which the database derives from the assignment', async () => {
    respondByTable({ assignment_submissions: { data: submissionRow } })

    await submitAssignment('a1', 'My answer.')

    // `sync_submission_course` overwrites `new.course_id` from the parent
    // assignment before the row is written, and migration 20261006120000 calls the
    // column a read optimisation that is never a client-supplied fact. Sending it
    // would be sending something the server is about to ignore.
    expect(writtenRow('assignment_submissions')).not.toHaveProperty('course_id')
  })

  it('never sends the grade, the feedback or the status', async () => {
    respondByTable({ assignment_submissions: { data: submissionRow } })

    await submitAssignment('a1', 'My answer.')

    // A student who could set `status` or `grade` on their own row would be
    // editing the instructor's record. The database refuses it - the trigger and
    // the `submission_graded_has_grader` check - but the first line of defence is
    // that the browser never offers the columns.
    const row = writtenRow('assignment_submissions') ?? {}
    for (const column of ['grade', 'feedback', 'graded_by', 'graded_at', 'status']) {
      expect(Object.keys(row)).not.toContain(column)
    }
  })

  it('refuses to replace work that has already been marked', async () => {
    respondByTable({
      assignment_submissions: { data: [{ ...submissionRow, status: 'graded', grade: '45' }] },
    })

    await expect(submitAssignment('a1', 'A new answer.')).rejects.toBeInstanceOf(LearningError)
    await expect(submitAssignment('a1', 'A new answer.')).rejects.toThrow(/already been marked/)

    // Refused before any write, so nothing was attempted.
    expect(didUpdate('assignment_submissions')).toBe(false)
    expect(didInsert('assignment_submissions')).toBe(false)
  })

  it('refuses blank work before the round trip', async () => {
    respondByTable({ assignment_submissions: { data: [] } })

    await expect(submitAssignment('a1', '   ')).rejects.toThrow(/before handing/)
    expect(from).not.toHaveBeenCalled()
  })

  it('surfaces the database refusal in words a person can act on', async () => {
    respondByTable({
      assignment_submissions: { error: { message: '42501: new row violates row-level policy' } },
    })

    // A student with a pending enrolment hits exactly this. The policy is
    // `is_enrolled_in(course_id)`, and its refusal is the only honest
    // explanation of why their work was not accepted.
    await expect(submitAssignment('a1', 'My answer.')).rejects.toThrow(
      'new row violates row-level policy',
    )
  })

  it('reports a failed read of the existing hand-in rather than inserting blindly', async () => {
    respondByTable({
      assignment_submissions: { error: { message: 'permission denied for table' } },
    })

    await expect(submitAssignment('a1', 'My answer.')).rejects.toThrow(/permission denied/)
    // Proceeding on an unread lookup would insert a second row and lean on the
    // unique index as the error message, which names a constraint rather than
    // the thing that went wrong.
    expect(didInsert('assignment_submissions')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Reading the student's own state
// ---------------------------------------------------------------------------

describe('listStudentAssignments', () => {
  it('attaches the student submission to the matching assignment', async () => {
    respondByTable({
      assignments: { data: [assignmentRow] },
      assignment_submissions: { data: [submissionRow] },
    })

    const [assignment] = await listStudentAssignments('course-1')

    expect(assignment.id).toBe('a1')
    expect(assignment.submission?.status).toBe('submitted')
    // Postgres numerics arrive as strings; left unconverted `50` renders as `50.00`
    // and the ratio against a grade divides by a string.
    expect(assignment.maxPoints).toBe(50)
    expect(typeof assignment.maxPoints).toBe('number')
  })

  it('leaves the submission null rather than fabricating one', async () => {
    respondByTable({
      assignments: { data: [assignmentRow] },
      assignment_submissions: { data: [] },
    })

    const [assignment] = await listStudentAssignments('course-1')

    // "Not submitted" and "submitted, awaiting a mark" mean different things to a
    // student, and the difference is exactly whether this is null.
    expect(assignment.submission).toBeNull()
  })

  it('carries a grade and its feedback once marked', async () => {
    respondByTable({
      assignments: { data: [assignmentRow] },
      assignment_submissions: {
        data: [
          {
            ...submissionRow,
            status: 'graded',
            grade: '45',
            feedback: 'Good, but say why.',
            graded_at: '2026-10-07T08:00:00Z',
          },
        ],
      },
    })

    const [assignment] = await listStudentAssignments('course-1')

    expect(assignment.submission?.grade).toBe(45)
    expect(assignment.submission?.feedback).toBe('Good, but say why.')
    expect(assignment.submission?.gradedAt).toBe('2026-10-07T08:00:00Z')
  })

  it('never shows a draft', async () => {
    respondByTable({
      assignments: { data: [assignmentRow, { ...assignmentRow, id: 'a2', status: 'draft' }] },
      assignment_submissions: { data: [] },
    })

    const assignments = await listStudentAssignments('course-1')

    expect(assignments.map((row) => row.id)).toEqual(['a1'])
  })

  it('reports a load failure rather than showing an empty assignment list', async () => {
    respondByTable({
      assignments: { error: { message: 'permission denied for table assignments' } },
    })

    await expect(listStudentAssignments('course-1')).rejects.toThrow(/permission denied/)
  })

  it('does not query submissions at all when a course has no assignments', async () => {
    respondByTable({ assignments: { data: [] } })

    await expect(listStudentAssignments('course-1')).resolves.toEqual([])
    // A second query here would be one whose only possible answer is empty.
    expect(didInsert('assignment_submissions')).toBe(false)
    expect(builders.assignment_submissions ?? []).toHaveLength(0)
  })
})

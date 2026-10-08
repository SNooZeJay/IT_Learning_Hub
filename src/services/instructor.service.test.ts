import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The client is mocked rather than stubbed per function, so the assertions can be
 * about what the service ASKS the database, which is the part that matters.
 *
 * The last test in the file is the reason. `createAssignment` returning a
 * well-formed `Assignment` says nothing about whether the write is permitted:
 * an insert against a course the caller does not teach is refused by the
 * `assignments instructor write` policy, and nothing about that appears in a
 * type-check, a build, or a green unit test. Only the column list and the
 * payload show what was requested.
 */

const from = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import {
  createAssignment,
  DEFAULT_ASSIGNMENT_POINTS,
  deleteAssignment,
  InstructorError,
  MAX_ASSIGNMENT_POINTS,
  updateAssignment,
  validateAssignmentDraft,
  validateAssignmentPatch,
} from '@/services/instructor.service'

/** A thenable chain that resolves to whatever the test queued for that table. */
function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.single = vi.fn(() => builder)
  // `await` on the builder resolves it, which is how supabase-js query builders
  // behave.
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

/** The column list the service asked for on a table, or undefined if never asked. */
function selectedColumns(table: string): string | undefined {
  const select = builders[table]?.[0]?.select as ReturnType<typeof vi.fn> | undefined
  return select?.mock.calls[0]?.[0]
}

/** The row a table was written with. */
function writtenRow(table: string): Record<string, unknown> | undefined {
  const insert = builders[table]?.[0]?.insert as ReturnType<typeof vi.fn> | undefined
  const update = builders[table]?.[0]?.update as ReturnType<typeof vi.fn> | undefined
  const args = insert?.mock.calls[0]?.[0] ?? update?.mock.calls[0]?.[0]
  return args as Record<string, unknown> | undefined
}

const assignmentRow = {
  id: 'a1',
  course_id: 'course-1',
  module_id: null,
  title: 'Reflection on module one',
  instructions: 'Write 300 words.',
  due_at: '2026-10-20T09:00:00Z',
  max_points: '100',
  status: 'draft',
  created_by: 'instructor-1',
  created_at: '2026-10-06T09:00:00Z',
  updated_at: '2026-10-06T09:00:00Z',
}

beforeEach(() => {
  from.mockReset()
})

// ---------------------------------------------------------------------------
// Validation, which mirrors the constraints on `assignments`
// ---------------------------------------------------------------------------

describe('validateAssignmentDraft', () => {
  it('rejects a blank title, which is `assignments_title_check`', () => {
    expect(validateAssignmentDraft({ title: '' })).toEqual({
      ok: false,
      reason: 'Give the assignment a title.',
    })
    expect(validateAssignmentDraft({ title: '   ' }).ok).toBe(false)
    expect(validateAssignmentDraft({ title: '\t\n' }).ok).toBe(false)
    expect(validateAssignmentDraft({ title: 'a' }).ok).toBe(true)
  })

  it('rejects zero and negative points, which is `assignments_max_points_check`', () => {
    // The constraint is `max_points > 0`, so 0 is refused as firmly as -5.
    for (const maxPoints of [0, -1, -0.01]) {
      const check = validateAssignmentDraft({ title: 'Work', maxPoints })
      expect(check.ok).toBe(false)
      if (!check.ok) expect(check.reason).toMatch(/more than zero/)
    }
    expect(validateAssignmentDraft({ title: 'Work', maxPoints: 0.5 }).ok).toBe(true)
  })

  it('refuses points the numeric(6,2) column cannot hold', () => {
    // 100000 is under the check constraint's floor but over the column's
    // precision, so Postgres answers "numeric field overflow" - a data type, not
    // the field the instructor was editing.
    const check = validateAssignmentDraft({ title: 'Work', maxPoints: MAX_ASSIGNMENT_POINTS + 1 })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/9999\.99/)
    expect(validateAssignmentDraft({ title: 'Work', maxPoints: MAX_ASSIGNMENT_POINTS }).ok).toBe(
      true,
    )
  })

  it('refuses a number that is not a number', () => {
    // `v-model.number` on an emptied box leaves null and on a box holding text
    // leaves NaN, and `NaN > 0` is false - so without this a NaN would sail past
    // the `> 0` check and be written to the database as `NaN`.
    const check = validateAssignmentDraft({ title: 'Work', maxPoints: Number.NaN })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/must be a number/)
  })

  it('rejects a status outside the `assignment_status` enum', () => {
    const check = validateAssignmentDraft({
      title: 'Work',
      status: 'archived' as unknown as 'draft',
    })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/draft or published/)
    expect(validateAssignmentDraft({ title: 'Work', status: 'published' }).ok).toBe(true)
  })

  it('treats a blank or absent deadline as no deadline', () => {
    expect(validateAssignmentDraft({ title: 'Work', dueAt: null }).ok).toBe(true)
    expect(validateAssignmentDraft({ title: 'Work', dueAt: '' }).ok).toBe(true)
    expect(validateAssignmentDraft({ title: 'Work', dueAt: '   ' }).ok).toBe(true)
    expect(validateAssignmentDraft({ title: 'Work', dueAt: '2026-10-20T09:00' }).ok).toBe(true)
  })

  it('rejects a deadline that is not a date', () => {
    const check = validateAssignmentDraft({ title: 'Work', dueAt: 'next tuesday' })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/not a date/)
  })

  it('names the title before anything else, so the first thing shown is the first fault', () => {
    // A form showing "points must be more than zero" while the title is also
    // blank has told the instructor about the wrong problem first.
    const check = validateAssignmentDraft({ title: '  ', maxPoints: 0 })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/title/)
  })
})

describe('validateAssignmentPatch', () => {
  it('accepts a patch that leaves the title out entirely', () => {
    // `title` absent means "leave the title alone". Running the draft check over a
    // patch would refuse every edit that did not carry it.
    expect(validateAssignmentPatch({ maxPoints: 50 }).ok).toBe(true)
    expect(validateAssignmentPatch({}).ok).toBe(true)
  })

  it('still rejects a title that is present and blank', () => {
    expect(validateAssignmentPatch({ title: '   ' }).ok).toBe(false)
    expect(validateAssignmentPatch({ title: 'Kept' }).ok).toBe(true)
  })

  it('applies the same rules to the fields the patch does carry', () => {
    expect(validateAssignmentPatch({ maxPoints: 0 }).ok).toBe(false)
    expect(validateAssignmentPatch({ dueAt: 'whenever' }).ok).toBe(false)
    expect(validateAssignmentPatch({ status: 'nope' as unknown as 'draft' }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

describe('createAssignment', () => {
  it('writes a draft by default and names its author', async () => {
    respondByTable({ assignments: { data: assignmentRow } })

    await createAssignment('course-1', { title: '  Reflection on module one  ' }, 'instructor-1')

    const row = writtenRow('assignments')
    expect(row).toMatchObject({
      course_id: 'course-1',
      title: 'Reflection on module one',
      status: 'draft',
      max_points: DEFAULT_ASSIGNMENT_POINTS,
      module_id: null,
      due_at: null,
      instructions: null,
      created_by: 'instructor-1',
    })
  })

  it('does not check the module when the assignment belongs to the course', async () => {
    respondByTable({ assignments: { data: assignmentRow } })

    await createAssignment('course-1', { title: 'Work' }, 'instructor-1')

    // A `module_id` of null needs no lookup, so no module query should have run.
    expect(builders.modules ?? []).toHaveLength(0)
  })

  it('refuses a module that belongs to another course', async () => {
    respondByTable({
      modules: { data: [{ id: 'm9', course_id: 'a-different-course' }] },
      assignments: { data: assignmentRow },
    })

    await expect(
      createAssignment('course-1', { title: 'Work', moduleId: 'm9' }, 'instructor-1'),
    ).rejects.toThrow(/different course/)

    // The refusal has to happen before the write, or the row lands anyway.
    expect(writtenRow('assignments')).toBeUndefined()
  })

  it('surfaces the database refusal in words a person can act on', async () => {
    respondByTable({
      assignments: { error: { message: '42501: new row violates row-level policy' } },
    })

    // The refusal must still surface - the point is never to swallow it.
    await expect(createAssignment('course-1', { title: 'Work' }, 'i-1')).rejects.toBeInstanceOf(
      InstructorError,
    )
    // And it must not surface as SQL. This particular wording says "row-level policy"
    // where the recognised phrase is "row-level security", so it is not a mapped
    // refusal and takes the service's own fallback rather than the access sentence.
    // Either is correct; leaking `42501` or a policy name to the person clicking Save
    // is not, and this is the assertion that holds that line.
    await expect(createAssignment('course-1', { title: 'Work' }, 'i-1')).rejects.toThrow(
      'Could not add the assignment.',
    )
    await expect(createAssignment('course-1', { title: 'Work' }, 'i-1')).rejects.not.toThrow(
      /42501|row-level policy/,
    )
  })

  it('names the columns it reads back instead of asking for every column', async () => {
    respondByTable({ assignments: { data: assignmentRow } })

    await createAssignment('course-1', { title: 'Work' }, 'instructor-1')

    const columns = selectedColumns('assignments')
    expect(columns).toBeTypeOf('string')
    expect(columns).not.toBe('*')
    // Every column the `Assignment` view model is built from, and no more. A
    // `select *` here would also drag back `created_at` and `updated_at`, which
    // nothing on the course page reads.
    expect(columns?.split(', ').sort()).toEqual([
      'course_id',
      'created_by',
      'due_at',
      'id',
      'instructions',
      'max_points',
      'module_id',
      'status',
      'title',
    ])
  })

  it('never writes a draft the caller did not ask to publish', async () => {
    respondByTable({ assignments: { data: { ...assignmentRow, status: 'published' } } })

    await createAssignment('course-1', { title: 'Work', status: 'published' }, 'instructor-1')

    expect(writtenRow('assignments')?.status).toBe('published')
  })
})

describe('updateAssignment', () => {
  it('writes only the fields the patch carries', async () => {
    respondByTable({ assignments: { data: assignmentRow } })

    await updateAssignment('a1', { title: 'Renamed' })

    // Sending `module_id: null` or `due_at: null` for a patch that never mentioned
    // them would silently clear a deadline an instructor never touched.
    expect(writtenRow('assignments')).toEqual({ title: 'Renamed' })
  })

  it('can clear the deadline, because an explicit null is a change', async () => {
    respondByTable({ assignments: { data: { ...assignmentRow, due_at: null } } })

    await updateAssignment('a1', { dueAt: null })

    expect(writtenRow('assignments')).toEqual({ due_at: null })
  })

  it('refuses a blank title before the round trip', async () => {
    respondByTable({ assignments: { data: assignmentRow } })

    await expect(updateAssignment('a1', { title: '  ' })).rejects.toThrow(/title/)
    expect(writtenRow('assignments')).toBeUndefined()
  })

  it('turns blank instructions into null rather than an empty string', async () => {
    respondByTable({ assignments: { data: assignmentRow } })

    await updateAssignment('a1', { instructions: '   ' })

    expect(writtenRow('assignments')).toEqual({ instructions: null })
  })
})

describe('deleteAssignment', () => {
  it('deletes by id and reports a refusal rather than pretending', async () => {
    respondByTable({ assignments: { data: null, error: null } })
    await expect(deleteAssignment('a1')).resolves.toBeUndefined()

    respondByTable({
      assignments: { error: { message: 'permission denied for table assignments' } },
    })
    // The refusal still propagates, and the table name no longer travels with it.
    await expect(deleteAssignment('a1')).rejects.toThrow('You do not have access to that.')
    await expect(deleteAssignment('a1')).rejects.not.toThrow(/permission denied/)
  })
})

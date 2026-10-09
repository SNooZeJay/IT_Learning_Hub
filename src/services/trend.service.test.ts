import { describe, expect, it, vi } from 'vitest'
import { loadTrend, TREND_COPY } from './trend.service'

/**
 * The trend loader's contract, without a network.
 *
 * `supabase` is mocked at module scope so these tests assert the two things that are
 * actually easy to get wrong and hard to notice: that the loader refuses to invent data
 * when a read fails, and that a metric reads the table and column its copy promises.
 * Row Level Security is the real authorisation boundary and is exercised in the
 * end-to-end suite against a live database, not here.
 */

const from = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}))

/** A query chain that resolves to `{ data, error }`, like a PostgREST select does. */
function query(data: unknown, error: unknown = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    // The loaders exclude `abandoned` attempts, a sitting the student never returned
    // to. The mock has to answer the call or the test proves nothing about the chain.
    neq: () => chain,
    not: () => chain,
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error }),
  }
  return chain
}

/** Six buckets is the window the axis labels are sized for. */
const WINDOW = 6

describe('loadTrend', () => {
  it('reads submitted quiz attempts for a student, dated by submission', async () => {
    from.mockReturnValue(
      query([{ submitted_at: new Date().toISOString() }, { submitted_at: null }]),
    )

    const points = await loadTrend('student_activity')

    expect(from).toHaveBeenCalledWith('quiz_attempts')
    expect(points).toHaveLength(WINDOW)
    // Exactly the one row that carries a submission date is counted.
    expect(points.reduce((sum, point) => sum + point.value, 0)).toBe(1)
    // The current month is the last bucket, oldest first.
    expect(points[points.length - 1].value).toBe(1)
  })

  it('reads submitted quiz attempts for an instructor', async () => {
    from.mockReturnValue(query([{ submitted_at: new Date().toISOString() }]))

    const points = await loadTrend('instructor_activity')

    expect(from).toHaveBeenCalledWith('quiz_attempts')
    expect(points.reduce((sum, point) => sum + point.value, 0)).toBe(1)
  })

  it('reads enrollments for an admin, dated by enrollment', async () => {
    from.mockReturnValue(
      query([{ enrolled_at: new Date().toISOString() }, { enrolled_at: new Date().toISOString() }]),
    )

    const points = await loadTrend('admin_enrollment')

    expect(from).toHaveBeenCalledWith('enrollments')
    expect(points.reduce((sum, point) => sum + point.value, 0)).toBe(2)
  })

  it('returns an empty series when the read fails, rather than six zeroes', async () => {
    from.mockReturnValue(query(null, { message: 'permission denied' }))

    const points = await loadTrend('admin_enrollment')

    // Six buckets of zero would render as a flat line reading "nothing happened",
    // which is a different and false claim than "we could not find out".
    expect(points).toEqual([])
  })

  it('returns a window of zeroes when there genuinely is nothing yet', async () => {
    from.mockReturnValue(query([]))

    const points = await loadTrend('student_activity')

    expect(points).toHaveLength(WINDOW)
    expect(points.every((point) => point.value === 0)).toBe(true)
  })

  it('ignores timestamps that cannot be read instead of bucketing them as now', async () => {
    from.mockReturnValue(query([{ submitted_at: 'not-a-date' }]))

    const points = await loadTrend('student_activity')

    expect(points.reduce((sum, point) => sum + point.value, 0)).toBe(0)
  })
})

describe('TREND_COPY', () => {
  it('describes each role in its own terms', () => {
    expect(Object.keys(TREND_COPY).sort()).toEqual(
      ['admin_enrollment', 'instructor_activity', 'student_activity'].sort(),
    )
    // Every metric needs all four sentences, or one role renders a panel with no title.
    for (const copy of Object.values(TREND_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.subtitle.length).toBeGreaterThan(0)
      expect(copy.emptyTitle.length).toBeGreaterThan(0)
      expect(copy.emptyDescription.length).toBeGreaterThan(0)
    }
  })
})

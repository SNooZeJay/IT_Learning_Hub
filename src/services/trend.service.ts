import { supabase } from './supabase/client'

/**
 * One monthly series per dashboard, chosen by role.
 *
 * The point of one loader rather than three queries scattered across the views is that
 * every role's chart is built the same way from the same helper, so "what the trend
 * chart shows" is one decision in one file. Each metric reads a different table, but all
 * three are bucketed by a calendar month with the same window and the same gap rule.
 *
 * Row Level Security is the authorisation. These queries carry no `.eq('role', ...)` and
 * no manual course filter: the database decides what the signed-in caller may read.
 *   - `lesson_progress` is readable by the student it belongs to, the instructor of that
 *     course, or an admin, so a student's series is their own work and an instructor's is
 *     their courses.
 *   - `quiz_attempts` follows the same rule on `course_id`.
 *   - `enrollments` is readable by the enrolled student, the instructor of the course, or
 *     an admin, so an instructor's series counts only their own courses' enrollments.
 * Because of that, the same query returns different numbers per role rather than the
 * frontend filtering a wider read down, which is the distinction that matters here.
 */

export type TrendMetric = 'student_activity' | 'instructor_activity' | 'admin_enrollment'

export interface TrendPoint {
  /** `YYYY-MM`, the stable key a row is bucketed by. */
  key: string
  /** Short month label for the axis, e.g. `Oct`. */
  label: string
  value: number
}

/**
 * Six months, oldest first, current month last.
 *
 * Six rather than twelve because the axis labels are read unrotated; a year of months
 * does not fit a dashboard card at this width without tilting the reader's head, which is
 * the reason the analytics page picked the same window.
 */
const MONTH_WINDOW = 6

/** Buckets for the last `count` calendar months. */
function monthWindow(count: number): TrendPoint[] {
  const formatter = new Intl.DateTimeFormat('en-PH', { month: 'short' })
  const buckets: TrendPoint[] = []
  const now = new Date()

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: formatter.format(date),
      value: 0,
    })
  }

  return buckets
}

/** `YYYY-MM` for an ISO timestamp, or `''` when it cannot be read. */
function monthKeyOf(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function bucketInto(buckets: TrendPoint[], dates: Array<string | null | undefined>): void {
  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const date of dates) {
    const bucket = index.get(monthKeyOf(date))
    if (bucket) bucket.value += 1
  }
}

/**
 * A series, or `[]` when it could not be read.
 *
 * An empty array is the caller's cue to show its own error state, which is why a failed
 * read is not silently rendered as six zeroes: "nothing happened" and "we could not find
 * out" are different sentences and this app does not conflate them.
 */
export async function loadTrend(metric: TrendMetric): Promise<TrendPoint[]> {
  const buckets = monthWindow(MONTH_WINDOW)

  if (metric === 'student_activity') {
    // Quizzes the signed-in student submitted, by submission time.
    //
    // `completed_at` on `lesson_progress` was the first choice here and is the more
    // obvious "progress" number, but it is null for every unfinished lesson and this
    // platform has no completed lesson yet, so the panel would have been permanently
    // empty and proved nothing. A submitted attempt is work the student actually
    // finished and is recorded either way, so the series reflects real activity from
    // the first quiz onwards. The RLS policy is
    // `student_id = auth.uid() or is_instructor_of(course_id) or is_admin()`, so a
    // student reads their own attempts and nobody else's.
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('submitted_at')
      .eq('status', 'submitted')
      .not('submitted_at', 'is', null)
    if (error) return []
    bucketInto(
      buckets,
      (data as Array<{ submitted_at: string | null }>).map((r) => r.submitted_at),
    )
    return buckets
  }

  if (metric === 'instructor_activity') {
    // Quiz attempts submitted across the instructor's courses, by submission time.
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('submitted_at')
      .eq('status', 'submitted')
      .not('submitted_at', 'is', null)
    if (error) return []
    bucketInto(
      buckets,
      (data as Array<{ submitted_at: string | null }>).map((r) => r.submitted_at),
    )
    return buckets
  }

  // Platform-wide new enrollments for an admin, dated by when the row was written.
  const { data, error } = await supabase.from('enrollments').select('enrolled_at')
  if (error) return []
  bucketInto(
    buckets,
    (data as Array<{ enrolled_at: string }>).map((r) => r.enrolled_at),
  )
  return buckets
}

/** Copy for each metric, so the three dashboards describe their own series honestly. */
export const TREND_COPY: Record<
  TrendMetric,
  { title: string; subtitle: string; emptyTitle: string; emptyDescription: string; unit: string }
> = {
  student_activity: {
    title: 'Your learning activity',
    subtitle: 'Quizzes you submitted per month over the last six months.',
    emptyTitle: 'No quizzes submitted yet',
    emptyDescription: 'Submit a quiz and it will appear here, dated to the month you submitted it.',
    unit: 'quiz',
  },
  instructor_activity: {
    title: 'Quiz activity',
    subtitle: 'Quiz attempts submitted across your courses, per month.',
    emptyTitle: 'No quiz attempts yet',
    emptyDescription:
      'When a student submits a quiz in one of your courses it will appear here by the month it was submitted.',
    unit: 'attempt',
  },
  admin_enrollment: {
    title: 'Enrollment trend',
    subtitle: 'New enrollments per month across the platform.',
    emptyTitle: 'No enrollments yet',
    emptyDescription:
      'The chart fills in as students enroll. Nothing is plotted for a month with no enrollments.',
    unit: 'enrollment',
  },
}

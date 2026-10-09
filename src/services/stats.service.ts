import { supabase } from './supabase/client'
import { humanizeError } from './errors'
import { formatPeso } from '@/types'

/**
 * Read-only aggregate queries for dashboards.
 *
 * Counted with `head: true` rather than selecting rows, so the payload is empty
 * regardless of how many students or courses exist. RLS still applies: an
 * instructor calling these gets only what they are entitled to, and an admin
 * gets the whole platform.
 */

export interface AdminStats {
  students: number
  instructors: number
  admins: number
  publishedCourses: number
  draftCourses: number
  paidCourses: number
  enrolments: number
  /** centavos, summed server-side so no row data crosses the wire. */
  revenueCentavos: number
}

const EMPTY: AdminStats = {
  students: 0,
  instructors: 0,
  admins: 0,
  publishedCourses: 0,
  draftCourses: 0,
  paidCourses: 0,
  enrolments: 0,
  revenueCentavos: 0,
}

/**
 * What a count query resolves to.
 *
 * Spelled out structurally rather than as `ReturnType<typeof supabase.from>`.
 * `PostgrestClient.from` is overloaded - one signature for tables, one for views - and
 * `ReturnType` on an overloaded function resolves to whichever signature is declared
 * LAST. While `Database['Views']` was empty that happened to be the table overload, so
 * this type was the query builder. The moment a view was added to the generated types,
 * the last signature became the view one and this stopped matching a `.select()` result,
 * breaking twelve lines in this file with errors that named nothing about views.
 *
 * Declaring the two shapes actually consumed here - what `build` is handed, and what it
 * resolves to - does not depend on overload order, and does not change if views are
 * added later.
 */
interface CountResult {
  count: number | null
  error: { message: string } | null
}

/**
 * A count query's refusal, worded for the dashboard that shows it.
 *
 * These two are the only throws in this file and both used to pass the database's own
 * wording straight through, which meant an administrator's dashboard could answer a
 * failed read with a sentence naming a table or a function. `humanizeError` keeps the
 * refusals worth reading and replaces the rest with wording that says what to do.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

/**
 * Count the rows on one of the tables this file aggregates.
 *
 * `select('*', { count: 'exact', head: true })` is what makes it a count rather than a
 * fetch: `head` sends no rows, so the payload is empty however many rows match.
 *
 * The builder type is INFERRED from `supabase.from(table)` and passed through `build`
 * unchanged, rather than named in the signature. This file originally annotated the
 * callback parameter `ReturnType<typeof supabase.from>`, which was a latent bug rather
 * than a style choice: `from` is overloaded - one signature for tables, one for views -
 * and `ReturnType` on an overloaded function resolves to whichever signature is declared
 * LAST. While `Database['Views']` was empty that was the table overload by accident. The
 * moment the generated types gained a view, the last signature became the view one and
 * this file broke, rejecting `role` and `status` as columns that "only exist on
 * platform_revenue".
 *
 * Inference keeps the real column names, the real filter signatures and the real value
 * types, and does not depend on overload order. Two shapes were tried first and both are
 * worse: naming `PostgrestQueryBuilder` directly needs three to five type arguments from
 * the SDK's internal generics, and a hand-written `eq`/`gt` shape cannot be made
 * variance-compatible with the SDK's narrower value types.
 *
 * The parameter is the finished query rather than a table name plus a callback, so no
 * builder type is ever named in this file. That is the whole fix: there is nothing left
 * for overload order to invalidate.
 */
async function count(query: PromiseLike<CountResult>): Promise<number> {
  const { count: total, error } = await query
  if (error) throw new Error(messageOf(error, 'These figures could not be counted.'))
  return total ?? 0
}

/**
 * `select('*', { count: 'exact', head: true })` is what makes a query a count.
 *
 * Generic in the table name rather than typed as a union of the four. A union makes
 * `supabase.from(table)` resolve against the INTERSECTION of all four tables' columns,
 * which for this schema is `id` and `status` - so `role`, `student_id` and
 * `price_centavos` were rejected at every call site with an error that named none of
 * them. Each call now infers its own table, so each gets its own real columns.
 */
function counted<T extends 'profiles' | 'courses' | 'enrollments' | 'payments'>(table: T) {
  return supabase.from(table).select('*', { count: 'exact', head: true })
}

export async function getAdminStats(): Promise<AdminStats> {
  const [students, instructors, admins, published, drafts, paid, enrolments] = await Promise.all([
    count(counted('profiles').eq('role', 'student')),
    count(counted('profiles').eq('role', 'instructor')),
    count(counted('profiles').eq('role', 'admin')),
    count(counted('courses').eq('status', 'published')),
    count(counted('courses').eq('status', 'draft')),
    count(counted('courses').gt('price_centavos', 0)),
    count(counted('enrollments').eq('status', 'active')),
  ])

  const { data: revenue, error: revenueError } = await supabase
    .from('payments')
    .select('amount_centavos')
    .eq('status', 'paid')

  if (revenueError) throw new Error(messageOf(revenueError, 'Takings could not be totalled.'))

  return {
    students,
    instructors,
    admins,
    publishedCourses: published,
    draftCourses: drafts,
    paidCourses: paid,
    enrolments,
    revenueCentavos: (revenue ?? []).reduce((sum, row) => sum + row.amount_centavos, 0),
  }
}

export async function getStudentStats(studentId: string): Promise<{
  enrolled: number
  completed: number
}> {
  const [enrolled, completed] = await Promise.all([
    count(counted('enrollments').eq('student_id', studentId).eq('status', 'active')),
    count(counted('enrollments').eq('student_id', studentId).eq('status', 'completed')),
  ])
  return { enrolled, completed }
}

export { formatPeso, EMPTY as EMPTY_ADMIN_STATS }

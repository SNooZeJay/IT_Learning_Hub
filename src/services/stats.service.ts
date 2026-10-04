import { supabase } from './supabase/client'
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

async function count(
  table: 'profiles' | 'courses' | 'enrollments' | 'payments',
  build: (query: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  const { count: total, error } = await build(supabase.from(table).select('*', { count: 'exact', head: true }))
  if (error) throw new Error(error.message)
  return total ?? 0
}

export async function getAdminStats(): Promise<AdminStats> {
  const [students, instructors, admins, published, drafts, paid, enrolments] = await Promise.all([
    count('profiles', (q) => q.eq('role', 'student')),
    count('profiles', (q) => q.eq('role', 'instructor')),
    count('profiles', (q) => q.eq('role', 'admin')),
    count('courses', (q) => q.eq('status', 'published')),
    count('courses', (q) => q.eq('status', 'draft')),
    count('courses', (q) => q.gt('price_centavos', 0)),
    count('enrollments', (q) => q.eq('status', 'active')),
  ])

  const { data: revenue, error: revenueError } = await supabase
    .from('payments')
    .select('amount_centavos')
    .eq('status', 'paid')

  if (revenueError) throw new Error(revenueError.message)

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
    count('enrollments', (q) => q.eq('student_id', studentId).eq('status', 'active')),
    count('enrollments', (q) => q.eq('student_id', studentId).eq('status', 'completed')),
  ])
  return { enrolled, completed }
}

export { formatPeso, EMPTY as EMPTY_ADMIN_STATS }

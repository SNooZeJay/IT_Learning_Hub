import { supabase } from './supabase/client'
import type { EnrollmentRow  } from '@/types'
import type { Course, Enrollment } from '@/types'
import { isPaid } from './course.service'

/**
 * Enrolment queries and the one write a student is allowed to make.
 *
 * Free courses enrol here. Paid courses cannot: the `enrollments` insert policy
 * requires `price_centavos = 0`, so a direct insert into a paid course is
 * rejected by the database rather than by anything in this file. Paid enrolment
 * happens in the PayMongo webhook, which is the only path that can create one.
 */

const ENROLLMENT_COLUMNS = 'id, course_id, student_id, status, enrolled_at, completed_at'

function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    courseId: row.course_id,
    studentId: row.student_id,
    status: row.status,
    enrolledAt: row.enrolled_at,
    completedAt: row.completed_at,
  }
}

/** Everything this student is enrolled in, with the course joined in. */
export async function listMyEnrollments(studentId: string): Promise<
  Array<Enrollment & { course: Course }>
> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      `id, course_id, student_id, status, enrolled_at, completed_at,
       course:courses (
         id, category_id, title, slug, description, thumbnail_url, status,
         level, duration_minutes, passing_score, price_centavos, created_by,
         published_at
       )`,
    )
    .eq('student_id', studentId)
    .order('enrolled_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? [])
    .filter((row) => row.course)
    .map((row) => ({
      ...toEnrollment(row as unknown as EnrollmentRow),
      course: row.course as unknown as Course,
    }))
}

export async function findEnrollment(
  courseId: string,
  studentId: string,
): Promise<Enrollment | null> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toEnrollment(data as EnrollmentRow) : null
}

/**
 * Self-enrol in a free course.
 *
 * Throws rather than returning a flag for the paid case, because the caller
 * needs to route to checkout rather than show an error. The database is still
 * the authority: this check is UX, and RLS is what actually prevents it.
 */
export async function enrollInFreeCourse(
  course: Pick<Course, 'id' | 'priceCentavos'>,
  studentId: string,
): Promise<Enrollment> {
  if (isPaid(course)) {
    throw new Error('This course is paid. Payment is required before enrolling.')
  }

  const { data, error } = await supabase
    .from('enrollments')
    .insert({ course_id: course.id, student_id: studentId, status: 'active' })
    .select(ENROLLMENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return toEnrollment(data as EnrollmentRow)
}

export async function dropEnrollment(enrollmentId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('enrollments')
    .update({ status: 'dropped' })
    .eq('id', enrollmentId)
    .eq('student_id', studentId)

  if (error) throw new Error(error.message)
}

/** A single lesson's progress for this student, resolved through their enrolment. */
export async function getLessonProgress(
  courseId: string,
  lessonId: string,
  studentId: string,
): Promise<{ percent: number; status: string } | null> {
  // Two steps rather than a nested select. The progress row has no student_id,
  // so ownership is resolved through the parent enrolment, and RLS on
  // enrolments is what makes that lookup safe.
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (enrollmentError) throw new Error(enrollmentError.message)
  if (!enrollment) return null

  const { data, error } = await supabase
    .from('lesson_progress')
    .select('status, progress_percent')
    .eq('enrollment_id', enrollment.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? { percent: Number(data.progress_percent), status: data.status } : null
}

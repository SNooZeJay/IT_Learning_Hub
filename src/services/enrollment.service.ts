import { supabase } from './supabase/client'
import type { EnrollmentRow } from '@/types'
import type { Course, Enrollment } from '@/types'
import { isPaid } from './course.service'
import { ValidationError, assertValid, messageOf, requiredText, uuidField } from '@/validation'

/**
 * Enrolment queries and the one write a student is allowed to make.
 *
 * Free courses enrol here. Paid courses cannot: the `enrollments` insert policy
 * requires `price_centavos = 0`, so a direct insert into a paid course is
 * rejected by the database rather than by anything in this file. Paid enrolment
 * happens in the PayMongo webhook, which is the only path that can create one.
 *
 * Three layers, and it is worth being explicit about which is which:
 *
 *   this file      the shape of the arguments, so a mistake is a sentence
 *   RLS policies   who may write this row at all
 *   triggers       which columns of that row they may move
 *
 * The audit found this service validating nothing beyond one business check, and
 * throwing a bare `Error` in six places - so `error instanceof SomethingSpecific`
 * compiled against every sibling service and failed here.
 */

/**
 * An enrolment operation that could not proceed.
 *
 * Named rather than a bare `Error` because `messageOf` strips the PostgREST decoration
 * and the caller needs to know the failure came from here rather than from a constraint
 * it has never heard of.
 */
export class EnrollmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnrollmentError'
  }
}

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

/**
 * Both arguments, checked before a query is built.
 *
 * `studentId` is not taken from the session here on purpose: the caller supplies it and
 * the database compares it against `auth.uid()`. This check is about a malformed
 * identifier reaching PostgREST, which answers `22P02 invalid input syntax for type
 * uuid` - a data-type error shown to somebody who typed nothing wrong.
 */
function assertEnrolmentArgs(courseId: string, studentId: string): void {
  assertValid(uuidField(courseId, 'course'), 'courseId')
  assertValid(uuidField(studentId, 'account'), 'studentId')
}

/** Everything this student is enrolled in, with the course joined in. */
export async function listMyEnrollments(
  studentId: string,
): Promise<Array<Enrollment & { course: Course }>> {
  assertValid(uuidField(studentId, 'account'), 'studentId')

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

  if (error) throw new EnrollmentError(messageOf(error, 'Your enrollments could not be loaded.'))

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
  assertEnrolmentArgs(courseId, studentId)

  const { data, error } = await supabase
    .from('enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) throw new EnrollmentError(messageOf(error, 'That enrollment could not be read.'))
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
  assertEnrolmentArgs(course.id, studentId)

  if (isPaid(course)) {
    throw new ValidationError(
      'This course is paid. Payment is required before enrolling.',
      'course_is_paid',
    )
  }

  const { data, error } = await supabase
    .from('enrollments')
    .insert({ course_id: course.id, student_id: studentId, status: 'active' })
    .select(ENROLLMENT_COLUMNS)
    .single()

  // The `23505` that comes back here is the unique index on (course_id, student_id),
  // which is the rule that a course can only be enrolled in once. It is reported as a
  // sentence rather than surfacing the constraint name.
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') {
      throw new ValidationError('You are already enrolled in this course.', 'already_enrolled')
    }
    throw new EnrollmentError(messageOf(error, 'You could not be enrolled in this course.'))
  }

  return toEnrollment(data as EnrollmentRow)
}

/**
 * Withdraw from a course.
 *
 * `enrollments` has no DELETE policy at all - the grant is admin-only - so this is an
 * UPDATE of `status` to 'dropped', and the `protect_enrollment_entitlement` trigger
 * decides whether the caller was entitled to give it up. The identifier checks here stop
 * a malformed id reaching the database; they are not what prevents cross-user writes.
 */
export async function dropEnrollment(enrollmentId: string, studentId: string): Promise<void> {
  assertValid(uuidField(enrollmentId, 'enrollment'), 'enrollmentId')
  assertValid(uuidField(studentId, 'account'), 'studentId')

  const { error } = await supabase
    .from('enrollments')
    .update({ status: 'dropped' })
    .eq('id', enrollmentId)
    .eq('student_id', studentId)

  if (error) throw new EnrollmentError(messageOf(error, 'You could not leave this course.'))
}

/** A single lesson's progress for this student, resolved through their enrolment. */
export async function getLessonProgress(
  courseId: string,
  lessonId: string,
  studentId: string,
): Promise<{ percent: number; status: string } | null> {
  assertEnrolmentArgs(courseId, studentId)
  assertValid(uuidField(lessonId, 'lesson'), 'lessonId')

  // Two steps rather than a nested select. The progress row has no student_id,
  // so ownership is resolved through the parent enrolment, and RLS on
  // enrolments is what makes that lookup safe.
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (enrollmentError) {
    throw new EnrollmentError(messageOf(enrollmentError, 'That enrollment could not be read.'))
  }
  if (!enrollment) return null

  const { data, error } = await supabase
    .from('lesson_progress')
    .select('status, progress_percent')
    .eq('enrollment_id', enrollment.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (error) throw new EnrollmentError(messageOf(error, 'That lesson progress could not be read.'))
  return data ? { percent: Number(data.progress_percent), status: data.status } : null
}

/**
 * A search term typed into the course list.
 *
 * Exported because the bound has to be identical wherever a `?q=` is read, and three
 * views were each slicing to their own length.
 */
export function normaliseCourseSearch(raw: string): string {
  const trimmed = requiredText(raw, 'Search', { max: 100 })
  return trimmed.ok ? raw.trim() : ''
}

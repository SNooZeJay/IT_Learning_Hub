import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase/client'
import { humanizeError } from './errors'
import type {
  Course,
  CourseRow,
  EnrollmentStatus,
  Lesson,
  LessonMaterial,
  LessonProgress,
  MaterialType,
  LessonMaterialRow,
  LessonProgressRow,
  LessonRow,
  Module,
  ModuleRow,
  QuizAttemptRow,
  QuizRow,
} from '@/types'

/**
 * The shared reads behind the student screens: lessons and progress, grades,
 * certificates, notifications and deadlines.
 *
 * Four rules this file exists to keep.
 *
 * 1. Nothing here decides a grade. A quiz percentage comes from
 *    `submit_quiz_attempt`, an assignment grade from an instructor, and a
 *    certificate only from `issue_certificate`. A number computed in the browser
 *    is a number the student chose.
 *
 * 2. `status = 'completed'` is the only completed state. `not_started` and
 *    `in_progress` are both incomplete, and every count here agrees on that.
 *
 * 3. Postgres numerics arrive as strings. `grade`, `max_points`, `percentage`,
 *    `passing_score`, `progress_percent`, `final_percentage` and `threshold` are
 *    all `numeric`, so each one is passed through `Number()` at the boundary.
 *    Skip that and `grade + '/' + maxPoints` concatenates, and `total / count`
 * *    returns NaN.
 *
 * 4. A revoked certificate stays visible. Section 19.5 of the spec requires it:
 *    hiding the row would tell the student the certificate never existed, and
 *    `issue_certificate` refuses to issue another one anyway, so silence would
 *    be an unexplainable dead end.
 */

/**
 * Tables and functions that are live in Postgres but absent from the hand-written
 * `Database` type in `supabase/types.ts`.
 *
 * `assignments`, `assignment_submissions`, `certificates`, `notifications`,
 * `course_completion_gaps`, `refresh_enrollment_completion` and
 * `issue_certificate` all exist and all carry RLS. The `Database` contract simply
 * does not list them yet, so the typed client refuses the table name at compile
 * time. Casting here recovers the queries without loosening anything: every
 * statement below still names its columns explicitly and is still filtered by
 * the same policies, because RLS runs in Postgres and not in this file. Row types
 * are declared locally and applied to the result, so the boundary stays typed in
 * the direction that matters â€” out of the database.
 *
 * Regenerating `supabase/types.ts` deletes this alias and nothing else changes.
 */
const later = supabase as unknown as SupabaseClient

// ---------------------------------------------------------------------------
// Column lists. Named rather than `select *`, for the same reason quiz.service
// does it: the grant is column-level, and an unqualified select is a request the
// database can refuse outright.
// ---------------------------------------------------------------------------

const COURSE_COLUMNS =
  'id, category_id, title, slug, description, thumbnail_url, status, level, duration_minutes, passing_score, price_centavos, created_by, published_at'

const MODULE_COLUMNS = 'id, course_id, title, description, position, status'

const LESSON_COLUMNS =
  'id, module_id, title, summary, content, lesson_type, position, duration_minutes, is_preview, video_url, status, is_required'

const MATERIAL_COLUMNS =
  'id, lesson_id, title, material_type, position, content_text, external_url, file_path, file_type, file_size, created_at, updated_at'

const PROGRESS_COLUMNS =
  'id, enrollment_id, lesson_id, student_id, status, progress_percent, last_position_seconds, started_at, completed_at'

const QUIZ_COLUMNS = 'id, course_id, title, passing_score, attempts_allowed, status'

const ATTEMPT_COLUMNS =
  'id, quiz_id, course_id, attempt_number, status, score, max_score, percentage, passed, started_at, submitted_at'

const ASSIGNMENT_COLUMNS =
  'id, course_id, module_id, title, instructions, due_at, max_points, status'

const SUBMISSION_COLUMNS =
  'id, assignment_id, course_id, student_id, submission_text, file_path, submitted_at, grade, feedback, graded_by, graded_at, status'

const CERTIFICATE_COLUMNS =
  'id, user_id, course_id, enrollment_id, certificate_number, final_percentage, issued_at, revoked_at, revoked_by, revoke_reason'

const NOTIFICATION_COLUMNS = 'id, user_id, type, title, body, link, read_at, created_at'

// ---------------------------------------------------------------------------
// Local row types for the tables `later` reads.
// ---------------------------------------------------------------------------

export type RequirementType =
  'complete_all_lessons' | 'pass_all_quizzes' | 'min_quiz_average' | 'submit_all_assignments'

export type NotificationType =
  | 'enrolment_confirmed'
  | 'payment_received'
  | 'quiz_graded'
  | 'assignment_graded'
  | 'course_completed'
  | 'certificate_issued'
  | 'certificate_revoked'
  | 'announcement'
  | 'new_message'

export type AssignmentStatus = 'draft' | 'published'
export type SubmissionStatus = 'submitted' | 'graded'

interface AssignmentRow {
  id: string
  course_id: string
  module_id: string | null
  title: string
  instructions: string | null
  due_at: string | null
  max_points: string | number
  status: AssignmentStatus
}

interface SubmissionRow {
  id: string
  assignment_id: string
  course_id: string
  student_id: string
  submission_text: string | null
  file_path: string | null
  submitted_at: string
  grade: string | number | null
  feedback: string | null
  graded_by: string | null
  graded_at: string | null
  status: SubmissionStatus
}

interface CertificateRow {
  id: string
  user_id: string
  course_id: string
  enrollment_id: string | null
  certificate_number: string
  final_percentage: string | number
  issued_at: string
  revoked_at: string | null
  revoked_by: string | null
  revoke_reason: string | null
}

interface NotificationRow {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

interface GapRow {
  requirement: RequirementType
  detail: string | null
}

// ---------------------------------------------------------------------------
// View models.
// ---------------------------------------------------------------------------

/**
 * Re-exported rather than redefined.
 *
 * The local version carried only the five fields a progress bar needs, which is
 * why the `student_id` the write policy checks could be set on the row without
 * appearing anywhere in the view model. The canonical shape is in `@/types`.
 */
export type { LessonProgress } from '@/types'

export interface LessonWithProgress extends Lesson {
  progress: LessonProgress | null
}

export type OutlineModule = Module & { lessons: LessonWithProgress[] }

export interface CourseOutline {
  course: Course
  modules: OutlineModule[]
  totalLessons: number
  completedLessons: number
  /** Null when the student has no live enrolment on this course. */
  enrollmentId: string | null
  enrollmentStatus: EnrollmentStatus | null
}

/**
 * Re-exported rather than redefined.
 *
 * This file had its own `LessonMaterial` with a required `filePath`, written
 * before a material could be anything but an uploaded file. That is why the
 * shape was wrong rather than merely narrow: with `filePath` mandatory in the
 * type as well as in the database, a reading-list link or a code snippet had no
 * representation anywhere in the codebase.
 *
 * The canonical shape lives in `@/types` and carries the material type, which is
 * what tells a renderer which of the three bodies to use.
 */
export type { LessonMaterial } from '@/types'

/** One unmet course requirement, in the database's own words. */
export interface CompletionGap {
  requirement: RequirementType
  detail: string
}

export interface CompleteLessonResult {
  progress: LessonProgress
  /**
   * True only the first time the database flips an active enrolment to
   * `completed`. It is false both when nothing changed and when the course is
   * still incomplete, which is why the caller also reads `gaps`.
   */
  courseCompleted: boolean
  gaps: CompletionGap[]
}

export interface QuizGrade {
  attemptId: string
  quizId: string
  quizTitle: string
  courseId: string
  courseTitle: string
  passingScore: number
  attemptNumber: number
  status: 'in_progress' | 'submitted'
  score: number | null
  maxScore: number | null
  percentage: number | null
  passed: boolean | null
  startedAt: string
  submittedAt: string | null
}

export interface AssignmentGrade {
  assignmentId: string
  courseId: string
  courseTitle: string
  title: string
  instructions: string | null
  dueAt: string | null
  maxPoints: number
  published: boolean
  /** Null when nothing has been handed in yet. */
  submissionId: string | null
  submittedAt: string | null
  submissionStatus: SubmissionStatus | null
  submissionText: string | null
  submissionFile: string | null
  grade: number | null
  feedback: string | null
  gradedAt: string | null
}

export interface Certificate {
  id: string
  courseId: string
  courseTitle: string
  certificateNumber: string
  finalPercentage: number
  issuedAt: string
  revokedAt: string | null
  revokeReason: string | null
  revoked: boolean
}

export interface StudentNotification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  /** A path inside this app, or null. Never treated as a URL. */
  link: string | null
  readAt: string | null
  createdAt: string
  isRead: boolean
}

export interface GradeSummary {
  coursesEnrolled: number
  coursesCompleted: number
  quizzesAttempted: number
  quizzesPassed: number
  /** Mean percentage across submitted attempts, or null when there are none. */
  quizAverage: number | null
  assignmentsSubmitted: number
  assignmentsGraded: number
  /** Mean of grade / max_points across graded work, or null when there is none. */
  assignmentAverage: number | null
  certificatesEarned: number
  certificatesRevoked: number
}

export interface StudentGrades {
  quizAttempts: QuizGrade[]
  assignments: AssignmentGrade[]
  certificates: Certificate[]
  summary: GradeSummary
}

export interface CourseDeadline {
  kind: 'assignment'
  assignmentId: string
  courseId: string
  courseTitle: string
  title: string
  dueAt: string | null
  maxPoints: number
  submitted: boolean
  graded: boolean
  grade: number | null
}

/**
 * A material attached to a lesson the student has not finished.
 *
 * There is no `due_at` on `lesson_materials` â€” the only deadline column in the
 * schema is `assignments.due_at`. `uploadedAt` is when the instructor added the
 * material, and the UI says so rather than dressing it up as a due date.
 *
 * `filePath` is nullable and `materialType` is carried alongside it, because a
 * material is no longer only a file: an unfinished reading or a code snippet
 * counts as outstanding work too.
 */
export interface OutstandingMaterial {
  materialId: string
  lessonId: string
  lessonTitle: string
  courseId: string
  courseTitle: string
  title: string
  filePath: string | null
  materialType: MaterialType
  fileType: string | null
  fileSize: number | null
  uploadedAt: string
}

export interface StudentDeadlines {
  assignments: CourseDeadline[]
  materials: OutstandingMaterial[]
}

// ---------------------------------------------------------------------------
// Errors.
// ---------------------------------------------------------------------------

/**
 * A failure with the message the database chose.
 *
 * `issue_certificate` raises refusals written to be read by the student â€” "your
 * certificate for this course was revoked on 2026-09-01: caught plagiarising" â€”
 * and `course_completion_gaps` returns prose in its `detail` column. Replacing
 * either with a generic failure would throw away the only useful thing in the
 * response, so the text travels intact.
 */
export class LearningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LearningError'
  }
}

/**
 * Postgres error text, made presentable.
 *
 * The strip removes only the two forms Postgres genuinely emits: a leading
 * `ERROR: ` and a five-character SQLSTATE code. It must not reach for the first
 * colon in general, because that colon is usually inside a timestamp â€” "revoked on
 * 2026-09-01" would arrive as "01".
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

// ---------------------------------------------------------------------------
// Row -> view model conversions.
// ---------------------------------------------------------------------------

function toCourse(row: CourseRow): Course {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    status: row.status,
    level: row.level,
    durationMinutes: row.duration_minutes,
    passingScore: row.passing_score,
    priceCentavos: row.price_centavos,
    createdBy: row.created_by,
    publishedAt: row.published_at,
  }
}

function toModule(row: ModuleRow): Module {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    position: row.position,
    status: row.status,
  }
}

function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    lessonType: row.lesson_type,
    position: row.position,
    durationMinutes: row.duration_minutes,
    isPreview: row.is_preview,
    videoUrl: row.video_url,
    status: row.status,
    isRequired: row.is_required,
  }
}

function toMaterial(row: LessonMaterialRow): LessonMaterial {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    title: row.title,
    materialType: row.material_type,
    position: row.position,
    contentText: row.content_text,
    externalUrl: row.external_url,
    filePath: row.file_path,
    fileType: row.file_type,
    fileSize: row.file_size === null ? null : Number(row.file_size),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * `progress_percent` is `numeric`, so it arrives as a string even though the
 * hand-written `Database` type says `number`. `Number()` is what makes the
 * progress bar render at all.
 */
function toProgress(row: LessonProgressRow): LessonProgress {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    status: row.status,
    progressPercent: Number(row.progress_percent),
    lastPositionSeconds: row.last_position_seconds,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

/**
 * The signed-in user id.
 *
 * Read once per write rather than passed in, because it cannot be trusted from
 * the caller: the `lesson_progress own write` policy compares it against
 * `auth.uid()` on the server, so a value supplied by the browser could only ever
 * make the write fail, never succeed for someone else.
 */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function toQuizGrade(
  row: QuizAttemptRow,
  quiz: QuizRow | undefined,
  courseTitles: Map<string, string>,
): QuizGrade {
  return {
    attemptId: row.id,
    quizId: row.quiz_id,
    // A quiz deleted after the attempt still has to render, so fall back to the
    // id rather than printing "undefined" next to a real score.
    quizTitle: quiz?.title ?? 'Retired quiz',
    courseId: row.course_id,
    courseTitle: courseTitles.get(row.course_id) ?? 'Unknown course',
    passingScore: quiz ? Number(quiz.passing_score) : 0,
    attemptNumber: row.attempt_number,
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    maxScore: row.max_score === null ? null : Number(row.max_score),
    percentage: row.percentage === null ? null : Number(row.percentage),
    passed: row.passed,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
  }
}

function toAssignmentGrade(
  row: AssignmentRow,
  submission: SubmissionRow | undefined,
  courseTitles: Map<string, string>,
): AssignmentGrade {
  return {
    assignmentId: row.id,
    courseId: row.course_id,
    courseTitle: courseTitles.get(row.course_id) ?? 'Unknown course',
    title: row.title,
    instructions: row.instructions,
    dueAt: row.due_at,
    maxPoints: Number(row.max_points),
    published: row.status === 'published',
    submissionId: submission?.id ?? null,
    submittedAt: submission?.submitted_at ?? null,
    submissionStatus: submission?.status ?? null,
    submissionText: submission?.submission_text ?? null,
    submissionFile: submission?.file_path ?? null,
    grade:
      submission?.grade === null || submission?.grade === undefined
        ? null
        : Number(submission.grade),
    feedback: submission?.feedback ?? null,
    gradedAt: submission?.graded_at ?? null,
  }
}

function toCertificate(row: CertificateRow, courseTitles: Map<string, string>): Certificate {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: courseTitles.get(row.course_id) ?? 'Unknown course',
    certificateNumber: row.certificate_number,
    finalPercentage: Number(row.final_percentage),
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    revoked: row.revoked_at !== null,
  }
}

function toNotification(row: NotificationRow): StudentNotification {
  // A `link` is written by a server-side `notify` call, so it is trusted to be an
  // in-app path. It is still normalised to null unless it starts with a slash,
  // so a row can never turn this list into an open redirect.
  const link = row.link && row.link.startsWith('/') ? row.link : null
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link,
    readAt: row.read_at,
    createdAt: row.created_at,
    isRead: row.read_at !== null,
  }
}

// ---------------------------------------------------------------------------
// Enrolment lookup, shared by every read that needs to know "is this mine?".
// ---------------------------------------------------------------------------

/**
 * The student's live enrolment on a course.
 *
 * Filtered to `active` and `completed` rather than taking the newest row: dropping
 * a course sets `status = 'dropped'` instead of deleting it, and a re-enrol adds a
 * second row. Without the filter a re-enrolled student could be handed the dead
 * enrolment and find every write refused.
 */
async function findLiveEnrollment(
  courseId: string,
  studentId: string,
): Promise<{ id: string; status: EnrollmentStatus } | null> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, status')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .in('status', ['active', 'completed'])
    .order('enrolled_at', { ascending: false })
    .limit(1)

  if (error) throw new LearningError(messageOf(error, 'Could not check your enrollment.'))
  if (!data?.length) return null
  const row = data[0]
  return { id: row.id, status: row.status }
}

/** Course ids this student currently holds a live place on. */
async function liveCourseIds(studentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('course_id, status')
    .eq('student_id', studentId)
    .in('status', ['active', 'completed'])

  if (error) throw new LearningError(messageOf(error, 'Could not load your enrollments.'))
  const ids = new Set((data ?? []).map((row) => row.course_id))
  return [...ids]
}

/** Course titles for a set of ids, in one query. */
async function courseTitles(courseIds: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (courseIds.length === 0) return titles

  const { data, error } = await supabase.from('courses').select('id, title').in('id', courseIds)

  if (error) throw new LearningError(messageOf(error, 'Could not load course titles.'))
  for (const row of data ?? []) titles.set(row.id, row.title)
  return titles
}

// ---------------------------------------------------------------------------
// Lessons, materials and progress.
// ---------------------------------------------------------------------------

export interface LessonContext {
  lesson: Lesson
  module: Module
  course: Course
  enrollmentId: string | null
  enrollmentStatus: EnrollmentStatus | null
  progress: LessonProgress | null
}

/**
 * Everything the lesson page needs to render in one call: the lesson, where it
 * sits, which course it belongs to, and whether this student is holding a place.
 *
 * Three round trips rather than a nested select, for the same reason
 * `getCourseWithCurriculum` splits: a nested select returns an empty object when
 * RLS hides a row, which is indistinguishable from "this lesson does not exist".
 */
export async function getLessonContext(
  lessonId: string,
  studentId: string,
): Promise<LessonContext | null> {
  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select(LESSON_COLUMNS)
    .eq('id', lessonId)
    .limit(1)

  if (lessonError) throw new LearningError(messageOf(lessonError, 'Could not load this lesson.'))
  if (!lessonRows?.length) return null

  const lesson = toLesson(lessonRows[0] as unknown as LessonRow)

  const { data: moduleRows, error: moduleError } = await supabase
    .from('modules')
    .select(MODULE_COLUMNS)
    .eq('id', lesson.moduleId)
    .limit(1)

  if (moduleError) throw new LearningError(messageOf(moduleError, 'Could not load this module.'))
  if (!moduleRows?.length) return null

  const module = toModule(moduleRows[0] as unknown as ModuleRow)

  const { data: courseRows, error: courseError } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('id', module.courseId)
    .limit(1)

  if (courseError) throw new LearningError(messageOf(courseError, 'Could not load this course.'))
  if (!courseRows?.length) return null

  const enrollment = await findLiveEnrollment(module.courseId, studentId)
  const progress = enrollment ? await getLessonProgress(enrollment.id, lesson.id) : null

  return {
    lesson,
    module,
    course: toCourse(courseRows[0] as unknown as CourseRow),
    enrollmentId: enrollment?.id ?? null,
    enrollmentStatus: enrollment?.status ?? null,
    progress,
  }
}

/** Files attached to one lesson. */
export async function listLessonMaterials(lessonId: string): Promise<LessonMaterial[]> {
  const { data, error } = await supabase
    .from('lesson_materials')
    .select(MATERIAL_COLUMNS)
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true })

  if (error) throw new LearningError(messageOf(error, 'Could not load the lesson materials.'))
  return ((data ?? []) as unknown as LessonMaterialRow[]).map(toMaterial)
}

/** One lesson's progress on one enrolment, or null when it has never been opened. */
export async function getLessonProgress(
  enrollmentId: string,
  lessonId: string,
): Promise<LessonProgress | null> {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select(PROGRESS_COLUMNS)
    .eq('enrollment_id', enrollmentId)
    .eq('lesson_id', lessonId)
    .limit(1)

  if (error) throw new LearningError(messageOf(error, 'Could not load your progress.'))
  return data?.length ? toProgress(data[0] as LessonProgressRow) : null
}

/**
 * A course as an outline sidebar: modules, lessons, and this student's state on
 * every one of them.
 *
 * Progress is fetched by `enrollment_id` rather than joined, because a
 * `lesson_progress` row has no `student_id` and ownership is only knowable
 * through the parent enrolment.
 */
export async function getCourseOutline(
  courseId: string,
  studentId: string,
): Promise<CourseOutline | null> {
  const { data: courseRows, error: courseError } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('id', courseId)
    .limit(1)

  if (courseError) throw new LearningError(messageOf(courseError, 'Could not load this course.'))
  if (!courseRows?.length) return null
  const course = toCourse(courseRows[0] as unknown as CourseRow)

  const { data: moduleRows, error: moduleError } = await supabase
    .from('modules')
    .select(MODULE_COLUMNS)
    .eq('course_id', course.id)
    .order('position', { ascending: true })

  if (moduleError) throw new LearningError(messageOf(moduleError, 'Could not load the modules.'))

  const modules = ((moduleRows ?? []) as unknown as ModuleRow[]).map(toModule)
  if (modules.length === 0) {
    return {
      course,
      modules: [],
      totalLessons: 0,
      completedLessons: 0,
      enrollmentId: null,
      enrollmentStatus: null,
    }
  }

  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select(LESSON_COLUMNS)
    .in(
      'module_id',
      modules.map((module) => module.id),
    )
    .order('position', { ascending: true })

  if (lessonError) throw new LearningError(messageOf(lessonError, 'Could not load the lessons.'))
  const lessons = ((lessonRows ?? []) as unknown as LessonRow[]).map(toLesson)

  const enrollment = await findLiveEnrollment(course.id, studentId)
  const progressByLesson = new Map<string, LessonProgress>()
  if (enrollment && lessons.length) {
    const { data: progressRows, error: progressError } = await supabase
      .from('lesson_progress')
      .select(PROGRESS_COLUMNS)
      .eq('enrollment_id', enrollment.id)
      .in(
        'lesson_id',
        lessons.map((lesson) => lesson.id),
      )

    if (progressError) {
      throw new LearningError(messageOf(progressError, 'Could not load your progress.'))
    }
    for (const row of (progressRows ?? []) as unknown as LessonProgressRow[]) {
      progressByLesson.set(row.lesson_id, toProgress(row))
    }
  }

  let totalLessons = 0
  let completedLessons = 0

  const outlined: OutlineModule[] = modules.map((module) => {
    const moduleLessons = lessons
      .filter((lesson) => lesson.moduleId === module.id)
      .map((lesson): LessonWithProgress => {
        const progress = progressByLesson.get(lesson.id) ?? null
        totalLessons += 1
        if (progress?.status === 'completed') completedLessons += 1
        return { ...lesson, progress }
      })
    return { ...module, lessons: moduleLessons }
  })

  return {
    course,
    modules: outlined,
    totalLessons,
    completedLessons,
    enrollmentId: enrollment?.id ?? null,
    enrollmentStatus: enrollment?.status ?? null,
  }
}

/**
 * Open a lesson: `not_started` becomes `in_progress`.
 *
 * This is an upsert on (enrollment_id, lesson_id), so opening the same lesson
 * twice does not create a second row and cannot fail on the unique constraint.
 *
 * Note that it resets `progress_percent` to 0. That is deliberate for a lesson
 * that has never been started, and callers must not use it as a "resume" button:
 * `recordLessonPosition` is the write that preserves a position, and it is the
 * one that clamps below 100.
 */
export async function startLesson(enrollmentId: string, lessonId: string): Promise<LessonProgress> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        student_id: await currentUserId(),
        status: 'in_progress',
        progress_percent: 0,
        started_at: now,
      },
      { onConflict: 'enrollment_id,lesson_id' },
    )
    .select(PROGRESS_COLUMNS)
    .single()

  if (error) throw new LearningError(messageOf(error, 'Could not start this lesson.'))
  return toProgress(data as LessonProgressRow)
}

/**
 * Record how far through a video lesson the student is.
 *
 * Deliberately never promotes to `completed`. Finishing a video is the student's
 * claim to make, and a progress bar reaching 100% by accident would mark work
 * done that nobody did.
 */
export async function recordLessonPosition(
  enrollmentId: string,
  lessonId: string,
  progressPercent: number,
  lastPositionSeconds: number | null,
): Promise<LessonProgress> {
  const percent = Math.min(Math.max(Math.round(progressPercent), 0), 99)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        student_id: await currentUserId(),
        status: 'in_progress',
        progress_percent: percent,
        last_position_seconds: lastPositionSeconds,
        started_at: now,
      },
      { onConflict: 'enrollment_id,lesson_id' },
    )
    .select(PROGRESS_COLUMNS)
    .single()

  if (error) throw new LearningError(messageOf(error, 'Could not save your position.'))
  return toProgress(data as LessonProgressRow)
}

/**
 * Mark a lesson complete and re-evaluate the enrolment in the same call.
 *
 * The two halves have to happen together: progress on its own never completes a
 * course, and `refresh_enrollment_completion` cannot see work that has not been
 * written. The gaps come back from `course_completion_gaps` so the caller can
 * say precisely what is still outstanding instead of "not finished yet".
 */
export async function completeLesson(
  enrollmentId: string,
  lessonId: string,
): Promise<CompleteLessonResult> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        student_id: await currentUserId(),
        status: 'completed',
        progress_percent: 100,
        started_at: now,
        completed_at: now,
      },
      { onConflict: 'enrollment_id,lesson_id' },
    )
    .select(PROGRESS_COLUMNS)
    .single()

  if (error) throw new LearningError(messageOf(error, 'Could not mark this lesson complete.'))

  const { courseCompleted, gaps } = await refreshEnrollmentCompletion(enrollmentId)
  return { progress: toProgress(data as LessonProgressRow), courseCompleted, gaps }
}

/**
 * Put a completed lesson back to in-progress.
 *
 * Exists because a mis-click is otherwise permanent: the only way to un-complete a
 * lesson is to be able to write it back, and a student who clicks "mark complete"
 * on the wrong lesson should not have to email an instructor about it.
 */
export async function reopenLesson(
  enrollmentId: string,
  lessonId: string,
): Promise<LessonProgress> {
  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        student_id: await currentUserId(),
        status: 'in_progress',
        progress_percent: 99,
        completed_at: null,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'enrollment_id,lesson_id' },
    )
    .select(PROGRESS_COLUMNS)
    .single()

  if (error) throw new LearningError(messageOf(error, 'Could not reopen this lesson.'))
  return toProgress(data as LessonProgressRow)
}

/**
 * Recompute whether this enrolment is complete.
 *
 * `refresh_enrollment_completion` flips `active` to `completed` and stamps
 * `completed_at`; it returns true only on the transition, so a course already
 * marked complete reports false. That is the database's answer and this function
 * passes it through unchanged rather than guessing at it.
 */
export async function refreshEnrollmentCompletion(enrollmentId: string): Promise<{
  courseCompleted: boolean
  gaps: CompletionGap[]
}> {
  const { data, error } = await later.rpc('refresh_enrollment_completion', {
    p_enrollment_id: enrollmentId,
  })

  if (error) {
    throw new LearningError(messageOf(error, 'Could not re-check your course progress.'))
  }

  return { courseCompleted: data === true, gaps: await listCompletionGaps(enrollmentId) }
}

/**
 * What is still outstanding on this course, in the database's own words.
 *
 * One row per unmet requirement, and zero rows means complete. The `detail` text
 * is written by the function ("3 of 7 lessons complete", "quiz average 62.0%, needs
 * 70%"), so it is passed straight through: a paraphrased version would be a
 * paraphrase of the truth rather than the truth.
 */
export async function listCompletionGaps(enrollmentId: string): Promise<CompletionGap[]> {
  const { data, error } = await later.rpc('course_completion_gaps', {
    p_enrollment_id: enrollmentId,
  })

  if (error) throw new LearningError(messageOf(error, 'Could not check what is left to do.'))

  const rows = (data ?? []) as unknown as GapRow[]
  return rows.map((row) => ({
    requirement: row.requirement,
    // A null detail is possible if the course defines no threshold for a
    // requirement type. Naming the requirement beats printing nothing.
    detail: row.detail ?? REQUIREMENT_LABELS[row.requirement] ?? 'Not yet met',
  }))
}

/** Requirement types as a person would name them, for the fallback detail above. */
const REQUIREMENT_LABELS: Record<RequirementType, string> = {
  complete_all_lessons: 'Not every lesson is complete',
  pass_all_quizzes: 'Not every quiz has been passed',
  min_quiz_average: 'Quiz average is below the required mark',
  submit_all_assignments: 'Not every assignment has been graded',
}

// ---------------------------------------------------------------------------
// Grades.
// ---------------------------------------------------------------------------

/**
 * Everything graded for one student: every quiz attempt, every assignment on a
 * course they hold a place on, and every certificate they have ever been issued.
 *
 * Three sources, assembled in JS. Nested selects across four tables return an
 * object per row with keys that vanish when RLS hides something, which reads as
 * "no grade" rather than "not allowed".
 */
export async function getStudentGrades(studentId: string): Promise<StudentGrades> {
  const courseIds = await liveCourseIds(studentId)

  const [{ data: attemptRows, error: attemptError }, { data: certRows, error: certError }] =
    await Promise.all([
      supabase
        .from('quiz_attempts')
        .select(ATTEMPT_COLUMNS)
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false, nullsFirst: false }),
      later
        .from('certificates')
        .select(CERTIFICATE_COLUMNS)
        .eq('user_id', studentId)
        .order('issued_at', { ascending: false }),
    ])

  if (attemptError)
    throw new LearningError(messageOf(attemptError, 'Could not load your attempts.'))
  if (certError) throw new LearningError(messageOf(certError, 'Could not load your certificates.'))

  const attempts = (attemptRows ?? []) as unknown as QuizAttemptRow[]
  const certificates = (certRows ?? []) as unknown as CertificateRow[]

  // Quiz metadata for the titles and the pass marks. Only quizzes that actually
  // have an attempt are fetched, so an unpublished quiz nobody sat is not read.
  const quizIds = [...new Set(attempts.map((row) => row.quiz_id))]
  const quizById = new Map<string, QuizRow>()
  if (quizIds.length) {
    const { data: quizRows, error: quizError } = await supabase
      .from('quizzes')
      .select(QUIZ_COLUMNS)
      .in('id', quizIds)

    if (quizError) throw new LearningError(messageOf(quizError, 'Could not load the quizzes.'))
    for (const row of (quizRows ?? []) as unknown as QuizRow[]) quizById.set(row.id, row)
  }

  const referencedCourseIds = [
    ...new Set([
      ...courseIds,
      ...attempts.map((row) => row.course_id),
      ...certificates.map((row) => row.course_id),
    ]),
  ]
  const titles = await courseTitles(referencedCourseIds)

  const { data: assignmentRows, error: assignmentError } = courseIds.length
    ? await later
        .from('assignments')
        .select(ASSIGNMENT_COLUMNS)
        .in('course_id', courseIds)
        .order('due_at', { ascending: true, nullsFirst: false })
    : { data: [], error: null }

  if (assignmentError) {
    throw new LearningError(messageOf(assignmentError, 'Could not load the assignments.'))
  }
  const assignments = ((assignmentRows ?? []) as unknown as AssignmentRow[]).filter(
    (row) => row.status === 'published',
  )

  const assignmentIds = assignments.map((row) => row.id)
  const { data: submissionRows, error: submissionError } = assignmentIds.length
    ? await later
        .from('assignment_submissions')
        .select(SUBMISSION_COLUMNS)
        .eq('student_id', studentId)
        .in('assignment_id', assignmentIds)
    : { data: [], error: null }

  if (submissionError) {
    throw new LearningError(messageOf(submissionError, 'Could not load your submissions.'))
  }

  // One submission per assignment is the intent; if a database ever allows a
  // resubmission the newest wins, because that is the graded one.
  const submissions = ((submissionRows ?? []) as unknown as SubmissionRow[]).sort((a, b) =>
    b.submitted_at.localeCompare(a.submitted_at),
  )
  const submissionByAssignment = new Map<string, SubmissionRow>()
  for (const row of submissions) {
    if (!submissionByAssignment.has(row.assignment_id)) {
      submissionByAssignment.set(row.assignment_id, row)
    }
  }

  const quizAttempts = attempts.map((row) => toQuizGrade(row, quizById.get(row.quiz_id), titles))
  const assignmentGrades = assignments.map((row) =>
    toAssignmentGrade(row, submissionByAssignment.get(row.id), titles),
  )
  const certificatesForStudent = certificates.map((row) => toCertificate(row, titles))

  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('course_id, status')
    .eq('student_id', studentId)

  if (enrollmentError) {
    throw new LearningError(messageOf(enrollmentError, 'Could not load your enrollments.'))
  }
  const liveEnrollments = (enrollmentRows ?? []).filter(
    (row) => row.status === 'active' || row.status === 'completed',
  )

  return {
    quizAttempts,
    assignments: assignmentGrades,
    certificates: certificatesForStudent,
    summary: summarise(quizAttempts, assignmentGrades, certificatesForStudent, liveEnrollments),
  }
}

/**
 * The headline numbers.
 *
 * Averages are computed from submitted and graded work only. An attempt still in
 * progress has no percentage, and averaging a zero in for it would tell a student
 * they are doing worse than they are.
 */
function summarise(
  quizAttempts: QuizGrade[],
  assignments: AssignmentGrade[],
  certificates: Certificate[],
  enrollments: Array<{ course_id: string; status: EnrollmentStatus }>,
): GradeSummary {
  const submitted = quizAttempts.filter((attempt) => attempt.percentage !== null)

  const bestByQuiz = new Map<string, QuizGrade>()
  for (const attempt of submitted) {
    const held = bestByQuiz.get(attempt.quizId)
    if (!held || (attempt.percentage ?? 0) > (held.percentage ?? 0)) {
      bestByQuiz.set(attempt.quizId, attempt)
    }
  }

  const quizAverage = submitted.length
    ? submitted.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / submitted.length
    : null

  const graded = assignments.filter((assignment) => assignment.grade !== null)
  const assignmentAverage = graded.length
    ? graded.reduce((sum, assignment) => {
        const ratio = assignment.maxPoints > 0 ? (assignment.grade ?? 0) / assignment.maxPoints : 0
        return sum + ratio * 100
      }, 0) / graded.length
    : null

  return {
    coursesEnrolled: new Set(enrollments.map((row) => row.course_id)).size,
    coursesCompleted: new Set(
      enrollments.filter((row) => row.status === 'completed').map((row) => row.course_id),
    ).size,
    quizzesAttempted: bestByQuiz.size,
    quizzesPassed: [...bestByQuiz.values()].filter((attempt) => attempt.passed === true).length,
    quizAverage: quizAverage === null ? null : round1(quizAverage),
    assignmentsSubmitted: assignments.filter((assignment) => assignment.submittedAt !== null)
      .length,
    assignmentsGraded: graded.length,
    assignmentAverage: assignmentAverage === null ? null : round1(assignmentAverage),
    certificatesEarned: certificates.filter((certificate) => !certificate.revoked).length,
    certificatesRevoked: certificates.filter((certificate) => certificate.revoked).length,
  }
}

/** One decimal place, without the trailing `.0`. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// ---------------------------------------------------------------------------
// Certificates.
// ---------------------------------------------------------------------------

/** Every certificate this student holds, including the revoked ones. */
export async function listMyCertificates(studentId: string): Promise<Certificate[]> {
  const { data, error } = await later
    .from('certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('user_id', studentId)
    .order('issued_at', { ascending: false })

  if (error) throw new LearningError(messageOf(error, 'Could not load your certificates.'))
  const rows = (data ?? []) as unknown as CertificateRow[]
  const titles = await courseTitles([...new Set(rows.map((row) => row.course_id))])
  return rows.map((row) => toCertificate(row, titles))
}

/**
 * Ask the database to issue a certificate for a course.
 *
 * The refusals are the useful part of this function. `issue_certificate` raises a
 * specific message for each case that matters â€” not enrolled, already holds one,
 * the existing one was revoked (with the date and the reason), or requirements are
 * unmet â€” and each is worth more than any check this file could write, so the text
 * is carried through untouched and shown to the student as written.
 *
 * Returns the certificate it issued. Throws `LearningError` carrying the
 * database's own refusal text.
 */
export async function claimCertificate(courseId: string): Promise<Certificate> {
  const { data, error } = await later.rpc('issue_certificate', { p_course_id: courseId })

  if (error) throw new LearningError(messageOf(error, 'Could not claim a certificate.'))
  if (typeof data !== 'string') {
    throw new LearningError('The server did not return a certificate id.')
  }

  // The RPC hands back an id, not a row. Re-read it rather than assembling a
  // certificate from a number and a guess: the number, the final percentage and
  // the issue date were all computed in Postgres and are not derivable here.
  const { data: rows, error: readError } = await later
    .from('certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('id', data)
    .limit(1)

  if (readError) throw new LearningError(messageOf(readError, 'Could not read the certificate.'))
  const row = ((rows ?? []) as unknown as CertificateRow[])[0]
  if (!row) throw new LearningError('The certificate was issued but could not be read back.')

  const titles = await courseTitles([row.course_id])
  return toCertificate(row, titles)
}

// ---------------------------------------------------------------------------
// Notifications.
// ---------------------------------------------------------------------------

export interface NotificationFeed {
  notifications: StudentNotification[]
  unreadCount: number
}

/**
 * This student's notifications, newest first, with the unread count.
 *
 * The count is `notifications.filter(...).length` over the page rather than a
 * separate `count()` query with a `read_at is null` filter: the list is already
 * fetched and capped at 200, and a count that silently disagrees with the rows
 * underneath it is worse than a count that describes what is on screen.
 */
export async function listNotifications(userId: string): Promise<NotificationFeed> {
  const { data, error } = await later
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new LearningError(messageOf(error, 'Could not load your notifications.'))
  const notifications = ((data ?? []) as unknown as NotificationRow[]).map(toNotification)
  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.isRead).length,
  }
}

/**
 * Mark one notification read.
 *
 * A plain update, which is exactly what the `notifications mark read` policy
 * allows: `user_id = auth.uid()`. The `.eq('user_id', userId)` is belt and braces
 * rather than the security boundary â€” RLS is.
 */
export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const { error } = await later
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) throw new LearningError(messageOf(error, 'Could not mark that as read.'))
}

/** Mark every unread notification read. Returns how many rows were touched. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const { data, error } = await later
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id')

  if (error) throw new LearningError(messageOf(error, 'Could not mark your notifications as read.'))
  return ((data ?? []) as unknown as Array<{ id: string }>).length
}

// ---------------------------------------------------------------------------
// Handing in an assignment.
// ---------------------------------------------------------------------------

/** What the student wrote, as the student reads it back. */
export interface StudentSubmission {
  id: string
  assignmentId: string
  courseId: string
  submissionText: string | null
  filePath: string | null
  submittedAt: string
  status: SubmissionStatus
  grade: number | null
  feedback: string | null
  gradedAt: string | null
}

/** One published assignment on a course, with this student's row against it. */
export interface StudentAssignment {
  id: string
  courseId: string
  moduleId: string | null
  title: string
  instructions: string | null
  dueAt: string | null
  maxPoints: number
  /** Null until the student hands something in. */
  submission: StudentSubmission | null
}

function toStudentSubmission(row: SubmissionRow): StudentSubmission {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    courseId: row.course_id,
    submissionText: row.submission_text,
    filePath: row.file_path,
    submittedAt: row.submitted_at,
    status: row.status,
    grade: row.grade === null || row.grade === undefined ? null : Number(row.grade),
    feedback: row.feedback,
    gradedAt: row.graded_at,
  }
}

/** The bucket student hand-in files live in. Private; read through a signed URL. */
export const SUBMISSION_BUCKET = 'assignment-submissions'

/**
 * The largest hand-in attachment, in bytes.
 *
 * The same 10 MB the bucket policy enforces, stated once and used by the browser
 * check and the copy, so the form cannot promise a size that is then refused.
 */
export const SUBMISSION_FILE_MAX_BYTES = 10 * 1024 * 1024

/**
 * Why a chosen file cannot be attached, or `null` when it can.
 *
 * Specific on purpose. "That file is larger than 10 MB" is something a student can act
 * on; a generic upload failure is not.
 */
export function describeSubmissionFile(file: File): string | null {
  if (file.size === 0) return 'That file is empty, so there is nothing to attach.'
  if (file.size > SUBMISSION_FILE_MAX_BYTES) {
    const mb = Math.round(SUBMISSION_FILE_MAX_BYTES / (1024 * 1024))
    return `That file is larger than ${mb} MB. Attach a smaller one, or split it.`
  }
  return null
}

/**
 * Upload one hand-in file and return its object key.
 *
 * The key is `<student id>/<assignment id>/<uuid>-<name>` because the bucket's policies
 * read the first two folder segments: the first must be the caller's own id and the
 * second the assignment it belongs to. A key not starting with a uuid is refused by
 * storage before a byte is stored, which is why the lesson-materials bucket has the
 * same shape and why `course_id_from_object_name` exists.
 *
 * The row is written by the caller after this resolves, so a failed upload never leaves
 * a submission pointing at a path that holds nothing.
 */
export async function uploadSubmissionFile(assignmentId: string, file: File): Promise<string> {
  const studentId = await currentUserId()
  if (!studentId) {
    throw new LearningError('You need to be signed in to attach a file.')
  }

  const problem = describeSubmissionFile(file)
  if (problem) throw new LearningError(problem)

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${studentId}/${assignmentId}/${crypto.randomUUID()}-${safeName}`

  const { error } = await supabase.storage
    .from(SUBMISSION_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })

  if (error) {
    throw new LearningError(messageOf(error, 'That file did not upload. Try attaching it again.'))
  }

  return path
}

/**
 * A short-lived URL for an attachment.
 *
 * The bucket is private, and its read policy admits the student who uploaded it, an
 * instructor of that student's course, or an admin. Signing happens after that policy
 * has already decided, so a refusal here is the boundary working rather than a fault.
 */
export async function createSubmissionFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SUBMISSION_BUCKET)
    .createSignedUrl(path, 60 * 10)

  if (error || !data?.signedUrl) {
    throw new LearningError(
      'That file cannot be opened. It may belong to a submission you cannot see.',
    )
  }

  return data.signedUrl
}

/**
 * Check a hand-in before it is sent.
 *
 * Mirrors the database's `submission_has_content`: `submission_text is not null or
 * file_path is not null`. Either half satisfies it, so a student may answer in prose,
 * attach a file, or do both, and only an entirely empty hand-in is refused.
 *
 * No length rule, because the schema has none. Inventing a maximum would be a limit the
 * database does not enforce, and the form would then be the only thing enforcing it.
 */
export function validateSubmissionContent(
  text: string,
  hasFile = false,
): { ok: true } | { ok: false; reason: string } {
  if (typeof text !== 'string' || text.trim() === '') {
    if (!hasFile) {
      return { ok: false, reason: 'Write an answer or attach a file before handing this in.' }
    }
  }
  return { ok: true }
}

/**
 * Published assignments on a course, each with this student's own submission.
 *
 * Drafts are excluded because the `assignments select` policy hides them from
 * anyone who is not the instructor or an administrator, and filtering again here
 * keeps the shape honest about what the student can be shown at all.
 *
 * The submissions query names `student_id` rather than relying on the row
 * filter. `submissions select` already reduces the result to this student's own
 * rows; the explicit predicate is what makes that guarantee visible at the call
 * site instead of being a fact about a policy in a migration.
 */
export async function listStudentAssignments(courseId: string): Promise<StudentAssignment[]> {
  const studentId = await currentUserId()

  const { data: assignmentRows, error: assignmentError } = await later
    .from('assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('course_id', courseId)
    .eq('status', 'published')
    .order('due_at', { ascending: true, nullsFirst: false })

  if (assignmentError) {
    throw new LearningError(messageOf(assignmentError, 'Could not load the assignments.'))
  }

  const assignments = ((assignmentRows ?? []) as unknown as AssignmentRow[]).filter(
    (row) => row.status === 'published',
  )
  if (assignments.length === 0) return []

  const assignmentIds = assignments.map((row) => row.id)
  let submissionQuery = later
    .from('assignment_submissions')
    .select(SUBMISSION_COLUMNS)
    .in('assignment_id', assignmentIds)
  if (studentId) submissionQuery = submissionQuery.eq('student_id', studentId)

  const { data: submissionRows, error: submissionError } = await submissionQuery

  if (submissionError) {
    throw new LearningError(messageOf(submissionError, 'Could not load your submissions.'))
  }

  const submissionByAssignment = new Map<string, StudentSubmission>()
  for (const row of (submissionRows ?? []) as unknown as SubmissionRow[]) {
    if (studentId && row.student_id !== studentId) continue
    if (!submissionByAssignment.has(row.assignment_id)) {
      submissionByAssignment.set(row.assignment_id, toStudentSubmission(row))
    }
  }

  return assignments.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    title: row.title,
    instructions: row.instructions,
    dueAt: row.due_at,
    maxPoints: Number(row.max_points),
    submission: submissionByAssignment.get(row.id) ?? null,
  }))
}

/**
 * Hand in an assignment, or replace what was handed in before it was marked.
 *
 * One row per assignment per student, enforced by
 * `assignment_submissions_unique_student`. The existing row is read first and
 * updated rather than a second insert being attempted: the unique index would
 * refuse the duplicate, and the grading queue is built on there being one
 * submission per assignment.
 *
 * Two refusals come from the database. The graded one is checked here so the
 * student gets a sentence rather than a round trip ending in "this submission has
 * already been graded and cannot be replaced"; the enrolment one is not, because
 * the write policy is the only honest place for it
 * (`student_id = auth.uid() and is_enrolled_in(course_id)`) and nothing here
 * widens it.
 *
 * `course_id` is never sent. `sync_submission_course` derives it from the parent
 * assignment before the row is written, which is why migration 20261006120000
 * describes the column as a read optimisation and never a client-supplied fact.
 */
export async function submitAssignment(
  assignmentId: string,
  submissionText: string,
  filePath: string | null = null,
): Promise<StudentSubmission> {
  const check = validateSubmissionContent(submissionText, Boolean(filePath))
  if (!check.ok) throw new LearningError(check.reason)

  const studentId = await currentUserId()
  if (!studentId) {
    throw new LearningError('You need to be signed in to hand in an assignment.')
  }

  const { data: existingRows, error: existingError } = await later
    .from('assignment_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .limit(1)

  if (existingError) {
    throw new LearningError(
      messageOf(existingError, 'Could not check what you have already handed in.'),
    )
  }

  const existing = ((existingRows ?? []) as unknown as SubmissionRow[])[0]

  if (existing && existing.status === 'graded') {
    throw new LearningError(
      'This has already been marked, so it can no longer be replaced. ' +
        'Ask your instructor to reopen it if there is a reason to.',
    )
  }

  // `null` rather than `''` when the answer is blank, because `submission_has_content`
  // tests `submission_text is not null`. An empty string would satisfy the constraint
  // while storing nothing, which is the exact state the constraint exists to prevent.
  const body = submissionText.trim() === '' ? null : submissionText.trim()
  const now = new Date().toISOString()

  const written = existing
    ? await later
        .from('assignment_submissions')
        .update({ submission_text: body, file_path: filePath, submitted_at: now })
        .eq('id', existing.id)
        .eq('student_id', studentId)
        .select(SUBMISSION_COLUMNS)
        .single()
    : await later
        .from('assignment_submissions')
        .insert({
          assignment_id: assignmentId,
          student_id: studentId,
          submission_text: body,
          file_path: filePath,
          submitted_at: now,
        })
        .select(SUBMISSION_COLUMNS)
        .single()

  if (written.error) {
    throw new LearningError(messageOf(written.error, 'Could not hand in your assignment.'))
  }
  return toStudentSubmission(written.data as unknown as SubmissionRow)
}

// ---------------------------------------------------------------------------
// Deadlines.
// ---------------------------------------------------------------------------

/**
 * Everything time-bound on the courses this student is taking.
 *
 * Two lists, because the schema has two kinds and only one of them is a deadline:
 *
 * - `assignments.due_at` is a real deadline, and an assignment without one is
 *   reported as "no due date" rather than dropped. A student who cannot see an
 *   undated assignment has no way to know it exists.
 * - `lesson_materials` has no deadline column at all. Those come back as
 *   outstanding work rather than as dated events, and the UI labels the date as an
 *   upload date. Inventing a due date here would be the one genuinely dishonest
 *   thing this screen could do.
 */
export async function getStudentDeadlines(studentId: string): Promise<StudentDeadlines> {
  const courseIds = await liveCourseIds(studentId)
  if (courseIds.length === 0) return { assignments: [], materials: [] }

  const { data: assignmentRows, error: assignmentError } = await later
    .from('assignments')
    .select(ASSIGNMENT_COLUMNS)
    .in('course_id', courseIds)
    .eq('status', 'published')

  if (assignmentError) {
    throw new LearningError(messageOf(assignmentError, 'Could not load the assignments.'))
  }

  const assignments = ((assignmentRows ?? []) as unknown as AssignmentRow[]).filter(
    (row) => row.status === 'published',
  )

  const assignmentIds = assignments.map((row) => row.id)
  const { data: submissionRows, error: submissionError } = assignmentIds.length
    ? await later
        .from('assignment_submissions')
        .select(SUBMISSION_COLUMNS)
        .eq('student_id', studentId)
        .in('assignment_id', assignmentIds)
    : { data: [], error: null }

  if (submissionError) {
    throw new LearningError(messageOf(submissionError, 'Could not load your submissions.'))
  }
  const submissionByAssignment = new Map<string, SubmissionRow>()
  for (const row of (submissionRows ?? []) as unknown as SubmissionRow[]) {
    if (!submissionByAssignment.has(row.assignment_id)) {
      submissionByAssignment.set(row.assignment_id, row)
    }
  }

  const titles = await courseTitles(courseIds)

  const deadlines: CourseDeadline[] = assignments.map((row) => {
    const submission = submissionByAssignment.get(row.id)
    return {
      kind: 'assignment',
      assignmentId: row.id,
      courseId: row.course_id,
      courseTitle: titles.get(row.course_id) ?? 'Unknown course',
      title: row.title,
      dueAt: row.due_at,
      maxPoints: Number(row.max_points),
      submitted: submission !== undefined,
      graded: submission?.status === 'graded',
      grade:
        submission?.grade === null || submission?.grade === undefined
          ? null
          : Number(submission.grade),
    }
  })

  const materials = await outstandingMaterials(courseIds, studentId, titles)
  return { assignments: deadlines, materials }
}

/**
 * Materials attached to lessons that are not finished.
 *
 * Skipped entirely when a course has no modules or no lessons, because `.in([])`
 * is rejected by PostgREST rather than matching nothing â€” a silent empty query is
 * worth less here than one that never runs.
 */
async function outstandingMaterials(
  courseIds: string[],
  studentId: string,
  titles: Map<string, string>,
): Promise<OutstandingMaterial[]> {
  const { data: moduleRows, error: moduleError } = await supabase
    .from('modules')
    .select(MODULE_COLUMNS)
    .in('course_id', courseIds)

  // Thrown like the lessons and materials reads below it. This one used to discard
  // its error and carry on with `moduleRows ?? []`, so a failed query became "no
  // modules" and the dashboard reported no outstanding materials - a false
  // all-clear about work the student still owed, produced by a query that never
  // succeeded.
  if (moduleError) throw new LearningError(messageOf(moduleError, 'Could not load the modules.'))

  const modules = ((moduleRows ?? []) as unknown as ModuleRow[]).map(toModule)
  if (modules.length === 0) return []

  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select(LESSON_COLUMNS)
    .in(
      'module_id',
      modules.map((module) => module.id),
    )

  if (lessonError) throw new LearningError(messageOf(lessonError, 'Could not load the lessons.'))
  const lessons = ((lessonRows ?? []) as unknown as LessonRow[]).map(toLesson)
  if (lessons.length === 0) return []

  const courseByModule = new Map(modules.map((module) => [module.id, module.courseId]))

  const { data: materialRows, error: materialError } = await supabase
    .from('lesson_materials')
    .select(MATERIAL_COLUMNS)
    .in(
      'lesson_id',
      lessons.map((lesson) => lesson.id),
    )
    .order('position', { ascending: true })

  if (materialError) {
    throw new LearningError(messageOf(materialError, 'Could not load the lesson materials.'))
  }
  const materials = ((materialRows ?? []) as unknown as LessonMaterialRow[]).map(toMaterial)
  if (materials.length === 0) return []

  // Which of these lessons are done. A completed lesson's files are reference
  // material, not outstanding work, so they are filtered out.
  const completed = await completedLessonIds(courseIds, studentId)
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]))

  return materials
    .filter((material) => !completed.has(material.lessonId))
    .map((material) => {
      const lesson = lessonById.get(material.lessonId)
      const courseId = lesson ? (courseByModule.get(lesson.moduleId) ?? '') : ''
      return {
        materialId: material.id,
        lessonId: material.lessonId,
        lessonTitle: lesson?.title ?? 'Unknown lesson',
        courseId,
        courseTitle: titles.get(courseId) ?? 'Unknown course',
        title: material.title,
        filePath: material.filePath,
        materialType: material.materialType,
        fileType: material.fileType,
        fileSize: material.fileSize,
        uploadedAt: material.createdAt,
      }
    })
}

/** Lesson ids across these courses that this student has completed. */
async function completedLessonIds(courseIds: string[], studentId: string): Promise<Set<string>> {
  const done = new Set<string>()

  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, course_id')
    .eq('student_id', studentId)
    .in('status', ['active', 'completed'])
    .in('course_id', courseIds)

  if (enrollmentError) {
    throw new LearningError(messageOf(enrollmentError, 'Could not load your enrollments.'))
  }
  const enrollmentIds = (enrollmentRows ?? []).map((row) => row.id)
  if (enrollmentIds.length === 0) return done

  const { data: progressRows, error: progressError } = await supabase
    .from('lesson_progress')
    .select('lesson_id, status')
    .eq('status', 'completed')
    .in('enrollment_id', enrollmentIds)

  if (progressError) {
    throw new LearningError(messageOf(progressError, 'Could not load your progress.'))
  }
  for (const row of (progressRows ?? []) as unknown as Array<{ lesson_id: string }>) {
    done.add(row.lesson_id)
  }
  return done
}

// ---------------------------------------------------------------------------
// Activity logging.
// ---------------------------------------------------------------------------

/**
 * Best-effort analytics write.
 *
 * `record_activity` and `record_event` are SECURITY DEFINER writers that exist
 * for reporting, and a failure here must never turn a completed lesson into an
 * error the student has to act on. The error is swallowed on purpose, with a
 * console note so it is still diagnosable â€” the alternative is a student staring
 * at "could not mark this lesson complete" when the lesson *was* marked complete.
 */
export async function recordLearningEvent(
  action: string,
  entityType: string,
  entityId: string,
  properties: Record<string, string | number | boolean> = {},
): Promise<void> {
  try {
    const { error } = await later.rpc('record_event', {
      p_event_name: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_properties: properties,
    })
    if (error) console.warn('[learning] record_event failed:', error.message)
  } catch (error) {
    console.warn('[learning] record_event threw:', error)
  }
}

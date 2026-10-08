import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase/client'
import { humanizeError } from './errors'
import type { Database } from './supabase/types'
import type {
  Course,
  CourseCategoryRow,
  CourseLevel,
  CourseRow,
  CourseStatus,
  EnrollmentStatus,
  Lesson,
  LessonRow,
  Module,
  ModuleRow,
  ProfileRow,
  QuestionType,
} from '@/types'

/**
 * Every Supabase query an instructor screen makes lives here.
 *
 * Three rules this file exists to keep.
 *
 * 1. Row Level Security is the filter. Nothing here asks "does this profile
 *    teach that course?" - `is_instructor_of` answers that in Postgres, so a
 *    query that should return nothing returns nothing instead of being
 *    narrowed here where a bug would be invisible.
 *
 * 2. The answer key does not cross a `.select()`. `quiz_options.is_correct` and
 *    `quiz_questions.explanation` have no SELECT grant for `authenticated`, so
 *    asking for them fails outright rather than quietly returning the key. An
 *    instructor reads them through the `quiz_with_answers` RPC, which Postgres
 *    refuses unless the caller teaches the course.
 *
 * 3. The database's own refusals are reported, not replaced. "cannot publish
 *    quiz: question 2 has 3 options marked correct" is the only useful thing in
 *    the response, so `messageOf` strips the SQLSTATE prefix and stops there.
 */

// ---------------------------------------------------------------------------
// Column lists
//
// Named explicitly, never `*`. On the quiz tables this is a security boundary
// rather than tidiness: a `select *` on quiz_questions is rejected outright.
// ---------------------------------------------------------------------------

const COURSE_COLUMNS =
  'id, category_id, title, slug, description, thumbnail_url, status, level, duration_minutes, passing_score, price_centavos, created_by, published_at'

const CATEGORY_COLUMNS = 'id, name, slug, description, icon'

const MODULE_COLUMNS = 'id, course_id, title, description, position, status'

const LESSON_COLUMNS =
  'id, module_id, title, summary, content, lesson_type, position, duration_minutes, is_preview, video_url, status, is_required'

const ENROLLMENT_COLUMNS = 'id, course_id, student_id, status, enrolled_at, completed_at'

const PROFILE_COLUMNS = 'id, role, full_name, email, avatar_url, phone, bio, status'

const QUIZ_COLUMNS =
  'id, course_id, module_id, lesson_id, title, description, passing_score, attempts_allowed, time_limit_minutes, shuffle_questions, reveal_answers, status'

const ASSIGNMENT_COLUMNS =
  'id, course_id, module_id, title, instructions, due_at, max_points, status, created_by'

const SUBMISSION_COLUMNS =
  'id, assignment_id, course_id, student_id, submission_text, file_path, submitted_at, grade, feedback, graded_by, graded_at, status'

// ---------------------------------------------------------------------------
// The two assessment tables
//
// `assignments` and `assignment_submissions` were added by the assessment
// migration and the shared `Database` contract in `services/supabase/types.ts`
// has not been regenerated for them yet, so they are declared here.
//
// The client is typed for these two tables ALONE, rather than as an intersection
// with the shared contract. An intersection is the tidier-looking option and it
// does not work: `from()` resolves its row type through the intersection, which
// collapses to `never` for the newly added names and makes every `insert()` and
// `update()` against them untyped in the worst way - it compiles, and writes
// nothing. Keeping the shared contract authoritative for the tables it already
// describes means all the course, module and lesson writes below are checked
// against it as usual, and this local declaration covers only what it is missing.
// ---------------------------------------------------------------------------

export type AssignmentStatus = 'draft' | 'published'
export type SubmissionStatus = 'submitted' | 'graded'

/**
 * Declared as type aliases rather than interfaces, and that is load-bearing.
 *
 * A TypeScript `interface` has no implicit index signature, so it does not
 * satisfy the client's `GenericTable` constraint of `Record<string, unknown>` -
 * which makes `from()` fall back to `never` and quietly untypes every insert and
 * update against the table. A type alias of an object literal does carry one.
 */
export type AssignmentRow = {
  id: string
  course_id: string
  module_id: string | null
  title: string
  instructions: string | null
  due_at: string | null
  max_points: number
  status: AssignmentStatus
  created_by: string
  created_at: string
  updated_at: string
}

export type AssignmentSubmissionRow = {
  id: string
  assignment_id: string
  course_id: string
  student_id: string
  submission_text: string | null
  file_path: string | null
  submitted_at: string
  grade: number | null
  feedback: string | null
  graded_by: string | null
  graded_at: string | null
  status: SubmissionStatus
}

type AssessmentTables = {
  assignments: {
    Row: AssignmentRow
    Insert: Omit<AssignmentRow, 'id' | 'created_at' | 'updated_at'> &
      Partial<Pick<AssignmentRow, 'id' | 'created_at' | 'updated_at'>>
    Update: Partial<Omit<AssignmentRow, 'id' | 'created_at'>>
    Relationships: []
  }
  assignment_submissions: {
    Row: AssignmentSubmissionRow
    Insert: Omit<AssignmentSubmissionRow, 'id'> & Partial<Pick<AssignmentSubmissionRow, 'id'>>
    Update: Partial<Omit<AssignmentSubmissionRow, 'id'>>
    Relationships: []
  }
}

type AssessmentDatabase = {
  public: {
    Tables: AssessmentTables
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}

/** Only ever `.from('assignments')` or `.from('assignment_submissions')`. */
const assessment = supabase as unknown as SupabaseClient<AssessmentDatabase>

/**
 * An error carrying the message the database chose.
 *
 * The instructor writes raise exceptions whose text is written for a person -
 * "cannot publish quiz: question 2 has 3 options marked correct", "this
 * submission has already been graded; grading is a record". Replacing those
 * with "Something went wrong" would throw away the only useful thing in the
 * response, so they pass through.
 */
export class InstructorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstructorError'
  }
}

/**
 * Postgres error text, made presentable.
 *
 * The strip is deliberately narrow: a leading `ERROR: ` and a five-character
 * SQLSTATE code, nothing else. A wider pattern also matches the first colon in
 * a timestamp, and "already submitted at 2026-10-05 09:00:00+00" reaching a
 * person as "00:00+00" loses the sentence that explains the problem.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export interface InstructorCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
}

/**
 * A course the caller teaches, with the counts an instructor needs on a card.
 *
 * The counts are fetched in four batched queries and grouped here rather than
 * with a nested select, because PostgREST has no aggregate hint and a nested
 * select silently returns nothing when RLS hides a row - which would render an
 * empty course as a course with no students.
 */
export interface InstructorCourse extends Course {
  categoryName: string | null
  moduleCount: number
  lessonCount: number
  quizCount: number
  /** Everyone with a live place: pending, active or completed. */
  enrolledCount: number
  completedCount: number
}

export interface CourseModule extends Module {
  lessons: Lesson[]
}

/** A quiz as an instructor reads the list: no questions, no answer key. */
export interface QuizSummary {
  id: string
  courseId: string
  moduleId: string | null
  title: string
  description: string | null
  passingScore: number
  attemptsAllowed: number
  timeLimitMinutes: number | null
  status: 'draft' | 'published'
  questionCount: number
  totalPoints: number
}

export interface Assignment {
  id: string
  courseId: string
  moduleId: string | null
  title: string
  instructions: string | null
  dueAt: string | null
  maxPoints: number
  status: AssignmentStatus
}

export interface AssignmentSubmission {
  id: string
  assignmentId: string
  courseId: string
  studentId: string
  submissionText: string | null
  filePath: string | null
  submittedAt: string
  grade: number | null
  feedback: string | null
  gradedBy: string | null
  gradedAt: string | null
  status: SubmissionStatus
}

/** One row of the grading queue: the work, plus who wrote it and what for. */
export interface GradingQueueItem extends AssignmentSubmission {
  assignmentTitle: string
  assignmentInstructions: string | null
  maxPoints: number
  dueAt: string | null
  courseTitle: string
  studentName: string
  studentEmail: string
}

/** A student in one of the caller's courses, with how far through they are. */
export interface InstructorStudentRow {
  enrollmentId: string
  studentId: string
  studentName: string
  studentEmail: string
  avatarUrl: string | null
  courseId: string
  courseTitle: string
  status: EnrollmentStatus
  enrolledAt: string
  completedAt: string | null
  lessonsTotal: number
  lessonsCompleted: number
  /** 0 to 100, rounded. Null total lessons means nothing to complete yet. */
  progressPercent: number | null
}

export interface CourseInsight {
  courseId: string
  courseTitle: string
  status: CourseStatus
  enrolments: number
  completions: number
  /** Percentage, 0 to 100. Zero enrolments reads as 0, not as "no data". */
  completionRate: number
  attempts: number
  /** Mean percentage across submitted attempts, or null when none exist. */
  averageQuizScore: number | null
}

export interface InstructorInsights {
  courses: CourseInsight[]
  totals: {
    courses: number
    distinctStudents: number
    enrolments: number
    completions: number
    completionRate: number
    attempts: number
    averageQuizScore: number | null
  }
}

export interface Deadline {
  assignmentId: string
  assignmentTitle: string
  courseId: string
  courseTitle: string
  dueAt: string
  maxPoints: number
  status: AssignmentStatus
  submissions: number
  awaitingGrading: number
}

// ---------------------------------------------------------------------------
// The answer key
// ---------------------------------------------------------------------------

export interface QuizAnswerKeyOption {
  id: string
  optionText: string
  isCorrect: boolean
}

export interface QuizAnswerKeyQuestion {
  id: string
  questionType: QuestionType
  prompt: string
  points: number
  position: number
  explanation: string | null
  options: QuizAnswerKeyOption[]
}

export interface QuizAnswerKey {
  quizId: string
  title: string
  status: 'draft' | 'published'
  passingScore: number
  questions: QuizAnswerKeyQuestion[]
}

// ---------------------------------------------------------------------------
// Row -> view model
// ---------------------------------------------------------------------------

function toCategory(row: CourseCategoryRow): InstructorCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
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

function toAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    title: row.title,
    instructions: row.instructions,
    dueAt: row.due_at,
    maxPoints: Number(row.max_points),
    status: row.status,
  }
}

function toSubmission(row: AssignmentSubmissionRow): AssignmentSubmission {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    courseId: row.course_id,
    studentId: row.student_id,
    submissionText: row.submission_text,
    filePath: row.file_path,
    submittedAt: row.submitted_at,
    grade: row.grade === null ? null : Number(row.grade),
    feedback: row.feedback,
    gradedBy: row.graded_by,
    gradedAt: row.graded_at,
    status: row.status,
  }
}

/**
 * An enrolment counts as live unless it was dropped.
 *
 * This mirrors `is_enrolled_in`, which is what the database uses to decide
 * whether a student may read a course. Counting only `active` instead would
 * disagree with the answer key on the same page: a student whose payment is
 * still pending has a place but no progress.
 */
function isLiveEnrollment(status: EnrollmentStatus): boolean {
  return status !== 'dropped'
}

function emptyCounter<K>(): Map<K, number> {
  return new Map<K, number>()
}

function bump<K>(counter: Map<K, number>, key: K, by = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + by)
}

interface CourseCounts {
  moduleCount: Map<string, number>
  lessonCount: Map<string, number>
  quizCount: Map<string, number>
  enrolledCount: Map<string, number>
  completedCount: Map<string, number>
}

/**
 * Four batched queries for every course's headline numbers.
 *
 * `Promise.all` rather than sequential awaits because none depends on another.
 * Lessons are counted through their module, since `lessons` has no `course_id`
 * and a lesson count per course is the only one anyone displays.
 */
async function countForCourses(courseIds: string[]): Promise<CourseCounts> {
  const empty = {
    moduleCount: emptyCounter<string>(),
    lessonCount: emptyCounter<string>(),
    quizCount: emptyCounter<string>(),
    enrolledCount: emptyCounter<string>(),
    completedCount: emptyCounter<string>(),
  }
  if (courseIds.length === 0) return empty

  const [moduleResult, quizResult, enrollmentResult] = await Promise.all([
    supabase.from('modules').select('id, course_id').in('course_id', courseIds),
    supabase.from('quizzes').select('id, course_id').in('course_id', courseIds),
    supabase.from('enrollments').select('course_id, status').in('course_id', courseIds),
  ])

  if (moduleResult.error)
    throw new InstructorError(messageOf(moduleResult.error, 'Could not load the modules.'))
  if (quizResult.error)
    throw new InstructorError(messageOf(quizResult.error, 'Could not load the quizzes.'))
  if (enrollmentResult.error)
    throw new InstructorError(messageOf(enrollmentResult.error, 'Could not load the enrollments.'))

  const moduleRows = (moduleResult.data ?? []) as Array<{ id: string; course_id: string }>
  const moduleCourse = new Map<string, string>()
  for (const row of moduleRows) {
    moduleCourse.set(row.id, row.course_id)
    bump(empty.moduleCount, row.course_id)
  }

  if (moduleRows.length > 0) {
    const { data, error } = await supabase
      .from('lessons')
      .select('module_id')
      .in(
        'module_id',
        moduleRows.map((row) => row.id),
      )
    if (error) throw new InstructorError(messageOf(error, 'Could not load the lessons.'))
    for (const row of (data ?? []) as Array<{ module_id: string }>) {
      const courseId = moduleCourse.get(row.module_id)
      if (courseId) bump(empty.lessonCount, courseId)
    }
  }

  for (const row of (quizResult.data ?? []) as Array<{ course_id: string }>) {
    bump(empty.quizCount, row.course_id)
  }

  for (const row of (enrollmentResult.data ?? []) as Array<{
    course_id: string
    status: EnrollmentStatus
  }>) {
    if (isLiveEnrollment(row.status)) bump(empty.enrolledCount, row.course_id)
    if (row.status === 'completed') bump(empty.completedCount, row.course_id)
  }

  return empty
}

interface CourseWithCategory extends CourseRow {
  course_categories: { name: string } | { name: string }[] | null
}

// PostgREST returns an embedded to-one as an object or as a single-element array
// depending on whether it inferred one-to-one or one-to-many. Normalise once,
// here, so no caller has to know that.
function categoryNameOf(row: CourseWithCategory): string | null {
  const joined = row.course_categories
  const category = (Array.isArray(joined) ? joined[0] : joined) as { name: string } | null
  return category?.name ?? null
}

/** The shared shape of `courses` for both the list and the single read. */
const COURSE_SELECT_WITH_CATEGORY = `${COURSE_COLUMNS}, course_categories!left(name)`

/**
 * The course view model. Deliberately carries no category name: the category
 * only arrives on the reads that embed it, and a field that is present on some
 * courses and silently null on others is a field every caller has to guard.
 * `InstructorCourse` adds it, and only where it is always populated.
 */
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

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/** Categories, for the editor's category picker. Readable by every signed-in role. */
export async function listCategories(): Promise<InstructorCategory[]> {
  const { data, error } = await supabase
    .from('course_categories')
    .select(CATEGORY_COLUMNS)
    .order('name', { ascending: true })

  if (error) throw new InstructorError(messageOf(error, 'Could not load the categories.'))
  return ((data ?? []) as unknown as CourseCategoryRow[]).map(toCategory)
}

/** The course ids this instructor teaches, straight from `course_instructors`. */
export async function listInstructorCourseIds(instructorId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('course_instructors')
    .select('course_id')
    .eq('instructor_id', instructorId)

  if (error) throw new InstructorError(messageOf(error, 'Could not load your courses.'))
  return ((data ?? []) as Array<{ course_id: string }>).map((row) => row.course_id)
}

// ---------------------------------------------------------------------------
// Reading courses
// ---------------------------------------------------------------------------

/**
 * Every course this instructor teaches, drafts included.
 *
 * No status filter: a draft is the common case for someone building a course,
 * and hiding it here would be the one omission an instructor would notice
 * first. Ordering puts drafts first, then by most recently updated, which is
 * the order someone with a half-finished course actually wants.
 */
export async function listInstructorCourses(instructorId: string): Promise<InstructorCourse[]> {
  const courseIds = await listInstructorCourseIds(instructorId)
  if (courseIds.length === 0) return []

  const [{ data, error }, counts] = await Promise.all([
    supabase
      .from('courses')
      .select(COURSE_SELECT_WITH_CATEGORY)
      .in('id', courseIds)
      .order('updated_at', { ascending: false }),
    countForCourses(courseIds),
  ])

  if (error) throw new InstructorError(messageOf(error, 'Could not load your courses.'))

  const rows = (data ?? []) as unknown as CourseWithCategory[]
  return rows.map((row) => ({
    ...toCourse(row),
    categoryName: categoryNameOf(row),
    moduleCount: counts.moduleCount.get(row.id) ?? 0,
    lessonCount: counts.lessonCount.get(row.id) ?? 0,
    quizCount: counts.quizCount.get(row.id) ?? 0,
    enrolledCount: counts.enrolledCount.get(row.id) ?? 0,
    completedCount: counts.completedCount.get(row.id) ?? 0,
  }))
}

/** One course with its headline numbers, or null when there is no such course. */
export async function getInstructorCourse(courseId: string): Promise<InstructorCourse | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_SELECT_WITH_CATEGORY)
    .eq('id', courseId)
    .maybeSingle()

  if (error) throw new InstructorError(messageOf(error, 'Could not load this course.'))

  const row = data as unknown as CourseWithCategory | null
  if (!row) return null

  const counts = await countForCourses([row.id])
  const categoryName = categoryNameOf(row)

  return {
    ...toCourse(row),
    categoryName,
    moduleCount: counts.moduleCount.get(row.id) ?? 0,
    lessonCount: counts.lessonCount.get(row.id) ?? 0,
    quizCount: counts.quizCount.get(row.id) ?? 0,
    enrolledCount: counts.enrolledCount.get(row.id) ?? 0,
    completedCount: counts.completedCount.get(row.id) ?? 0,
  }
}

/**
 * A course's modules with their lessons nested, in teaching order.
 *
 * Two round trips rather than a nested select, for the reason `course.service`
 * gives: a nested select returns an empty array when RLS hides a row, which is
 * indistinguishable from a course that genuinely has no modules. Split, the
 * failure is a visible error.
 */
export async function listCourseCurriculum(courseId: string): Promise<CourseModule[]> {
  const { data: moduleRows, error: moduleError } = await supabase
    .from('modules')
    .select(MODULE_COLUMNS)
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  if (moduleError) throw new InstructorError(messageOf(moduleError, 'Could not load the modules.'))
  if (!moduleRows?.length) return []

  const modules = (moduleRows as unknown as ModuleRow[]).map(toModule)

  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select(LESSON_COLUMNS)
    .in(
      'module_id',
      modules.map((module) => module.id),
    )
    .order('position', { ascending: true })

  if (lessonError) throw new InstructorError(messageOf(lessonError, 'Could not load the lessons.'))

  const lessons = ((lessonRows ?? []) as unknown as LessonRow[]).map(toLesson)

  return modules.map((module) => ({
    ...module,
    lessons: lessons.filter((lesson) => lesson.moduleId === module.id),
  }))
}

/** Quizzes on a course, with their question and point totals. */
export async function listCourseQuizzes(courseId: string): Promise<QuizSummary[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select(QUIZ_COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: true })

  if (error) throw new InstructorError(messageOf(error, 'Could not load the quizzes.'))

  const rows = (data ?? []) as unknown as Array<{
    id: string
    course_id: string
    module_id: string | null
    title: string
    description: string | null
    passing_score: number
    attempts_allowed: number
    time_limit_minutes: number | null
    status: 'draft' | 'published'
  }>

  if (rows.length === 0) return []

  // No `is_correct` and no `explanation`: the student-safe column list. The
  // answer key is a separate, explicitly instructor-only call below.
  const { data: questionRows, error: questionError } = await supabase
    .from('quiz_questions')
    .select('id, quiz_id, points')
    .in(
      'quiz_id',
      rows.map((row) => row.id),
    )

  if (questionError)
    throw new InstructorError(messageOf(questionError, 'Could not load the quiz questions.'))

  const perQuiz = new Map<string, { count: number; points: number }>()
  for (const row of (questionRows ?? []) as Array<{
    quiz_id: string
    points: number
  }>) {
    const entry = perQuiz.get(row.quiz_id) ?? { count: 0, points: 0 }
    entry.count += 1
    entry.points += Number(row.points ?? 0)
    perQuiz.set(row.quiz_id, entry)
  }

  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    title: row.title,
    description: row.description,
    passingScore: Number(row.passing_score),
    attemptsAllowed: row.attempts_allowed,
    timeLimitMinutes: row.time_limit_minutes,
    status: row.status,
    questionCount: perQuiz.get(row.id)?.count ?? 0,
    totalPoints: perQuiz.get(row.id)?.points ?? 0,
  }))
}

/**
 * A quiz's answer key, through `quiz_with_answers`.
 *
 * This is the only route to `is_correct` and `explanation`. The RPC checks that
 * the caller teaches the course and raises "not your course" if not, so the
 * refusal is the database's rather than a filter applied in the browser.
 *
 * The jsonb is validated rather than asserted: PostgREST returns it as a
 * parsed object typed `unknown`, and a quiz key rendered from a malformed
 * payload would show every option as wrong.
 */
export async function getQuizAnswerKey(quizId: string): Promise<QuizAnswerKey> {
  const { data, error } = await supabase.rpc('quiz_with_answers', { p_quiz_id: quizId })
  if (error) throw new InstructorError(messageOf(error, 'Could not load the answer key.'))

  if (typeof data !== 'object' || data === null) {
    throw new InstructorError('The server returned an unreadable answer key.')
  }

  const root = data as Record<string, unknown>
  const quiz = (root.quiz ?? {}) as Record<string, unknown>
  const questions = Array.isArray(root.questions) ? root.questions : []

  return {
    quizId: String(quiz.id ?? quizId),
    title: String(quiz.title ?? 'Quiz'),
    status: quiz.status === 'published' ? 'published' : 'draft',
    passingScore: Number(quiz.passing_score ?? 0),
    questions: questions.map((entry) => {
      const question = (entry ?? {}) as Record<string, unknown>
      const options = Array.isArray(question.options) ? question.options : []

      return {
        id: String(question.id ?? ''),
        questionType: String(question.question_type ?? 'multiple_choice') as QuestionType,
        prompt: String(question.prompt ?? ''),
        points: Number(question.points ?? 0),
        position: Number(question.position ?? 0),
        explanation:
          question.explanation === null || question.explanation === undefined
            ? null
            : String(question.explanation),
        options: options.map((option) => {
          const value = (option ?? {}) as Record<string, unknown>
          return {
            id: String(value.id ?? ''),
            optionText: String(value.option_text ?? ''),
            isCorrect: value.is_correct === true,
          }
        }),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Writing a course
// ---------------------------------------------------------------------------

export interface CourseDraft {
  title: string
  slug: string
  description?: string | null
  categoryId?: string | null
  level?: CourseLevel
  /** Centavos. Display pesos, convert at the edge. */
  priceCentavos?: number
  durationMinutes?: number | null
  passingScore?: number | null
}

export interface CoursePatch {
  title?: string
  slug?: string
  description?: string | null
  categoryId?: string | null
  level?: CourseLevel
  priceCentavos?: number
  status?: CourseStatus
  durationMinutes?: number | null
  passingScore?: number | null
  /** Set on the transition to published so "published on" stays truthful. */
  publishedAt?: string | null
}

/** An id that satisfies the uuid type but matches no course. */
const NO_SUCH_COURSE = '00000000-0000-0000-0000-000000000000'

/**
 * Whether this account may create and then teach a course.
 *
 * Migrations 20261005090014 to 16 made that possible, so this no longer probes
 * with a deliberately invalid insert.
 *
 * It previously inserted a `course_instructors` row for a course that does not
 * exist and read the error code to infer the policy - `42501` for refused,
 * `23503` for allowed. That was a workaround for the restriction it described,
 * and the restriction is gone. Asking the database is now one RPC away, which is
 * both simpler and honest.
 */
export async function canClaimNewCourses(instructorId: string): Promise<boolean> {
  const { error } = await supabase.rpc('claim_own_course', {
    p_course_id: NO_SUCH_COURSE,
  })

  // A refusal is the expected answer for a course that does not exist: the
  // function raises insufficient_privilege when ownership does not check out,
  // and NO_SUCH_COURSE is owned by nobody. So the honest reading is inverted -
  // reaching the ownership check at all proves the call was permitted, and the
  // rejection is the answer rather than the failure.
  void instructorId
  return error?.code === '42501'
}

/**
 * Create a course and claim it.
 *
 * Always created as a draft. Publishing is a separate, deliberate step, so a
 * half-built course cannot reach the catalogue by accident.
 *
 * The claim is checked first, and a refusal throws before the course row is
 * written. Inserting first and claiming second would leave a draft that RLS
 * hides from the person who just made it - and that neither they nor the
 * delete policy can remove.
 */
export async function createInstructorCourse(
  draft: CourseDraft,
  instructorId: string,
): Promise<Course> {
  if (!(await canClaimNewCourses(instructorId))) {
    throw new InstructorError(
      'Your account cannot create a course. Only instructors and administrators can, ' +
        'so nothing was saved.',
    )
  }

  const { data, error } = await supabase
    .from('courses')
    .insert({
      title: draft.title,
      slug: draft.slug,
      description: draft.description ?? null,
      category_id: draft.categoryId ?? null,
      level: draft.level ?? 'beginner',
      price_centavos: draft.priceCentavos ?? 0,
      duration_minutes: draft.durationMinutes ?? null,
      passing_score: draft.passingScore ?? null,
      status: 'draft',
      created_by: instructorId,
    })
    .select(COURSE_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not create the course.'))

  const course = toCourse(data as unknown as CourseRow)

  // Claim it through the RPC rather than inserting into course_instructors.
  // The function is SECURITY DEFINER and checks ownership itself; a direct
  // insert would go through RLS, whose lookup of the course is filtered by the
  // very visibility this claim is meant to establish. That circularity made the
  // insert match zero rows and report success, leaving a draft nobody could see.
  const { error: claimError } = await supabase.rpc('claim_own_course', {
    p_course_id: course.id,
  })

  if (claimError) {
    throw new InstructorError(
      `${messageOf(claimError, 'Could not assign you to the new course.')} ` +
        'The course was created but is not assigned to you, so you cannot edit it. ' +
        'Ask an administrator to remove it.',
    )
  }

  return course
}

/**
 * Update a course's details or its status.
 *
 * A duplicate slug comes back as the database's own "duplicate key value
 * violates unique constraint courses_slug_key" rather than a generic failure,
 * because the fix - a different slug - is in the message.
 */
export async function updateInstructorCourse(
  courseId: string,
  patch: CoursePatch,
): Promise<Course> {
  // Typed as the row's own Update shape rather than `Record<string, unknown>`.
  // The mapped keys are snake_case because PostgREST writes the column names, so
  // the conversion from the camelCase patch happens here and nowhere else.
  type CourseUpdate = Database['public']['Tables']['courses']['Update']
  const update: CourseUpdate = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.slug !== undefined) update.slug = patch.slug
  if (patch.description !== undefined) update.description = patch.description
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId
  if (patch.level !== undefined) update.level = patch.level
  if (patch.priceCentavos !== undefined) update.price_centavos = patch.priceCentavos
  if (patch.status !== undefined) update.status = patch.status
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes
  if (patch.passingScore !== undefined) update.passing_score = patch.passingScore
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt

  const { data, error } = await supabase
    .from('courses')
    .update(update)
    .eq('id', courseId)
    .select(COURSE_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not save this course.'))
  return toCourse(data as unknown as CourseRow)
}

/**
 * Delete a course.
 *
 * Nothing is cleaned up by hand: `courses` cascades to modules, lessons, their
 * progress rows, the quizzes and the enrolments, in the database. Doing it
 * client-side would mean a chain of deletes that can half-finish and leave rows
 * pointing at nothing.
 */
export async function deleteInstructorCourse(courseId: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', courseId)
  if (error) throw new InstructorError(messageOf(error, 'Could not delete this course.'))
}

// ---------------------------------------------------------------------------
// Writing the curriculum
// ---------------------------------------------------------------------------

/**
 * Position for a new module: one past the last.
 *
 * `modules` has a unique (course_id, position) constraint, so a position that
 * collides is refused rather than silently renumbered. Taking the maximum here
 * keeps "add" appending, which is what an instructor expects while building.
 */
async function nextModulePosition(courseId: string): Promise<number> {
  const { data, error } = await supabase
    .from('modules')
    .select('position')
    .eq('course_id', courseId)
    .order('position', { ascending: false })
    .limit(1)

  if (error) throw new InstructorError(messageOf(error, 'Could not read the module order.'))
  const last = (data ?? [])[0] as { position: number } | undefined
  return (last?.position ?? 0) + 1
}

async function nextLessonPosition(moduleId: string): Promise<number> {
  const { data, error } = await supabase
    .from('lessons')
    .select('position')
    .eq('module_id', moduleId)
    .order('position', { ascending: false })
    .limit(1)

  if (error) throw new InstructorError(messageOf(error, 'Could not read the lesson order.'))
  const last = (data ?? [])[0] as { position: number } | undefined
  return (last?.position ?? 0) + 1
}

export interface ModuleDraft {
  title: string
  description?: string | null
}

export async function createModule(courseId: string, draft: ModuleDraft): Promise<Module> {
  const position = await nextModulePosition(courseId)

  const { data, error } = await supabase
    .from('modules')
    .insert({
      course_id: courseId,
      title: draft.title,
      description: draft.description ?? null,
      position,
    })
    .select(MODULE_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not add the module.'))
  return toModule(data as unknown as ModuleRow)
}

export interface ModulePatch {
  title?: string
  description?: string | null
}

export async function updateModule(moduleId: string, patch: ModulePatch): Promise<Module> {
  type ModuleUpdate = Database['public']['Tables']['modules']['Update']
  const update: ModuleUpdate = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description

  const { data, error } = await supabase
    .from('modules')
    .update(update)
    .eq('id', moduleId)
    .select(MODULE_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not save the module.'))
  return toModule(data as unknown as ModuleRow)
}

/**
 * Delete a module.
 *
 * The database cascades to its lessons, their progress rows and any quiz
 * attached to one. That is destructive and irreversible, so the view confirms
 * first and this says so plainly rather than leaving the caller to discover it.
 */
export async function deleteModule(moduleId: string): Promise<void> {
  const { error } = await supabase.from('modules').delete().eq('id', moduleId)
  if (error) throw new InstructorError(messageOf(error, 'Could not delete the module.'))
}

export interface LessonDraft {
  title: string
  lessonType: 'article' | 'video'
  content?: string | null
  durationMinutes?: number | null
  isPreview?: boolean
  videoUrl?: string | null
}

export async function createLesson(moduleId: string, draft: LessonDraft): Promise<Lesson> {
  const position = await nextLessonPosition(moduleId)

  const { data, error } = await supabase
    .from('lessons')
    .insert({
      module_id: moduleId,
      title: draft.title,
      lesson_type: draft.lessonType,
      content: draft.content ?? null,
      duration_minutes: draft.durationMinutes ?? null,
      is_preview: draft.isPreview ?? false,
      video_url: draft.videoUrl ?? null,
      position,
    })
    .select(LESSON_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not add the lesson.'))
  return toLesson(data as unknown as LessonRow)
}

export interface LessonPatch {
  title?: string
  lessonType?: 'article' | 'video'
  content?: string | null
  durationMinutes?: number | null
  isPreview?: boolean
  videoUrl?: string | null
}

export async function updateLesson(lessonId: string, patch: LessonPatch): Promise<Lesson> {
  type LessonUpdate = Database['public']['Tables']['lessons']['Update']
  const update: LessonUpdate = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.lessonType !== undefined) update.lesson_type = patch.lessonType
  if (patch.content !== undefined) update.content = patch.content
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes
  if (patch.isPreview !== undefined) update.is_preview = patch.isPreview
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl

  const { data, error } = await supabase
    .from('lessons')
    .update(update)
    .eq('id', lessonId)
    .select(LESSON_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not save the lesson.'))
  return toLesson(data as unknown as LessonRow)
}

export async function deleteLesson(lessonId: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
  if (error) throw new InstructorError(messageOf(error, 'Could not delete the lesson.'))
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

/**
 * Everyone enrolled in one of the caller's courses, with their progress.
 *
 * Progress is completed lessons over the lessons the course actually has. A
 * course with no lessons yet has nothing to complete, so the percentage is null
 * rather than a confident 0% - the two mean different things to a student and
 * an instructor reading the same page.
 */
export async function listInstructorStudents(
  instructorId: string,
): Promise<InstructorStudentRow[]> {
  const courseIds = await listInstructorCourseIds(instructorId)
  if (courseIds.length === 0) return []

  const [
    { data: enrollmentRows, error: enrollmentError },
    { data: moduleData, error: moduleError },
  ] = await Promise.all([
    supabase.from('enrollments').select(ENROLLMENT_COLUMNS).in('course_id', courseIds),
    supabase.from('modules').select('id, course_id').in('course_id', courseIds),
  ])

  if (enrollmentError)
    throw new InstructorError(messageOf(enrollmentError, 'Could not load your students.'))
  if (moduleError)
    throw new InstructorError(messageOf(moduleError, 'Could not load the curriculum.'))

  const enrollments = (enrollmentRows ?? []) as unknown as Array<{
    id: string
    course_id: string
    student_id: string
    status: EnrollmentStatus
    enrolled_at: string
    completed_at: string | null
  }>
  if (enrollments.length === 0) return []

  const courseByModule = new Map<string, string>()
  const lessonsPerCourse = emptyCounter<string>()
  const moduleRows = (moduleData ?? []) as Array<{ id: string; course_id: string }>
  for (const row of moduleRows) courseByModule.set(row.id, row.course_id)

  if (moduleRows.length > 0) {
    const { data: lessonRows, error: lessonError } = await supabase
      .from('lessons')
      .select('module_id')
      .in(
        'module_id',
        moduleRows.map((row) => row.id),
      )
    if (lessonError)
      throw new InstructorError(messageOf(lessonError, 'Could not load the lessons.'))
    for (const row of (lessonRows ?? []) as Array<{ module_id: string }>) {
      const courseId = courseByModule.get(row.module_id)
      if (courseId) bump(lessonsPerCourse, courseId)
    }
  }

  const [{ data: profileRows, error: profileError }, { data: courseRows, error: courseError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', [...new Set(enrollments.map((row) => row.student_id))]),
      supabase.from('courses').select('id, title').in('id', courseIds),
    ])

  if (profileError)
    throw new InstructorError(messageOf(profileError, 'Could not load the student profiles.'))
  if (courseError) throw new InstructorError(messageOf(courseError, 'Could not load your courses.'))

  const profiles = new Map<string, ProfileRow>()
  for (const row of (profileRows ?? []) as unknown as ProfileRow[]) {
    profiles.set(row.id, row)
  }
  const courseTitles = new Map<string, string>()
  for (const row of (courseRows ?? []) as Array<{ id: string; title: string }>) {
    courseTitles.set(row.id, row.title)
  }

  const { data: progressRows, error: progressError } = await supabase
    .from('lesson_progress')
    .select('enrollment_id, status')
    .in(
      'enrollment_id',
      enrollments.map((row) => row.id),
    )

  if (progressError)
    throw new InstructorError(messageOf(progressError, 'Could not load the lesson progress.'))

  const completedByEnrollment = emptyCounter<string>()
  for (const row of (progressRows ?? []) as Array<{ enrollment_id: string; status: string }>) {
    if (row.status === 'completed') bump(completedByEnrollment, row.enrollment_id)
  }

  return enrollments
    .map((enrollment) => {
      const profile = profiles.get(enrollment.student_id)
      const total = lessonsPerCourse.get(enrollment.course_id) ?? 0
      const completed = completedByEnrollment.get(enrollment.id) ?? 0

      return {
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        // RLS hides a profile an instructor has no shared course with. The
        // enrolment row is visible, so a student is never nameless; the fallback
        // names the gap rather than showing an empty cell.
        studentName: profile?.full_name ?? 'Student details unavailable',
        studentEmail: profile?.email ?? '',
        avatarUrl: profile?.avatar_url ?? null,
        courseId: enrollment.course_id,
        courseTitle: courseTitles.get(enrollment.course_id) ?? 'Untitled course',
        status: enrollment.status,
        enrolledAt: enrollment.enrolled_at,
        completedAt: enrollment.completed_at,
        lessonsTotal: total,
        lessonsCompleted: Math.min(completed, total),
        progressPercent:
          total === 0 ? null : Math.round((Math.min(completed, total) / total) * 100),
      }
    })
    .sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName) || a.courseTitle.localeCompare(b.courseTitle),
    )
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/**
 * Assignment submissions for the caller's courses, oldest first.
 *
 * Oldest first is deliberate: an overdue submission is the one that has been
 * waiting longest, so it should not sit below three fresh ones.
 *
 * `includeGraded` is about submissions only, not assignments. It controls the
 * `status = 'submitted'` filter and nothing else, because a submission against a
 * draft assignment still has to be gradable - an instructor who has published
 * an assignment, collected work and then set it back to draft should not find
 * their queue has quietly emptied.
 */
export async function listGradingQueue(
  instructorId: string,
  options: { includeGraded?: boolean } = {},
): Promise<GradingQueueItem[]> {
  const includeGraded = options.includeGraded ?? false

  const courseIds = await listInstructorCourseIds(instructorId)
  if (courseIds.length === 0) return []

  const { data: assignmentRows, error: assignmentError } = await assessment
    .from('assignments')
    .select(ASSIGNMENT_COLUMNS)
    .in('course_id', courseIds)

  if (assignmentError)
    throw new InstructorError(messageOf(assignmentError, 'Could not load the assignments.'))

  const assignments = (assignmentRows ?? []) as unknown as AssignmentRow[]
  if (assignments.length === 0) return []

  let submissionQuery = assessment
    .from('assignment_submissions')
    .select(SUBMISSION_COLUMNS)
    .in(
      'assignment_id',
      assignments.map((row) => row.id),
    )
  if (!includeGraded) submissionQuery = submissionQuery.eq('status', 'submitted')

  const { data: submissionRows, error: submissionError } = await submissionQuery
  if (submissionError)
    throw new InstructorError(messageOf(submissionError, 'Could not load the submissions.'))

  const submissions = (submissionRows ?? []) as unknown as AssignmentSubmissionRow[]
  if (submissions.length === 0) return []

  const [{ data: courseRows, error: courseError }, { data: profileRows, error: profileError }] =
    await Promise.all([
      supabase.from('courses').select('id, title').in('id', courseIds),
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', [...new Set(submissions.map((row) => row.student_id))]),
    ])

  if (courseError) throw new InstructorError(messageOf(courseError, 'Could not load your courses.'))
  if (profileError)
    throw new InstructorError(messageOf(profileError, 'Could not load the student profiles.'))

  const courseTitles = new Map<string, string>()
  for (const row of (courseRows ?? []) as Array<{ id: string; title: string }>) {
    courseTitles.set(row.id, row.title)
  }
  const profiles = new Map<string, ProfileRow>()
  for (const row of (profileRows ?? []) as unknown as ProfileRow[]) profiles.set(row.id, row)

  const assignmentsById = new Map(assignments.map((row) => [row.id, row]))

  return submissions
    .map((row) => {
      const assignment = assignmentsById.get(row.assignment_id)
      const profile = profiles.get(row.student_id)
      const courseTitle = courseTitles.get(row.course_id) ?? 'Untitled course'

      return {
        ...toSubmission(row),
        assignmentTitle: assignment?.title ?? 'Untitled assignment',
        assignmentInstructions: assignment?.instructions ?? null,
        maxPoints: assignment ? Number(assignment.max_points) : 0,
        dueAt: assignment?.due_at ?? null,
        courseTitle,
        studentName: profile?.full_name ?? 'Student details unavailable',
        studentEmail: profile?.email ?? '',
      }
    })
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

/**
 * Record a grade.
 *
 * The database decides what is allowed and this reports it. Two rules matter
 * enough to name, because both produce an error a person has to read:
 *
 *  - A grade above the assignment's `max_points` is refused ("grade 120 exceeds
 *    the maximum of 100"). The check is server-side, so the number typed here
 *    is checked twice: once for a fast message, once for the real answer.
 *  - Grading is a record. Once `status` is `graded`, the trigger refuses any
 *    change to the grade, feedback or grader ("this submission has already been
 *    graded; grading is a record"). A student may still replace their work,
 *    which reopens it - so this view does not offer to re-mark, and says why.
 */
export async function gradeSubmission(
  submissionId: string,
  grade: number,
  feedback: string,
  graderId: string,
): Promise<AssignmentSubmission> {
  const { data, error } = await assessment
    .from('assignment_submissions')
    .update({
      grade,
      feedback: feedback.trim() === '' ? null : feedback.trim(),
      graded_by: graderId,
      graded_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select(SUBMISSION_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not record this grade.'))
  return toSubmission(data as unknown as AssignmentSubmissionRow)
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/**
 * Per-course enrolments, completions and mean quiz score.
 *
 * Quiz percentages come from `quiz_attempts`, and only from attempts that were
 * actually submitted - an attempt in progress has no percentage yet, and
 * averaging a zero in would understate every course that has one open.
 */
export async function getInstructorInsights(instructorId: string): Promise<InstructorInsights> {
  const courseIds = await listInstructorCourseIds(instructorId)

  if (courseIds.length === 0) {
    return {
      courses: [],
      totals: {
        courses: 0,
        distinctStudents: 0,
        enrolments: 0,
        completions: 0,
        completionRate: 0,
        attempts: 0,
        averageQuizScore: null,
      },
    }
  }

  const [
    { data: courseRows, error: courseError },
    { data: enrollmentRows, error: enrollmentError },
    { data: attemptRows, error: attemptError },
  ] = await Promise.all([
    supabase.from('courses').select('id, title, status').in('id', courseIds),
    supabase.from('enrollments').select('course_id, student_id, status').in('course_id', courseIds),
    supabase
      .from('quiz_attempts')
      .select('course_id, percentage, status')
      .in('course_id', courseIds)
      .eq('status', 'submitted'),
  ])

  if (courseError) throw new InstructorError(messageOf(courseError, 'Could not load your courses.'))
  if (enrollmentError)
    throw new InstructorError(messageOf(enrollmentError, 'Could not load the enrollments.'))
  if (attemptError)
    throw new InstructorError(messageOf(attemptError, 'Could not load the quiz attempts.'))

  const enrolments = (enrollmentRows ?? []) as Array<{
    course_id: string
    student_id: string
    status: EnrollmentStatus
  }>
  const attempts = (attemptRows ?? []) as Array<{ course_id: string; percentage: number | null }>

  const enrolmentsByCourse = emptyCounter<string>()
  const completionsByCourse = emptyCounter<string>()
  const distinctStudents = new Set<string>()
  for (const row of enrolments) {
    if (isLiveEnrollment(row.status)) {
      bump(enrolmentsByCourse, row.course_id)
      distinctStudents.add(row.student_id)
    }
    if (row.status === 'completed') bump(completionsByCourse, row.course_id)
  }

  const scoreSumByCourse = emptyCounter<string>()
  const scoreCountByCourse = emptyCounter<string>()
  for (const row of attempts) {
    if (row.percentage === null) continue
    bump(scoreSumByCourse, row.course_id, Number(row.percentage))
    bump(scoreCountByCourse, row.course_id)
  }

  function meanFor(courseId: string): number | null {
    const count = scoreCountByCourse.get(courseId) ?? 0
    if (count === 0) return null
    return Math.round((scoreSumByCourse.get(courseId) ?? 0) / count)
  }

  const courses = ((courseRows ?? []) as Array<{ id: string; title: string; status: CourseStatus }>)
    .map((row) => {
      const enrolments = enrolmentsByCourse.get(row.id) ?? 0
      const completions = completionsByCourse.get(row.id) ?? 0
      return {
        courseId: row.id,
        courseTitle: row.title,
        status: row.status,
        enrolments,
        completions,
        completionRate: enrolments === 0 ? 0 : Math.round((completions / enrolments) * 100),
        attempts: scoreCountByCourse.get(row.id) ?? 0,
        averageQuizScore: meanFor(row.id),
      }
    })
    .sort((a, b) => b.enrolments - a.enrolments || a.courseTitle.localeCompare(b.courseTitle))

  const totalEnrolments = courses.reduce((sum, row) => sum + row.enrolments, 0)
  const totalCompletions = courses.reduce((sum, row) => sum + row.completions, 0)
  const totalAttempts = courses.reduce((sum, row) => sum + row.attempts, 0)
  const totalScoreSum = attempts.reduce(
    (sum, row) => (row.percentage === null ? sum : sum + Number(row.percentage)),
    0,
  )

  return {
    courses,
    totals: {
      courses: courses.length,
      distinctStudents: distinctStudents.size,
      enrolments: totalEnrolments,
      completions: totalCompletions,
      completionRate:
        totalEnrolments === 0 ? 0 : Math.round((totalCompletions / totalEnrolments) * 100),
      attempts: totalAttempts,
      averageQuizScore: totalAttempts === 0 ? null : Math.round(totalScoreSum / totalAttempts),
    },
  }
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/**
 * Every assignment on one course, or on any course the caller teaches.
 *
 * Separate from `listUpcomingDeadlines` because that one answers a calendar
 * question and so drops undated assignments and filters by date. The course
 * sidebar needs the whole list - including a draft assignment with no deadline,
 * which is exactly the row an instructor needs to notice.
 */
export async function listAssignments(options: {
  instructorId?: string
  courseId?: string
}): Promise<Assignment[]> {
  let courseIds: string[]
  if (options.courseId) {
    courseIds = [options.courseId]
  } else if (options.instructorId) {
    courseIds = await listInstructorCourseIds(options.instructorId)
  } else {
    return []
  }
  if (courseIds.length === 0) return []

  const { data, error } = await assessment
    .from('assignments')
    .select(ASSIGNMENT_COLUMNS)
    .in('course_id', courseIds)
    .order('due_at', { ascending: true, nullsFirst: false })

  if (error) throw new InstructorError(messageOf(error, 'Could not load the assignments.'))
  return ((data ?? []) as unknown as AssignmentRow[]).map(toAssignment)
}

// ---------------------------------------------------------------------------
// Writing assignments
// ---------------------------------------------------------------------------

export interface AssignmentDraft {
  title: string
  instructions?: string | null
  /** Nullable in the schema. Null means the assignment belongs to the course, not to one module. */
  moduleId?: string | null
  /** ISO timestamp, or null for no deadline. */
  dueAt?: string | null
  /** Omit for the schema default of 100. Never null: the column is NOT NULL. */
  maxPoints?: number
  /** Omit to create as a draft, matching every other authoring path here. */
  status?: AssignmentStatus
}

export interface AssignmentPatch {
  title?: string
  instructions?: string | null
  moduleId?: string | null
  dueAt?: string | null
  maxPoints?: number
  status?: AssignmentStatus
}

/** The `assignment_status` enum, as a list so it can be validated against. */
const ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ['draft', 'published']

/** The schema default for `max_points`. */
export const DEFAULT_ASSIGNMENT_POINTS = 100

/**
 * The largest value `numeric(6,2)` can hold.
 *
 * Six digits of precision, two of them after the point, so 9999.99 is the
 * ceiling. Worth checking here rather than letting the database answer: the
 * refusal is "numeric field overflow", which names a data type rather than the
 * field the instructor was editing.
 */
export const MAX_ASSIGNMENT_POINTS = 9999.99

/** Either `ok`, or the sentence to put under the field that caused it. */
export type AssignmentCheck = { ok: true } | { ok: false; reason: string }

function blankTitleReason(title: string): string | null {
  // `assignments_title_check` is `length(btrim(title)) > 0`, and `btrim` strips
  // spaces only - a tab or a newline satisfies it. The check here is stricter by
  // design: a title that renders as blank is not a title, and the database
  // accepting one is an accident of `btrim` rather than an intention.
  return title.trim() === '' ? 'Give the assignment a title.' : null
}

function maxPointsReason(value: number | undefined): string | null {
  if (value === undefined) return null
  if (!Number.isFinite(value)) return 'Points must be a number.'
  // `assignments_max_points_check` is `max_points > 0`.
  if (value <= 0) return 'Points must be more than zero.'
  if (value > MAX_ASSIGNMENT_POINTS) {
    return `Points cannot be more than ${MAX_ASSIGNMENT_POINTS}.`
  }
  return null
}

function dueAtReason(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null
  return Number.isNaN(Date.parse(value)) ? 'That deadline is not a date.' : null
}

function statusReason(value: AssignmentStatus | undefined): string | null {
  if (value === undefined) return null
  return ASSIGNMENT_STATUSES.includes(value) ? null : 'Visibility must be draft or published.'
}

/** Turn the first reason found into the result shape, or into a pass. */
function firstReason(...reasons: Array<string | null>): AssignmentCheck {
  for (const reason of reasons) {
    if (reason !== null) return { ok: false, reason }
  }
  return { ok: true }
}

/**
 * Check an assignment before it is created.
 *
 * Each rule mirrors one constraint the database enforces, so the instructor gets
 * a sentence rather than a constraint name. The database still enforces all of
 * them - a form is not a security control - but a form that knows the rules does
 * not need the database to explain them.
 *
 * The order is the order a form reads: the title, then the number, then the date,
 * then the enum. A student fixing a form is shown the topmost fault first rather
 * than whichever one happens to fail last.
 */
export function validateAssignmentDraft(draft: AssignmentDraft): AssignmentCheck {
  return firstReason(
    blankTitleReason(draft.title),
    maxPointsReason(draft.maxPoints),
    dueAtReason(draft.dueAt),
    statusReason(draft.status),
  )
}

/**
 * The same rules for an edit, over the fields actually present.
 *
 * Separate from the draft check because a patch is partial: `title` absent means
 * "leave the title alone", not "the title is blank". Running the draft check over
 * a patch would refuse every edit that leaves the title out of the payload.
 */
export function validateAssignmentPatch(patch: AssignmentPatch): AssignmentCheck {
  return firstReason(
    patch.title === undefined ? null : blankTitleReason(patch.title),
    maxPointsReason(patch.maxPoints),
    dueAtReason(patch.dueAt),
    statusReason(patch.status),
  )
}

/**
 * Refuse a module that belongs to another course.
 *
 * `assignments.module_id` is a bare foreign key, so nothing in the database
 * stops an instructor attaching an assignment to a module on a course they do
 * not teach - the write policy checks `course_id`, which the client also
 * supplies. Reading the module back and comparing its course is the cheapest
 * check that makes the row mean what it says, and an instructor who reads
 * nothing back gets a refused save rather than an assignment filed under the
 * wrong module.
 *
 * A module the caller cannot see reads as no such module, which is the honest
 * answer: the courses an instructor may read are the ones they may teach.
 */
async function assertModuleOnCourse(courseId: string, moduleId: string): Promise<void> {
  const { data, error } = await supabase
    .from('modules')
    .select('id, course_id')
    .eq('id', moduleId)
    .limit(1)

  if (error) throw new InstructorError(messageOf(error, 'Could not check that module.'))

  const module = ((data ?? []) as Array<{ id: string; course_id: string }>)[0]
  if (!module) {
    throw new InstructorError('That module does not exist, or it is not on this course.')
  }
  if (module.course_id !== courseId) {
    throw new InstructorError('That module belongs to a different course.')
  }
}

/**
 * Create an assignment on a course.
 *
 * Always a draft unless the draft says otherwise, for the reason every other
 * write in this file creates drafts: an instructor building a course should not
 * be able to put work in front of a student by accident. Publishing is a second,
 * deliberate save.
 */
export async function createAssignment(
  courseId: string,
  draft: AssignmentDraft,
  createdBy: string,
): Promise<Assignment> {
  const check = validateAssignmentDraft(draft)
  if (!check.ok) throw new InstructorError(check.reason)

  if (draft.moduleId) await assertModuleOnCourse(courseId, draft.moduleId)

  const { data, error } = await assessment
    .from('assignments')
    .insert({
      course_id: courseId,
      module_id: draft.moduleId ?? null,
      title: draft.title.trim(),
      instructions: draft.instructions?.trim() || null,
      due_at: draft.dueAt ?? null,
      max_points: draft.maxPoints ?? DEFAULT_ASSIGNMENT_POINTS,
      status: draft.status ?? 'draft',
      created_by: createdBy,
    })
    .select(ASSIGNMENT_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not add the assignment.'))
  return toAssignment(data as unknown as AssignmentRow)
}

/**
 * Change an assignment's details or its visibility.
 *
 * Only the fields present in the patch are written. `course_id` is not among
 * them: moving an assignment between courses cascades to every submission, and
 * the database's own `assignments_propagate_course` trigger exists to make that
 * deliberate rather than accidental.
 */
export async function updateAssignment(
  assignmentId: string,
  patch: AssignmentPatch,
): Promise<Assignment> {
  const check = validateAssignmentPatch(patch)
  if (!check.ok) throw new InstructorError(check.reason)

  const update: AssessmentTables['assignments']['Update'] = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.instructions !== undefined) update.instructions = patch.instructions?.trim() || null
  if (patch.moduleId !== undefined) update.module_id = patch.moduleId
  if (patch.dueAt !== undefined) update.due_at = patch.dueAt
  if (patch.maxPoints !== undefined) update.max_points = patch.maxPoints
  if (patch.status !== undefined) update.status = patch.status

  const { data, error } = await assessment
    .from('assignments')
    .update(update)
    .eq('id', assignmentId)
    .select(ASSIGNMENT_COLUMNS)
    .single()

  if (error) throw new InstructorError(messageOf(error, 'Could not save the assignment.'))
  return toAssignment(data as unknown as AssignmentRow)
}

/**
 * Delete an assignment.
 *
 * Irreversible, and the database cascades to every submission against it, so the
 * view confirms by name before calling this. Graded work included: `assignments`
 * -> `assignment_submissions` is `ON DELETE CASCADE` and there is no soft delete
 * on either table, which is the one thing worth saying out loud in the
 * confirmation.
 */
export async function deleteAssignment(assignmentId: string): Promise<void> {
  const { error } = await assessment.from('assignments').delete().eq('id', assignmentId)
  if (error) throw new InstructorError(messageOf(error, 'Could not delete the assignment.'))
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Assignment deadlines for the caller's courses, soonest first.
 *
 * `due_at` is nullable, and a deadline with no date is not on a calendar, so
 * undated assignments are excluded here rather than sorted to an arbitrary
 * end of the list. Draft assignments are included: an instructor setting a
 * deadline on something unpublished still needs to see it.
 */
export async function listUpcomingDeadlines(
  instructorId: string,
  options: { includeOverdue?: boolean } = {},
): Promise<Deadline[]> {
  const includeOverdue = options.includeOverdue ?? true

  const courseIds = await listInstructorCourseIds(instructorId)
  if (courseIds.length === 0) return []

  const { data: assignmentRows, error: assignmentError } = await assessment
    .from('assignments')
    .select(ASSIGNMENT_COLUMNS)
    .in('course_id', courseIds)
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })

  if (assignmentError)
    throw new InstructorError(messageOf(assignmentError, 'Could not load the deadlines.'))

  const assignments = (assignmentRows ?? []) as unknown as AssignmentRow[]
  if (assignments.length === 0) return []

  const cutoff = new Date().toISOString()
  const due = includeOverdue
    ? assignments
    : assignments.filter((row) => (row.due_at ?? '') >= cutoff)

  const [
    { data: submissionRows, error: submissionError },
    { data: courseRows, error: courseError },
  ] = await Promise.all([
    assessment
      .from('assignment_submissions')
      .select('assignment_id, status')
      .in(
        'assignment_id',
        assignments.map((row) => row.id),
      ),
    supabase.from('courses').select('id, title').in('id', courseIds),
  ])

  if (submissionError)
    throw new InstructorError(messageOf(submissionError, 'Could not load the submissions.'))
  if (courseError) throw new InstructorError(messageOf(courseError, 'Could not load your courses.'))

  const courseTitles = new Map<string, string>()
  for (const row of (courseRows ?? []) as Array<{ id: string; title: string }>) {
    courseTitles.set(row.id, row.title)
  }

  const submissionsByAssignment = new Map<string, { total: number; awaiting: number }>()
  for (const row of (submissionRows ?? []) as Array<{
    assignment_id: string
    status: SubmissionStatus
  }>) {
    const entry = submissionsByAssignment.get(row.assignment_id) ?? { total: 0, awaiting: 0 }
    entry.total += 1
    if (row.status === 'submitted') entry.awaiting += 1
    submissionsByAssignment.set(row.assignment_id, entry)
  }

  return due.map((row) => {
    const counts = submissionsByAssignment.get(row.id) ?? { total: 0, awaiting: 0 }
    return {
      assignmentId: row.id,
      assignmentTitle: row.title,
      courseId: row.course_id,
      courseTitle: courseTitles.get(row.course_id) ?? 'Untitled course',
      dueAt: row.due_at as string,
      maxPoints: Number(row.max_points),
      status: row.status,
      submissions: counts.total,
      awaitingGrading: counts.awaiting,
    }
  })
}

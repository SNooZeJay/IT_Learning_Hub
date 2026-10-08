/**
 * Domain types for the IT Learning Hub LMS.
 *
 * Row shapes are DERIVED from the Supabase `Database` type rather than declared
 * twice. Postgres returns `snake_case` columns, and views consume camelCase
 * view models, so the conversion lives here at the boundary. Keeping one
 * authoritative row definition means a schema change is a single edit.
 */

import type { Database } from '@/services/supabase/types'
import type {
  AccountStatus,
  AssignmentStatus,
  AttemptStatus,
  ContentStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  MaterialType,
  PaymentStatus,
  ProgressStatus,
  QuestionType,
  QuizStatus,
  Role,
  SubmissionStatus,
} from './enums'

// ---------------------------------------------------------------------------
// Row shapes, straight from Postgres
// ---------------------------------------------------------------------------

export type {
  Role,
  AccountStatus,
  CourseStatus,
  CourseLevel,
  EnrollmentStatus,
  LessonType,
  ContentStatus,
  MaterialType,
  ProgressStatus,
  PaymentStatus,
  QuizStatus,
  QuestionType,
  AttemptStatus,
  AssignmentStatus,
  SubmissionStatus,
}

export {
  FILE_MATERIAL_TYPES,
  LINK_MATERIAL_TYPES,
  TEXT_MATERIAL_TYPES,
  materialIsInlineText,
  materialIsLink,
  materialNeedsFile,
} from './enums'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export type ProfileRow = Row<'profiles'>
export type CourseCategoryRow = Row<'course_categories'>
export type CourseRow = Row<'courses'>
export type CourseInstructorRow = Row<'course_instructors'>
export type ModuleRow = Row<'modules'>
export type LessonRow = Row<'lessons'>
export type LessonMaterialRow = Row<'lesson_materials'>
export type EnrollmentRow = Row<'enrollments'>
export type LessonProgressRow = Row<'lesson_progress'>
export type PaymentRow = Row<'payments'>
export type QuizRow = Row<'quizzes'>
export type QuizQuestionRow = Row<'quiz_questions'>
export type QuizOptionRow = Row<'quiz_options'>
export type QuizAttemptRow = Row<'quiz_attempts'>

// ---------------------------------------------------------------------------
// View models, what components actually consume
// ---------------------------------------------------------------------------

export interface Enrollment {
  id: string
  courseId: string
  studentId: string
  status: EnrollmentStatus
  enrolledAt: string
  completedAt: string | null
}

export interface Profile {
  id: string
  role: Role
  fullName: string
  email: string
  avatarUrl: string | null
  phone: string | null
  bio: string | null
  status: AccountStatus
}

export interface Course {
  id: string
  categoryId: string | null
  title: string
  slug: string
  description: string | null
  thumbnailUrl: string | null
  status: CourseStatus
  level: CourseLevel
  durationMinutes: number | null
  passingScore: number | null
  /** Stored in centavos. A course is paid when this is greater than zero. */
  priceCentavos: number
  createdBy: string
  publishedAt: string | null
}

export interface Module {
  id: string
  courseId: string
  title: string
  description: string | null
  position: number
  status: ContentStatus
}

export interface Lesson {
  id: string
  moduleId: string
  title: string
  /** One line for the course outline. The old system had this and the outline is unreadable without it. */
  summary: string | null
  content: string | null
  lessonType: LessonType
  position: number
  durationMinutes: number | null
  isPreview: boolean
  videoUrl: string | null
  status: ContentStatus
  /** Counts toward course progress and the complete_all_lessons requirement. */
  isRequired: boolean
}

/**
 * A learning material as the student sees it.
 *
 * Exactly one of `contentText`, `externalUrl` or `filePath` is set, and
 * `materialType` says which. The database enforces that in
 * `check_material_shape()`, so a rendering branch can rely on it rather than
 * guessing.
 */
export interface LessonMaterial {
  id: string
  lessonId: string
  title: string
  materialType: MaterialType
  position: number
  contentText: string | null
  externalUrl: string | null
  filePath: string | null
  fileType: string | null
  fileSize: number | null
  /** When the instructor added it. Metadata, not the organising principle. */
  createdAt: string
  updatedAt: string
}

/**
 * One student's progress through one lesson.
 *
 * `studentId` is denormalised onto the row, as it is in the old system, so
 * ownership is checkable without joining through the enrolment.
 */
export interface LessonProgress {
  id: string
  enrollmentId: string
  lessonId: string
  studentId: string | null
  status: ProgressStatus
  progressPercent: number | null
  lastPositionSeconds: number | null
  startedAt: string | null
  completedAt: string | null
}

/**
 * A lesson as it appears inside the course outline.
 *
 * The student's view and the instructor's view differ in exactly two ways, and
 * the type says so: an instructor sees drafts and can open the editor, and a
 * student's progress is attached. Everything else - the shape of the hierarchy -
 * is identical, which is what lets both sides share the same outline component.
 */
export interface CurriculumLesson extends Lesson {
  materials: LessonMaterial[]
  /** Null when the caller is not enrolled, so "not started" and "no record" stay distinguishable. */
  progress: LessonProgress | null
}

export interface CurriculumModule extends Module {
  lessons: CurriculumLesson[]
}

/** Counts used by the outline header, computed once rather than in the template. */
export interface CurriculumSummary {
  moduleCount: number
  lessonCount: number
  materialCount: number
  /** Only lessons the viewer may complete. Null when they are not enrolled at all. */
  completedLessonCount: number | null
  /** Percentage of required lessons completed, or null when there are none to complete. */
  completionPercent: number | null
}

/**
 * A quiz as the student sees it.
 *
 * Note what is absent: `isCorrect`. The shape a student receives has no field
 * that could carry the answer, so a rendering bug cannot leak the key even if it
 * dumps the whole object. The instructor's shape is a separate type.
 */
export interface QuizOption {
  id: string
  optionText: string
}

export interface QuizQuestion {
  id: string
  questionType: QuestionType
  prompt: string
  points: number
  position: number
  /** Empty for a short-text question. */
  options: QuizOption[]
}

export interface Quiz {
  id: string
  courseId: string
  moduleId: string | null
  lessonId: string | null
  title: string
  description: string | null
  /** Percentage, so 70 means 70%. */
  passingScore: number
  /** Always 1 to 3. Section 19.4 of the spec caps it at 3. */
  attemptsAllowed: number
  timeLimitMinutes: number | null
  shuffleQuestions: boolean
  revealAnswers: boolean
  status: QuizStatus
  questions: QuizQuestion[]
}

export interface QuizAttempt {
  id: string
  quizId: string
  courseId: string
  attemptNumber: number
  status: AttemptStatus
  score: number | null
  maxScore: number | null
  /** Percentage, so 70 means 70%. */
  percentage: number | null
  passed: boolean | null
  startedAt: string
  submittedAt: string | null
}

/**
 * What one graded question came back as.
 *
 * The three grading fields are optional, and that is not a shortcut.
 *
 * `submit_quiz_attempt` omits `is_correct`, `points` and `points_awarded` from its
 * payload entirely when the quiz has `reveal_answers` off, so that a student
 * cannot read the key out of the network response and use it on a later attempt.
 * The shape a result carries therefore depends on the quiz, and typing these as
 * required would be a lie the interface could act on - it would render a verdict
 * that the server never sent.
 *
 * Gate on `QuizResult.revealAnswers` before reading them. `questionId` is always
 * present, which is what lets the interface say how many questions were answered
 * even when it may not say which were right.
 */
export interface GradedAnswer {
  questionId: string
  /** Present only when the quiz reveals answers. */
  isCorrect?: boolean
  points?: number
  pointsAwarded?: number
  questionType?: QuestionType
  prompt?: string
  /** The answer in words. Behind the same flag as the boolean, because it gives the whole thing away. */
  explanation?: string | null
  /** What the student chose, so a review can tell their answer from the right one. */
  yourOptionId?: string | null
  options?: GradedOption[]
}

/** One option as it appears in a review. */
export interface GradedOption {
  id: string
  optionText: string
  isCorrect: boolean
}

/**
 * The result of submitting, as returned by the database.
 *
 * This is computed in Postgres from the answer key. The browser never derives it,
 * which is the only reason a student cannot simply claim they passed.
 */
export interface QuizResult {
  attemptId: string
  score: number
  maxScore: number
  percentage: number
  passed: boolean
  passingScore: number
  attemptsRemaining: number
  /** False for a quiz where only the outcome is disclosed. */
  revealAnswers: boolean
  answers: GradedAnswer[]
}

/**
 * Amounts live as integer centavos everywhere. PHP has two decimal places and
 * float arithmetic loses cents, so peso formatting happens only at the edge.
 */
export function formatPeso(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(centavos / 100)
}

/**
 * Plain-English names for the stored status values.
 *
 * A status is stored as a lowercase machine token because it is constrained by a
 * Postgres enum, but a screen that prints the token shows the reader the schema
 * rather than the state of their work. These are the only place a token becomes a
 * sentence, so the wording cannot drift between the admin tables, the instructor
 * views and the student views.
 *
 * Unknown values fall back to a readable sentence rather than the raw token: a
 * status added to the enum after this build still reads as a word, and the
 * fallback is visibly wrong rather than quietly technical.
 */

const ACCOUNT_STATUS_NAMES: Record<AccountStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
}

const COURSE_STATUS_NAMES: Record<CourseStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

const ENROLLMENT_STATUS_NAMES: Record<EnrollmentStatus, string> = {
  pending: 'Awaiting payment',
  active: 'In progress',
  completed: 'Completed',
  dropped: 'Dropped',
}

const CONTENT_STATUS_NAMES: Record<ContentStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

const QUIZ_STATUS_NAMES: Record<QuizStatus, string> = {
  draft: 'Not published',
  published: 'Published',
}

const ASSIGNMENT_STATUS_NAMES: Record<AssignmentStatus, string> = {
  draft: 'Not published',
  published: 'Published',
}

const SUBMISSION_STATUS_NAMES: Record<SubmissionStatus, string> = {
  submitted: 'Awaiting grade',
  graded: 'Graded',
}

const PAYMENT_STATUS_NAMES: Record<PaymentStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

const PROGRESS_STATUS_NAMES: Record<ProgressStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
}

/** Falls back to a capitalised word, never to the raw token. */
function readable(value: string): string {
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function accountStatusLabel(status: AccountStatus): string {
  return ACCOUNT_STATUS_NAMES[status] ?? readable(status)
}

export function courseStatusLabel(status: CourseStatus): string {
  return COURSE_STATUS_NAMES[status] ?? readable(status)
}

export function enrollmentStatusLabel(status: EnrollmentStatus): string {
  return ENROLLMENT_STATUS_NAMES[status] ?? readable(status)
}

export function contentStatusLabel(status: ContentStatus): string {
  return CONTENT_STATUS_NAMES[status] ?? readable(status)
}

export function quizStatusLabel(status: QuizStatus): string {
  return QUIZ_STATUS_NAMES[status] ?? readable(status)
}

export function assignmentStatusLabel(status: AssignmentStatus): string {
  return ASSIGNMENT_STATUS_NAMES[status] ?? readable(status)
}

export function submissionStatusLabel(status: SubmissionStatus): string {
  return SUBMISSION_STATUS_NAMES[status] ?? readable(status)
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_NAMES[status] ?? readable(status)
}

export function progressStatusLabel(status: ProgressStatus): string {
  return PROGRESS_STATUS_NAMES[status] ?? readable(status)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

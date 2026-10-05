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
  AttemptStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  PaymentStatus,
  ProgressStatus,
  QuestionType,
  QuizStatus,
  Role,
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
  ProgressStatus,
  PaymentStatus,
  QuizStatus,
  QuestionType,
  AttemptStatus,
}

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
}

export interface Lesson {
  id: string
  moduleId: string
  title: string
  content: string | null
  lessonType: LessonType
  position: number
  durationMinutes: number | null
  isPreview: boolean
  videoUrl: string | null
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

/** What one graded question came back as. */
export interface GradedAnswer {
  questionId: string
  isCorrect: boolean
  points: number
  pointsAwarded: number
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

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

/**
 * Domain types for the IT Learning Hub LMS.
 *
 * Row shapes are DERIVED from the Supabase `Database` type rather than declared
 * twice. Postgres returns `snake_case` columns, and views consume camelCase
 * view models, so the conversion lives here at the boundary. Keeping one
 * authoritative row definition means a schema change is a single edit.
 */

import type { Database } from '@/services/supabase/types'
import type { AccountStatus, CourseLevel, CourseStatus, EnrollmentStatus, LessonType, PaymentStatus, ProgressStatus, Role } from './enums'

// ---------------------------------------------------------------------------
// Row shapes, straight from Postgres
// ---------------------------------------------------------------------------

export type { Role, AccountStatus, CourseStatus, CourseLevel, EnrollmentStatus, LessonType, ProgressStatus, PaymentStatus }

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

// ---------------------------------------------------------------------------
// View models, what components actually consume
// ---------------------------------------------------------------------------

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
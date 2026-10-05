/**
 * String-literal unions describing the Postgres enums.
 *
 * Kept apart from `services/supabase/types.ts` because the `Database` type has
 * to reference them, and a type file that imports from the file it defines
 * creates a cycle. The `Database` enums are derived from these in that direction,
 * so this file is the single source for the allowed values.
 */

export type Role = 'admin' | 'instructor' | 'student'

export type AccountStatus = 'active' | 'invited' | 'suspended'

export type CourseStatus = 'draft' | 'published' | 'archived'

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'

/**
 * An enrolment sits `pending` between "student clicked enrol" and "payment
 * confirmed". A free course skips straight to `active`; a paid one cannot start
 * until PayMongo says the money arrived.
 */
export type EnrollmentStatus = 'pending' | 'active' | 'completed' | 'dropped'

export type LessonType = 'article' | 'video'

/**
 * Publication state for a module or a lesson.
 *
 * `draft` is visible only to the administrator and the instructor who owns the
 * course. `published` is what enrolled students and the public catalogue see.
 * `archived` is hidden from both but retained, so a lesson taken out of a course
 * does not destroy the progress recorded against it.
 *
 * The old Laravel system called this `ContentStatus` and used the same three
 * values on `modules` and `lessons`.
 */
export type ContentStatus = 'draft' | 'published' | 'archived'

/**
 * What a learning material actually is.
 *
 * The type decides the body shape, and the database enforces it in
 * `check_material_shape()`:
 *
 *   text, code                  -> `content_text`, no file
 *   video_link, external_link   -> `external_url`, no file
 *   image, pdf, document        -> an uploaded file, no inline body
 *
 * One enum with four body shapes is what the old system did, and it is why
 * `lesson_materials` could describe a reading-list link or a code snippet at all.
 */
export type MaterialType =
  'text' | 'image' | 'pdf' | 'document' | 'code' | 'video_link' | 'external_link'

/** Material types that require an uploaded file. */
export const FILE_MATERIAL_TYPES: readonly MaterialType[] = ['image', 'pdf', 'document']

/** Material types whose body is written inline as text. */
export const TEXT_MATERIAL_TYPES: readonly MaterialType[] = ['text', 'code']

/** Material types that are a link rather than a body. */
export const LINK_MATERIAL_TYPES: readonly MaterialType[] = ['video_link', 'external_link']

/** True when a material of this type needs an uploaded file. */
export function materialNeedsFile(type: MaterialType): boolean {
  return FILE_MATERIAL_TYPES.includes(type)
}

/** True when a material of this type is written inline. */
export function materialIsInlineText(type: MaterialType): boolean {
  return TEXT_MATERIAL_TYPES.includes(type)
}

/** True when a material of this type is a link to open. */
export function materialIsLink(type: MaterialType): boolean {
  return LINK_MATERIAL_TYPES.includes(type)
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

export type QuizStatus = 'draft' | 'published'

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_text'

export type AttemptStatus = 'in_progress' | 'submitted'

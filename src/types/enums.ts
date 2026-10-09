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

/**
 * The states a payment can be in.
 *
 * There is no `refunded`. It was in the database enum and in this type, and nothing
 * anywhere could set it: there is no refund action, no refund endpoint, and no
 * payment had ever held it. It existed only to render a tile that always read zero
 * and a panel that described a workflow the application does not have.
 */
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled'

export type QuizStatus = 'draft' | 'published'

/**
 * What a quiz question can be.
 *
 * Both remaining types are answered the same way: the student picks exactly one option
 * from two or more. `true_false` is not a separate kind of thing so much as
 * `multiple_choice` with two options, and it renders through the same control.
 *
 * `short_text` - a question the student typed an answer to - was removed. It is absent
 * here, and absent from the `question_type` enum in the database, so naming it is a
 * compile error rather than a runtime surprise.
 *
 * Removing it from this union is what surfaced the rest of the removal. Every
 * `questionType === 'short_text'` comparison in the codebase became a type error, and
 * TypeScript listed them - which is the only way to be sure the dead branches are all
 * gone instead of merely unreachable.
 */
export type QuestionType = 'multiple_choice' | 'true_false'

export type AttemptStatus = 'in_progress' | 'submitted'

/**
 * These five were missing from this file and from `supabase/types.ts` while the
 * database already had them and five services already queried the tables they
 * belong to. The cost of the gap was not a compile error - it was that every row
 * read through those services was untyped and narrowed with `as unknown as`, so a
 * renamed column would have been a runtime failure rather than a build failure.
 */
export type AssignmentStatus = 'draft' | 'published'

/** A submission moves from `submitted` to `graded` once an instructor marks it. */
export type SubmissionStatus = 'submitted' | 'graded'

/**
 * What has to be true before a course counts as complete.
 *
 * A course can require any combination of these, which is why it is a
 * many-to-many table rather than a column on `courses`.
 */
export type RequirementType = 'complete_all_lessons' | 'min_quiz_average' | 'submit_all_assignments'

/**
 * What a notification is about.
 *
 * `quiz_graded` and `assignment_graded` are the two a student waits for; the rest
 * are driven by payments, enrolment, certificates and announcements.
 */
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

/**
 * What the webhook made of a payment event.
 *
 * `ignored` and `failed` are kept rather than deleted, because a PayMongo
 * webhook that arrives twice - which it does, because it retries - has to be
 * recorded as seen and skipped rather than processed twice.
 */
export type PaymentEventStatus = 'received' | 'processed' | 'ignored' | 'failed'

/**
 * Whether a payment receipt has been sent.
 *
 * `pending` means a receipt is *owed* - the row is claimed but the mail has not been
 * accepted yet. `failed` is kept rather than folded into `pending` because a receipt a
 * student never received has to be visible to an operator; an undelivered receipt that
 * reads as "in progress" forever is indistinguishable from a mailer that is merely slow.
 */
export type PaymentReceiptStatus = 'pending' | 'sent' | 'failed'

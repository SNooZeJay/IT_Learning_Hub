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

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export type QuizStatus = 'draft' | 'published'

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_text'

export type AttemptStatus = 'in_progress' | 'submitted'

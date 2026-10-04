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

export type EnrollmentStatus = 'active' | 'completed' | 'dropped'

export type LessonType = 'article' | 'video'

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
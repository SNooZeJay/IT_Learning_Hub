import { supabase } from './supabase/client'
import {
  VALID,
  collect,
  decimalInRange,
  integerInRange,
  messageOf,
  oneOf,
  requiredText,
  slugField,
} from '@/validation'
import type { CourseRow, ModuleRow, LessonRow } from '@/types'
import type { Course, Lesson, Module } from '@/types'

/**
 * Every Supabase query about courses lives here.
 *
 * Row Level Security decides visibility. This file never asks "is this user an
 * instructor?" - the policies in migration 0001 answer that from
 * `course_instructors` and `enrollments`, so a query that should return nothing
 * returns nothing rather than being filtered here.
 *
 * Argument validation lives here too, not in the views. `CourseEditor.vue` calling
 * `createCourse` is the only caller, but the rule belongs with the write it protects, so
 * that the next caller inherits it rather than re-deriving it.
 */

/**
 * A course write that could not proceed.
 *
 * `fieldErrors` is present when the failure was the draft's shape rather than the
 * database's answer, so a form can attach each message to its input instead of printing
 * one sentence under the whole form.
 */
export class CourseError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'CourseError'
  }
}

const COURSE_COLUMNS =
  'id, category_id, title, slug, description, thumbnail_url, status, level, duration_minutes, passing_score, price_centavos, created_by, published_at, created_at, updated_at'

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

/** A published course is free when this is zero. No separate boolean to disagree with. */
export function isPaid(course: Pick<Course, 'priceCentavos'>): boolean {
  return course.priceCentavos > 0
}

/**
 * The catalogue. RLS already restricts this to published courses plus anything
 * the caller manages, so no status filter is applied here.
 */
export async function listCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .order('published_at', { ascending: false, nullsFirst: false })

  if (error) throw new CourseError(messageOf(error, 'The courses could not be loaded.'))
  return (data as CourseRow[]).map(toCourse)
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new CourseError(messageOf(error, 'That course could not be loaded.'))
  return data ? toCourse(data as CourseRow) : null
}

export async function getCourseById(id: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new CourseError(messageOf(error, 'That course could not be loaded.'))
  return data ? toCourse(data as CourseRow) : null
}

export async function listModules(courseId: string): Promise<Module[]> {
  const { data, error } = await supabase
    .from('modules')
    .select('id, course_id, title, description, position, status, created_at, updated_at')
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  if (error) throw new CourseError(messageOf(error, 'The modules could not be loaded.'))
  return (data as ModuleRow[]).map(toModule)
}

export async function listLessons(moduleIds: string[]): Promise<Lesson[]> {
  if (moduleIds.length === 0) return []

  const { data, error } = await supabase
    .from('lessons')
    .select(
      'id, module_id, title, content, lesson_type, position, duration_minutes, is_preview, video_url, created_at, updated_at',
    )
    .in('module_id', moduleIds)
    .order('position', { ascending: true })

  if (error) throw new CourseError(messageOf(error, 'The lessons could not be loaded.'))
  return (data as LessonRow[]).map(toLesson)
}

/**
 * A course with its modules and lessons, for the course page.
 *
 * Two round trips rather than one nested select on purpose: the nested form
 * silently returns empty modules when RLS hides a row, which looks identical to
 * "this course has no modules". Splitting them means a visible error instead of
 * a quietly blank page.
 */
export async function getCourseWithCurriculum(slug: string): Promise<{
  course: Course
  modules: Array<Module & { lessons: Lesson[] }>
} | null> {
  const course = await getCourseBySlug(slug)
  if (!course) return null

  const modules = await listModules(course.id)
  const lessons = await listLessons(modules.map((m) => m.id))

  return {
    course,
    modules: modules.map((module) => ({
      ...module,
      lessons: lessons.filter((lesson) => lesson.moduleId === module.id),
    })),
  }
}

export interface CourseDraft {
  title: string
  slug: string
  description?: string | null
  categoryId?: string | null
  level?: Course['level']
  priceCentavos?: number
  durationMinutes?: number | null
  passingScore?: number | null
}

/**
 * What a course draft must satisfy before it is written.
 *
 * This function validated nothing. Every field went into the insert with a `??` default,
 * so a blank title, a slug with a space in it, or a negative price reached Postgres and
 * came back as whatever the constraint happened to say - or, for the cases with no
 * constraint, as a stored row nobody wanted.
 *
 * Each rule names the constraint it mirrors, which is the only way to keep the two from
 * drifting:
 *
 *   title          courses_title_not_blank          (20261007090300)
 *   slug           unique index on courses.slug     (20261004170825)
 *   price          price_centavos >= 0              (20261004170825)
 *   duration       duration_minutes >= 0            (20261004170825)
 *   passingScore   passing_score between 0 and 100   (20261004170825)
 *
 * Returned as a Result rather than thrown, so `CourseEditor.vue` can put the message
 * beside the input that caused it - the `{ ok, reason }` shape
 * `instructor.service.ts` already established.
 */
export function validateCourseDraft(draft: CourseDraft):
  | {
      ok: true
    }
  | { ok: false; errors: Record<string, string> } {
  return collect([
    ['title', requiredText(draft.title, 'Course title', { max: 200 })],
    ['slug', slugField(draft.slug, 'Slug')],
    [
      'priceCentavos',
      draft.priceCentavos === undefined || draft.priceCentavos === null
        ? VALID
        : integerInRange(draft.priceCentavos, 'Price', 0, 100_000_00),
    ],
    [
      'durationMinutes',
      draft.durationMinutes === undefined || draft.durationMinutes === null
        ? VALID
        : integerInRange(draft.durationMinutes, 'Duration', 0, 100_000),
    ],
    [
      'passingScore',
      draft.passingScore === undefined || draft.passingScore === null
        ? VALID
        : decimalInRange(draft.passingScore, 'Passing score', 0, 100),
    ],
    [
      'level',
      draft.level === undefined
        ? VALID
        : oneOf(draft.level, ['beginner', 'intermediate', 'advanced'] as const, 'Level'),
    ],
    ['description', requiredText(draft.description ?? '', 'Description', { max: 5000 })],
  ])
}

/**
 * Create a draft course owned by the caller.
 *
 * Always created as a draft. Publishing is a separate, deliberate step, so a
 * half-built course cannot appear in the catalogue by accident.
 *
 * The draft is validated first. RLS is what stops a student creating a course at all,
 * and the database constraints are what stop a malformed one being stored - this is the
 * layer that makes the error a sentence a person can act on rather than a Postgres code.
 */
export async function createCourse(draft: CourseDraft, instructorId: string): Promise<Course> {
  const check = validateCourseDraft(draft)
  if (!check.ok) {
    throw new CourseError(Object.values(check.errors)[0], check.errors)
  }

  const { data, error } = await supabase
    .from('courses')
    .insert({
      title: draft.title.trim(),
      slug: draft.slug.trim(),
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

  if (error) throw new CourseError(messageOf(error, 'The course could not be created.'))

  // The creator becomes its instructor. Without this row the course would be
  // invisible to the person who made it, because is_instructor_of checks this
  // table and not courses.created_by.
  const { error: linkError } = await supabase
    .from('course_instructors')
    .insert({ course_id: (data as CourseRow).id, instructor_id: instructorId })

  if (linkError) {
    throw new CourseError(
      messageOf(
        linkError,
        'The course was created but could not be linked to you. Reload the page.',
      ),
    )
  }

  return toCourse(data as CourseRow)
}

import { supabase } from './supabase/client'
import type { CourseRow, ModuleRow, LessonRow  } from '@/types'
import type { Course, Lesson, Module } from '@/types'

/**
 * Every Supabase query about courses lives here.
 *
 * Row Level Security decides visibility. This file never asks "is this user an
 * instructor?" - the policies in migration 0001 answer that from
 * `course_instructors` and `enrollments`, so a query that should return nothing
 * returns nothing rather than being filtered here.
 */

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
  }
}

function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    content: row.content,
    lessonType: row.lesson_type,
    position: row.position,
    durationMinutes: row.duration_minutes,
    isPreview: row.is_preview,
    videoUrl: row.video_url,
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

  if (error) throw new Error(error.message)
  return (data as CourseRow[]).map(toCourse)
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toCourse(data as CourseRow) : null
}

export async function getCourseById(id: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toCourse(data as CourseRow) : null
}

export async function listModules(courseId: string): Promise<Module[]> {
  const { data, error } = await supabase
    .from('modules')
    .select('id, course_id, title, description, position, created_at, updated_at')
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)
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

  if (error) throw new Error(error.message)
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
 * Create a draft course owned by the caller.
 *
 * Always created as a draft. Publishing is a separate, deliberate step, so a
 * half-built course cannot appear in the catalogue by accident.
 */
export async function createCourse(
  draft: CourseDraft,
  instructorId: string,
): Promise<Course> {
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

  if (error) throw new Error(error.message)

  // The creator becomes its instructor. Without this row the course would be
  // invisible to the person who made it, because is_instructor_of checks this
  // table and not courses.created_by.
  const { error: linkError } = await supabase
    .from('course_instructors')
    .insert({ course_id: (data as CourseRow).id, instructor_id: instructorId })

  if (linkError) throw new Error(linkError.message)

  return toCourse(data as CourseRow)
}

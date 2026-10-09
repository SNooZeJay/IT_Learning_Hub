/**
 * The public catalogue's read model.
 *
 * Distinct from `listCourses` in course.service on purpose. That one is the
 * signed-in catalogue and returns whatever RLS allows, which for a visitor is
 * published courses and for an instructor is also their own drafts.
 *
 * This one answers a narrower question - "what can a stranger see?" - so it
 * aggregates the counts a card needs in the database rather than making the
 * browser fetch every module and lesson to count them. A card showing
 * "3 modules / 6 lessons" should not cost six round trips to render.
 */

import { supabase } from './supabase/client'
import { humanizeError } from './errors'
import type { CourseRow } from '@/types'
import type { Course, CourseLevel } from '@/types'

/**
 * A database refusal, turned into a sentence a visitor can act on.
 *
 * This file was the last place in `src/services` that threw `error.message` verbatim,
 * and it was the only one a *signed-out* visitor could reach - so the catalogue's error
 * state was the one surface in the product that printed database output at a stranger:
 *
 *     Could not load the catalogue
 *     permission denied for function is_admin
 *
 * Every other service already routes through `humanizeError`. A raw refusal here becomes
 * "Courses could not be loaded. Try again in a moment." instead, which says what happened
 * and what to do, and keeps the function name out of the page. The database still decides
 * what may be read; this only decides how a refusal is worded.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

/** A course plus the published counts a catalogue card displays. */
export interface CatalogueCourse extends Course {
  moduleCount: number
  lessonCount: number
  categoryName: string | null
}

export interface CatalogueCategory {
  id: string
  name: string
  slug: string
  courseCount: number
}

interface EmbeddedModule {
  id: string
  position: number | null
  lessons: Array<{ id: string; position: number | null }> | null
}

interface CatalogueRow extends CourseRow {
  course_categories: { name: string } | { name: string }[] | null
  modules: EmbeddedModule[] | null
}

/**
 * The whole catalogue in one query.
 *
 * Counts come from nested embeds, not correlated subqueries, because PostgREST
 * does not support subqueries in `select` at all - verified against the live API,
 * where `(select count(*) from modules ...)` returns 400. There is no `count`
 * aggregate hint either. So the rows are embedded and counted here.
 *
 * Only `id` and `position` are requested from modules and lessons. That is not
 * tidiness: an anonymous visitor's grant on those tables is COLUMN-level
 * (migration 0005), so asking for `lessons.content` fails with permission denied
 * rather than quietly returning less. Requesting exactly what the public outline
 * shows keeps the query aligned with the grant that backs it.
 *
 * The embed is `course_categories`, not `categories`. The relationship is named
 * after the table, and using the shorter name is a 400 from the API.
 */
const CATALOGUE_SELECT = `
  id, category_id, title, slug, description, thumbnail_url, status, level,
  duration_minutes, passing_score, price_centavos, created_by, published_at,
  created_at, updated_at,
  course_categories!left(name),
  modules(id, position, lessons(id, position))
`

/**
 * Published courses, newest first then by title.
 *
 * The status filter is applied here as well as in RLS. RLS is what actually
 * enforces the rule and this filter is a convenience on top of it - a visitor
 * cannot widen the result by editing the query, because the policy rejects the
 * draft rows regardless.
 */
export async function listPublishedCourses(): Promise<CatalogueCourse[]> {
  const { data, error } = await supabase
    .from('courses')
    .select(CATALOGUE_SELECT)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true })

  if (error)
    throw new Error(messageOf(error, 'Courses could not be loaded. Try again in a moment.'))

  return ((data ?? []) as unknown as CatalogueRow[]).map((row) => {
    const modules = row.modules ?? []
    // PostgREST returns an embedded to-one as an object or as an array depending
    // on whether it inferred a one-to-one or a one-to-many relationship.
    // Normalise here so no caller has to know that.
    const joined = row.course_categories
    const category = (Array.isArray(joined) ? joined[0] : joined) as { name: string } | null

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
      moduleCount: modules.length,
      lessonCount: modules.reduce((total, module) => total + (module.lessons?.length ?? 0), 0),
      categoryName: category?.name ?? null,
    }
  })
}

/** One lesson as the public outline is allowed to show it. */
export interface PublicLesson {
  id: string
  title: string
  position: number | null
  durationMinutes: number | null
}

/** One module as the public outline is allowed to show it. */
export interface PublicModule {
  id: string
  title: string
  position: number | null
  lessons: PublicLesson[]
}

/**
 * The public course page's outline: structure only.
 *
 * This deliberately does NOT reuse `getCourseWithCurriculum` from
 * course.service, even though that function looks like the obvious choice. That
 * one is the instructor's read model and it selects `modules.description` and
 * `lessons.content`, which are the paid material. Against an anonymous visitor
 * the database correctly refuses - `permission denied for table modules` - so the
 * page rendered its error state instead of an outline.
 *
 * Refusing is the right behaviour and the bug is the query, not the policy. The
 * public page requests only the four module columns and five lesson columns that
 * the anonymous grant allows, which is exactly the "Module and lesson titles
 * only" rule from the product spec.
 *
 * Two round trips rather than a nested select, matching course.service's
 * reasoning: a nested select silently returns empty when a row is hidden, which
 * is indistinguishable from a course with no modules. Two calls give a visible
 * error instead of a quietly blank outline.
 */
export async function getPublicCourseOutline(courseId: string): Promise<PublicModule[]> {
  const { data: moduleRows, error: moduleError } = await supabase
    .from('modules')
    .select('id, title, position')
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  if (moduleError)
    throw new Error(messageOf(moduleError, 'This course outline could not be loaded.'))

  const modules = (moduleRows ?? []) as Array<{
    id: string
    title: string
    position: number | null
  }>
  if (modules.length === 0) return []

  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select('id, module_id, title, position, duration_minutes')
    .in(
      'module_id',
      modules.map((m) => m.id),
    )
    .order('position', { ascending: true })

  if (lessonError)
    throw new Error(messageOf(lessonError, 'This course outline could not be loaded.'))

  const lessons = (lessonRows ?? []) as Array<{
    id: string
    module_id: string
    title: string
    position: number | null
    duration_minutes: number | null
  }>

  return modules.map((module) => ({
    id: module.id,
    title: module.title,
    position: module.position,
    lessons: lessons
      .filter((lesson) => lesson.module_id === module.id)
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        position: lesson.position,
        durationMinutes: lesson.duration_minutes,
      })),
  }))
}

/**
 * Categories that published courses actually use.
 *
 * A category that only ever appeared on a draft is not a way for a visitor to
 * browse anything, so offering it as a filter would be a dead end dressed up as
 * an option. Counting from the published set rather than the category table is
 * what makes that guarantee.
 */
export async function listCatalogueCategories(): Promise<CatalogueCategory[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('category_id, course_categories!left(id, name, slug)')
    .eq('status', 'published')
    .not('category_id', 'is', null)

  if (error) throw new Error(messageOf(error, 'Categories could not be loaded.'))

  const byId = new Map<string, CatalogueCategory>()
  for (const row of (data ?? []) as Array<{
    category_id: string | null
    course_categories: { id: string; name: string; slug: string } | null
  }>) {
    const joined = row.course_categories
    const category = (Array.isArray(joined) ? joined[0] : joined) as {
      id: string
      name: string
      slug: string
    } | null
    if (!category || byId.has(category.id)) continue
    byId.set(category.id, { ...category, courseCount: 0 })
  }

  for (const row of data ?? []) {
    if (!row.category_id) continue
    const entry = byId.get(row.category_id)
    if (entry) entry.courseCount += 1
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The levels a visitor can filter by, spelled the way the UI spells them. */
export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

/**
 * "Free" or a peso amount, and never a decimal peso.
 *
 * The stored value is integer centavos, so rounding happens once, here, rather
 * than at each call site. Every surface showing a price - the catalogue card,
 * the landing page's featured card - spells ₱1,500 the same way, and no
 * floating-point peso can reach a screen.
 *
 * This was a private helper duplicated in two components before it was lifted
 * here, which is the exact "one decision written twice" problem this file's
 * read-model comments keep warning about.
 */
export function formatPrice(priceCentavos: number): string {
  if (priceCentavos <= 0) return 'Free'
  return `₱${(priceCentavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

/**
 * A course's runtime, phrased the way a person would say it.
 *
 * "3 hr 30 min" rather than "210 minutes", and never "0 hr" - a course under an
 * hour reads as minutes, which is the unit the number is actually in.
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} hr`
  return `${hours} hr ${rest} min`
}

export type PriceFilter = 'all' | 'free' | 'paid'

/**
 * Filter and search the catalogue.
 *
 * Two rules here are about robustness rather than features. Search matches the
 * title ONLY - never the description or objectives - because a search that
 * matched prose would return courses that read plausibly but teach something
 * else. And an unrecognised filter value is ignored rather than rejected, so a
 * hand-edited or stale URL still renders a page instead of an error.
 */
export function filterCatalogue(
  courses: CatalogueCourse[],
  filters: {
    search: string
    categoryId: string | null
    level: CourseLevel | 'all'
    price: PriceFilter
  },
): CatalogueCourse[] {
  const needle = filters.search.trim().toLowerCase().slice(0, 100)

  return courses.filter((course) => {
    if (needle && !course.title.toLowerCase().includes(needle)) return false
    if (filters.categoryId && course.categoryId !== filters.categoryId) return false
    if (filters.level !== 'all' && course.level !== filters.level) return false
    if (filters.price === 'free' && course.priceCentavos > 0) return false
    if (filters.price === 'paid' && course.priceCentavos <= 0) return false
    return true
  })
}

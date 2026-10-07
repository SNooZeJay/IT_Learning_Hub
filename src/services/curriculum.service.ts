import { supabase } from '@/services/supabase/client'
import type { Database } from '@/services/supabase/types'
import { isSafeUrl } from '@/validation'
// The dashboard caches module ids per course; a curriculum write invalidates it.
import { forgetModuleCache } from '@/services/dashboard.service'
import type {
  ContentStatus,
  CurriculumLesson,
  CurriculumModule,
  CurriculumSummary,
  Lesson,
  LessonMaterial,
  LessonProgress,
  MaterialType,
  Module,
  ProgressStatus,
} from '@/types'

/**
 * The Course -> Module -> Lesson -> Material hierarchy.
 *
 * This is the single place the shape is assembled. Both the student's outline and
 * the instructor's editor read from it, which is what keeps the two consistent
 * by construction rather than by two code paths happening to agree.
 *
 * It mirrors the old Laravel system, which is the functional reference:
 * `EnrollmentController@show` eager-loads published modules and published
 * lessons ordered by position, and `Instructor\CourseController@show` loads the
 * same chain with every status. The difference between those two is one filter,
 * so the difference here is one option rather than two functions.
 *
 * Deliberately four queries rather than one nested select. A nested
 * `modules(lessons(lesson_materials(*)))` silently returns empty modules when
 * RLS hides a row, which is indistinguishable from "this course has no content".
 * Splitting them means a permission problem surfaces as an error instead of a
 * blank page - the reason the original nested call was already avoided in
 * `course.service.ts`.
 */

type ModuleRow = Database['public']['Tables']['modules']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type MaterialRow = Database['public']['Tables']['lesson_materials']['Row']
type ProgressRow = Database['public']['Tables']['lesson_progress']['Row']

export class CurriculumError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'CurriculumError'
  }
}

function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string' && m.trim() !== '') return m
  }
  return fallback
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

function toMaterial(row: MaterialRow): LessonMaterial {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    title: row.title,
    materialType: row.material_type,
    position: row.position,
    contentText: row.content_text,
    externalUrl: row.external_url,
    filePath: row.file_path,
    fileType: row.file_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toProgress(row: ProgressRow): LessonProgress {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    status: row.status,
    progressPercent: row.progress_percent,
    lastPositionSeconds: row.last_position_seconds,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

export interface LoadCurriculumOptions {
  courseId: string
  /**
   * The enrolment this progress belongs to. Omit for an instructor or a
   * prospective student, who has no progress to attach.
   */
  enrollmentId?: string | null
  /**
   * Include draft and archived rows.
   *
   * Only the instructor editing their own course may ask for this, and RLS
   * enforces that: a student requesting drafts gets an empty result rather than
   * an error, because the rows are filtered out before they are read. That is
   * correct behaviour and is why the flag is not a security control.
   */
  includeUnpublished?: boolean
}

export interface Curriculum {
  modules: CurriculumModule[]
  /** Always populated by the loader; null only in an uninitialised ref. */
  summary: CurriculumSummary
}

function summarise(modules: CurriculumModule[], enrolled: boolean): CurriculumSummary {
  const lessons = modules.flatMap((m) => m.lessons)
  const materialCount = lessons.reduce((n, l) => n + l.materials.length, 0)

  if (!enrolled) {
    // A prospective student has not started, and "0 of 12 complete" would read as
    // failure rather than as not having begun. Null keeps the two apart.
    return {
      moduleCount: modules.length,
      lessonCount: lessons.length,
      materialCount,
      completedLessonCount: null,
      completionPercent: null,
    }
  }

  const required = lessons.filter((l) => l.isRequired)
  const done = required.filter((l) => l.progress?.status === 'completed').length

  return {
    moduleCount: modules.length,
    lessonCount: lessons.length,
    materialCount,
    completedLessonCount: done,
    // A course with no required lessons has nothing to complete. Null rather than
    // a confident 100%, which would be a claim the data does not support.
    completionPercent: required.length === 0 ? null : Math.round((done / required.length) * 100),
  }
}

/**
 * Load the whole hierarchy for a course.
 *
 * Ordering is `position` everywhere, matching the old system, which ordered by
 * `modules.position` then `lessons.position` in the query rather than in Blade.
 */
export async function loadCurriculum(options: LoadCurriculumOptions): Promise<Curriculum> {
  const { courseId, enrollmentId = null, includeUnpublished = false } = options

  const { data: moduleRows, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id, title, description, position, status')
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  if (moduleError) {
    throw new CurriculumError(
      messageOf(moduleError, 'Could not load the modules for this course.'),
      moduleError,
    )
  }

  const modules = (moduleRows ?? []) as ModuleRow[]

  // A draft module hides its lessons too. An instructor sees drafts inside draft
  // modules; a student never sees either.
  const visibleModules = includeUnpublished
    ? modules
    : modules.filter((m) => m.status === 'published')

  if (visibleModules.length === 0) {
    return { modules: [], summary: summarise([], enrollmentId !== null) }
  }

  const moduleIds = visibleModules.map((m) => m.id)

  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, module_id, title, summary, content, lesson_type, position, duration_minutes, is_preview, video_url, status, is_required',
    )
    .in('module_id', moduleIds)
    .order('position', { ascending: true })

  if (lessonError) {
    throw new CurriculumError(
      messageOf(lessonError, 'Could not load the lessons for this course.'),
      lessonError,
    )
  }

  const lessons = ((lessonRows ?? []) as LessonRow[]).filter((l) =>
    includeUnpublished ? true : l.status === 'published',
  )

  if (lessons.length === 0) {
    return {
      modules: visibleModules.map((m) => ({ ...toModule(m), lessons: [] })),
      summary: summarise(
        visibleModules.map((m) => ({ ...toModule(m), lessons: [] })),
        enrollmentId !== null,
      ),
    }
  }

  const lessonIds = lessons.map((l) => l.id)

  const [materialsResult, progressResult] = await Promise.all([
    supabase
      .from('lesson_materials')
      .select(
        'id, lesson_id, title, material_type, position, content_text, external_url, file_path, file_type, file_size, created_at, updated_at',
      )
      .in('lesson_id', lessonIds)
      .order('position', { ascending: true }),

    enrollmentId
      ? supabase
          .from('lesson_progress')
          .select(
            'id, enrollment_id, lesson_id, student_id, status, progress_percent, last_position_seconds, started_at, completed_at',
          )
          .eq('enrollment_id', enrollmentId)
          .in('lesson_id', lessonIds)
      : Promise.resolve({ data: [] as ProgressRow[], error: null }),
  ])

  if (materialsResult.error) {
    throw new CurriculumError(
      messageOf(materialsResult.error, 'Could not load the learning materials.'),
      materialsResult.error,
    )
  }

  if (progressResult.error) {
    // Progress failing is not the same as content failing. The outline is still
    // worth showing without it, so this is a soft failure rather than a throw -
    // but it is surfaced rather than swallowed, because a silent empty progress
    // set is indistinguishable from a student who has done nothing.
    console.error('[curriculum] progress could not be loaded:', progressResult.error.message)
  }

  const materialsByLesson = groupBy(
    (materialsResult.data ?? []) as MaterialRow[],
    (m) => m.lesson_id,
  )
  const progressByLesson = new Map<string, LessonProgress>()
  for (const row of (progressResult.data ?? []) as ProgressRow[]) {
    progressByLesson.set(row.lesson_id, toProgress(row))
  }

  const lessonsByModule = groupBy(lessons, (l) => l.module_id)

  const curriculum: CurriculumModule[] = visibleModules.map((m) => ({
    ...toModule(m),
    lessons: (lessonsByModule.get(m.id) ?? []).map<CurriculumLesson>((l) => ({
      ...toLesson(l),
      materials: (materialsByLesson.get(l.id) ?? []).map(toMaterial),
      progress: progressByLesson.get(l.id) ?? null,
    })),
  }))

  return { modules: curriculum, summary: summarise(curriculum, enrollmentId !== null) }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = out.get(k)
    if (bucket) bucket.push(row)
    else out.set(k, [row])
  }
  return out
}

/**
 * One lesson with its materials, plus the course and module it belongs to.
 *
 * The lesson page needs the whole chain, not just the lesson, because it has to
 * show where the learner is: which course, which module, and what comes next.
 * Resolving a lesson id to its course by hand at the call site is where the
 * cross-course guard usually gets forgotten.
 */
export interface LessonWithContext {
  lesson: Lesson
  materials: LessonMaterial[]
  module: Module
  courseId: string
  progress: LessonProgress | null
  /** The learner's position in the course, for prev/next and the sidebar. */
  previous: { id: string; title: string } | null
  next: { id: string; title: string } | null
}

export async function loadLesson(
  lessonId: string,
  enrollmentId?: string | null,
): Promise<LessonWithContext | null> {
  const { data: lessonRow, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, module_id, title, summary, content, lesson_type, position, duration_minutes, is_preview, video_url, status, is_required',
    )
    .eq('id', lessonId)
    .maybeSingle()

  if (lessonError) {
    throw new CurriculumError(messageOf(lessonError, 'Could not open this lesson.'), lessonError)
  }
  if (!lessonRow) return null

  const lesson = lessonRow as LessonRow

  const { data: moduleRow, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id, title, description, position, status')
    .eq('id', lesson.module_id)
    .maybeSingle()

  if (moduleError) {
    throw new CurriculumError(messageOf(moduleError, 'Could not open this module.'), moduleError)
  }
  if (!moduleRow) return null

  const module = moduleRow as ModuleRow

  const [{ data: materialRows, error: materialError }, progress, flat] = await Promise.all([
    supabase
      .from('lesson_materials')
      .select(
        'id, lesson_id, title, material_type, position, content_text, external_url, file_path, file_type, file_size, created_at, updated_at',
      )
      .eq('lesson_id', lessonId)
      .order('position', { ascending: true }),

    enrollmentId
      ? supabase
          .from('lesson_progress')
          .select(
            'id, enrollment_id, lesson_id, student_id, status, progress_percent, last_position_seconds, started_at, completed_at',
          )
          .eq('enrollment_id', enrollmentId)
          .eq('lesson_id', lessonId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    loadFlatLessonSequence(module.course_id),
  ])

  if (materialError) {
    throw new CurriculumError(
      messageOf(materialError, 'Could not load the learning materials for this lesson.'),
      materialError,
    )
  }

  const sequence = flat ?? []
  const index = sequence.findIndex((l) => l.id === lessonId)

  return {
    lesson: toLesson(lesson),
    materials: ((materialRows ?? []) as MaterialRow[]).map(toMaterial),
    module: toModule(module),
    courseId: module.course_id,
    progress: progress.data ? toProgress(progress.data as ProgressRow) : null,
    previous: index > 0 ? { id: sequence[index - 1].id, title: sequence[index - 1].title } : null,
    next:
      index >= 0 && index < sequence.length - 1
        ? { id: sequence[index + 1].id, title: sequence[index + 1].title }
        : null,
  }
}

/** Every published lesson in a course, in reading order. Used for prev/next. */
async function loadFlatLessonSequence(
  courseId: string,
): Promise<Array<{ id: string; title: string }> | null> {
  const { data, error } = await supabase
    .from('modules')
    .select('id, status')
    .eq('course_id', courseId)
    .eq('status', 'published')
    .order('position', { ascending: true })

  if (error || !data || data.length === 0) return null

  const { data: lessonRows, error: lessonError } = await supabase
    .from('lessons')
    .select('id, module_id, title, position')
    .in(
      'module_id',
      (data as Array<{ id: string }>).map((m) => m.id),
    )
    .eq('status', 'published')
    .order('position', { ascending: true })

  if (lessonError || !lessonRows) return null

  // One flat reading order: modules by position, then lessons by position within
  // each. Sorting the joined list by module position first is what makes "next"
  // follow the course rather than the database's arbitrary return order.
  const moduleOrder = new Map((data as Array<{ id: string }>).map((m, i) => [m.id, i]))
  return ((lessonRows ?? []) as Array<{ id: string; module_id: string; title: string }>)
    .sort((a, b) => (moduleOrder.get(a.module_id) ?? 0) - (moduleOrder.get(b.module_id) ?? 0))
    .map((l) => ({ id: l.id, title: l.title }))
}

/**
 * Record that a student opened a lesson.
 *
 * This is the `RecordLessonActivity` action from the old system, which marked a
 * lesson `in_progress` on first view and stamped `last_viewed_at` on every view.
 * Writing it here rather than in a database trigger keeps the write attributable
 * and lets the student see a real `started_at`.
 *
 * The upsert leans on `unique (enrollment_id, lesson_id)`, which is what makes it
 * safe to call on every lesson view without counting rows first.
 */
export async function recordLessonActivity(enrollmentId: string, lessonId: string): Promise<void> {
  const now = new Date().toISOString()

  const { error } = await supabase.from('lesson_progress').upsert(
    {
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      // The RLS policy `lesson_progress own write` compares this to auth.uid().
      // It is denormalised onto the row precisely so that check is a column
      // comparison instead of a join through the enrolment.
      student_id: (await currentUserId()) ?? null,
      status: 'in_progress',
      started_at: now,
    },
    { onConflict: 'enrollment_id,lesson_id', ignoreDuplicates: false },
  )

  if (error) {
    throw new CurriculumError(
      messageOf(error, 'Could not record your progress on this lesson.'),
      error,
    )
  }
}

/**
 * Mark a lesson complete.
 *
 * Complete is a one-way door: there is no "mark as not complete". The old system
 * behaved the same way, and it matters because a certificate requirement counts
 * completed lessons - letting a student retract completion would let them satisfy
 * a requirement by removing the evidence.
 */
export async function completeLesson(enrollmentId: string, lessonId: string): Promise<void> {
  const now = new Date().toISOString()
  const studentId = await currentUserId()

  const { error } = await supabase.from('lesson_progress').upsert(
    {
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      student_id: studentId ?? null,
      status: 'completed',
      progress_percent: 100,
      started_at: now,
      completed_at: now,
    },
    { onConflict: 'enrollment_id,lesson_id', ignoreDuplicates: false },
  )

  if (error) {
    throw new CurriculumError(messageOf(error, 'Could not mark this lesson complete.'), error)
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// ---------------------------------------------------------------------------
// Instructor writes
// ---------------------------------------------------------------------------

/**
 * The next position for a new row in an ordered chain.
 *
 * `modules` and `lessons` both carry a unique constraint on
 * (parent, position), so a collision is refused by the database rather than
 * silently renumbered. Appending is what an instructor expects while building a
 * course, and it keeps "add" from having to ask where to put things.
 */
export async function nextPosition(
  table: 'modules' | 'lessons',
  parentColumn: 'course_id' | 'module_id',
  parentId: string,
): Promise<number> {
  // Branched rather than `supabase.from(table)`. The generated client types a
  // union of two tables, and the query builder's `.eq()` cannot accept a column
  // name that is a union across them. Two honest calls beat one that needs a
  // cast to compile.
  const { data, error } =
    table === 'modules'
      ? await supabase
          .from('modules')
          .select('position')
          .eq('course_id', parentId)
          .order('position', { ascending: false })
          .limit(1)
      : await supabase
          .from('lessons')
          .select('position')
          .eq('module_id', parentId)
          .order('position', { ascending: false })
          .limit(1)

  if (error) throw new CurriculumError(messageOf(error, 'Could not read the current order.'), error)

  const last = (data ?? [])[0] as { position: number } | undefined
  return (last?.position ?? 0) + 1
}

/**
 * Move a module or a lesson to a new position, shifting the rest.
 *
 * Both tables carry unique (parent, position), so a naive write collides. The
 * whole reorder runs in one statement: PostgREST applies it as a single
 * transaction, and the two-step "clear the slot, then set it" alternative leaves
 * a window where a reader sees a gap.
 */
export async function reorder(
  table: 'modules' | 'lessons',
  parentColumn: 'course_id' | 'module_id',
  parentId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return

  const { error } = await supabase.rpc('reorder_curriculum', {
    p_table: table,
    p_parent_column: parentColumn,
    p_parent_id: parentId,
    p_ordered_ids: orderedIds,
  })

  if (error) {
    throw new CurriculumError(messageOf(error, 'Could not save the new order.'), error)
  }

  // The dashboard caches module ids per course, and nothing else observes a
  // reorder. Invalidated here rather than at a call site because this function
  // is the only thing that performs the write, and a caller that forgets is a
  // stale dashboard that only a full reload clears.
  if (table === 'modules') {
    forgetModuleCache(parentId)
  }
}

export interface ModuleDraft {
  title: string
  description?: string | null
  /** Omit to publish immediately. Instructors stage by default. */
  status?: ContentStatus
}

export async function createModule(courseId: string, draft: ModuleDraft): Promise<Module> {
  const position = await nextPosition('modules', 'course_id', courseId)

  const { data, error } = await supabase
    .from('modules')
    .insert({
      course_id: courseId,
      title: draft.title,
      description: draft.description ?? null,
      position,
      status: draft.status ?? 'draft',
    })
    .select('id, course_id, title, description, position, status')
    .single()

  if (error) throw new CurriculumError(messageOf(error, 'Could not add the module.'), error)
  return toModule(data as ModuleRow)
}

export async function updateModule(moduleId: string, patch: Partial<ModuleDraft>): Promise<Module> {
  const update: Database['public']['Tables']['modules']['Update'] = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description
  if (patch.status !== undefined) update.status = patch.status

  const { data, error } = await supabase
    .from('modules')
    .update(update)
    .eq('id', moduleId)
    .select('id, course_id, title, description, position, status')
    .single()

  if (error) throw new CurriculumError(messageOf(error, 'Could not save the module.'), error)
  return toModule(data as ModuleRow)
}

export async function deleteModule(moduleId: string): Promise<void> {
  const { error } = await supabase.from('modules').delete().eq('id', moduleId)
  if (error) throw new CurriculumError(messageOf(error, 'Could not delete the module.'), error)
}

export interface LessonDraft {
  title: string
  summary?: string | null
  content?: string | null
  lessonType?: Lesson['lessonType']
  durationMinutes?: number | null
  isPreview?: boolean
  videoUrl?: string | null
  isRequired?: boolean
  status?: ContentStatus
}

export async function createLesson(moduleId: string, draft: LessonDraft): Promise<Lesson> {
  const position = await nextPosition('lessons', 'module_id', moduleId)

  const { data, error } = await supabase
    .from('lessons')
    .insert({
      module_id: moduleId,
      title: draft.title,
      summary: draft.summary ?? null,
      content: draft.content ?? null,
      lesson_type: draft.lessonType ?? 'article',
      position,
      duration_minutes: draft.durationMinutes ?? null,
      is_preview: draft.isPreview ?? false,
      video_url: draft.videoUrl ?? null,
      is_required: draft.isRequired ?? true,
      status: draft.status ?? 'draft',
    })
    .select(
      'id, module_id, title, summary, content, lesson_type, position, duration_minutes, is_preview, video_url, status, is_required',
    )
    .single()

  if (error) throw new CurriculumError(messageOf(error, 'Could not add the lesson.'), error)
  return toLesson(data as LessonRow)
}

export async function updateLesson(lessonId: string, patch: Partial<LessonDraft>): Promise<Lesson> {
  const update: Database['public']['Tables']['lessons']['Update'] = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.content !== undefined) update.content = patch.content
  if (patch.lessonType !== undefined) update.lesson_type = patch.lessonType
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes
  if (patch.isPreview !== undefined) update.is_preview = patch.isPreview
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl
  if (patch.isRequired !== undefined) update.is_required = patch.isRequired
  if (patch.status !== undefined) update.status = patch.status

  const { data, error } = await supabase
    .from('lessons')
    .update(update)
    .eq('id', lessonId)
    .select(
      'id, module_id, title, summary, content, lesson_type, position, duration_minutes, is_preview, video_url, status, is_required',
    )
    .single()

  if (error) throw new CurriculumError(messageOf(error, 'Could not save the lesson.'), error)
  return toLesson(data as LessonRow)
}

export async function deleteLesson(lessonId: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
  if (error) throw new CurriculumError(messageOf(error, 'Could not delete the lesson.'), error)
}

export interface MaterialDraft {
  title: string
  materialType: MaterialType
  contentText?: string | null
  externalUrl?: string | null
  filePath?: string | null
  fileType?: string | null
  fileSize?: number | null
}

/**
 * Add a material to a lesson.
 *
 * The type decides which body field is used, and `check_material_shape()` in the
 * database refuses the combination that does not make sense - a text material
 * with a file, a pdf without one, a link with neither content nor URL. Validating
 * here as well means the instructor gets a sentence they can act on rather than a
 * constraint name.
 */
export async function createMaterial(
  lessonId: string,
  draft: MaterialDraft,
): Promise<LessonMaterial> {
  const { data: positionRows, error: positionError } = await supabase
    .from('lesson_materials')
    .select('position')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: false })
    .limit(1)

  if (positionError) {
    throw new CurriculumError(
      messageOf(positionError, 'Could not read the material order.'),
      positionError,
    )
  }

  const last = (positionRows ?? [])[0] as { position: number } | undefined

  const { data, error } = await supabase
    .from('lesson_materials')
    .insert({
      lesson_id: lessonId,
      title: draft.title,
      material_type: draft.materialType,
      content_text: draft.contentText ?? null,
      external_url: draft.externalUrl ?? null,
      file_path: draft.filePath ?? null,
      file_type: draft.fileType ?? null,
      file_size: draft.fileSize ?? null,
      position: (last?.position ?? 0) + 1,
      uploaded_by: (await currentUserId()) ?? null,
    })
    .select(
      'id, lesson_id, title, material_type, position, content_text, external_url, file_path, file_type, file_size, created_at, updated_at',
    )
    .single()

  if (error) throw new CurriculumError(messageOf(error, 'Could not add the material.'), error)
  return toMaterial(data as MaterialRow)
}

export async function updateMaterial(
  materialId: string,
  patch: Partial<MaterialDraft>,
): Promise<LessonMaterial> {
  const update: Database['public']['Tables']['lesson_materials']['Update'] = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.materialType !== undefined) update.material_type = patch.materialType
  if (patch.contentText !== undefined) update.content_text = patch.contentText
  if (patch.externalUrl !== undefined) update.external_url = patch.externalUrl
  if (patch.filePath !== undefined) update.file_path = patch.filePath
  if (patch.fileType !== undefined) update.file_type = patch.fileType
  if (patch.fileSize !== undefined) update.file_size = patch.fileSize

  const { data, error } = await supabase
    .from('lesson_materials')
    .update(update)
    .eq('id', materialId)
    .select(
      'id, lesson_id, title, material_type, position, content_text, external_url, file_path, file_type, file_size, created_at, updated_at',
    )
    .single()

  if (error) throw new CurriculumError(messageOf(error, 'Could not save the material.'), error)
  return toMaterial(data as MaterialRow)
}

export async function deleteMaterial(materialId: string): Promise<void> {
  const { error } = await supabase.from('lesson_materials').delete().eq('id', materialId)
  if (error) throw new CurriculumError(messageOf(error, 'Could not remove the material.'), error)
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/**
 * A material type as a person reads it.
 *
 * `pdf` and `external_link` are storage values. Every label the interface shows
 * goes through here, so no view invents its own wording and the same type is
 * never called two different things in two places.
 */
const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  text: 'Reading',
  code: 'Code sample',
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  video_link: 'Video',
  external_link: 'Link',
}

export function materialTypeLabel(type: MaterialType): string {
  return MATERIAL_TYPE_LABELS[type] ?? 'Material'
}

/**
 * A material link that is safe to put in an `href`, or null.
 *
 * Returns the parsed-and-normalised URL rather than the raw string, so what is
 * compared against the allow-list is what the browser would actually navigate
 * to. A hand-written regex on the raw string is the thing this replaces:
 * `"  javascript:alert(1)"`, `"java\tscript:alert(1)"` and `"JaVaScRiPt:..."`
 * all pass a `startsWith('http')`-shaped check and all execute. `new URL()`
 * strips the leading whitespace and the tab the way a browser does before the
 * scheme is read, so there is one parser instead of a second set of rules.
 *
 * Relative URLs return null. There is no origin-relative link in this data: a
 * material link is a URL somewhere else, and a value with no scheme is more
 * often a typo than an intent.
 *
 * Why the allow-list is two schemes and not a blocklist: `javascript:` and `data:`
 * are not links, they are script. Put in an `href` they execute in this origin, in the
 * session of whoever clicks, which for a student means the attacker's script runs with
 * their authenticated cookies and can call the API as them. That is stored XSS: written
 * once by an instructor, fired for every student who opens the lesson. `vbscript:` and
 * `file:` exist too, and a blocklist is a list of things nobody has thought of yet.
 *
 * The scheme decision now belongs to `isSafeUrl` in the shared validation module, and
 * this function keeps only the part that is genuinely about materials: returning the
 * NORMALISED url. It had its own private copy of the allow-list, which is how the same
 * rule ended up written twice - and `create-checkout` grew a third copy while deciding
 * where to redirect a paying student.
 */
export function safeExternalHref(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!isSafeUrl(trimmed)) return null
  return new URL(trimmed).toString()
}

/**
 * Why a link was refused, in a sentence an instructor can act on.
 *
 * Kept next to `safeExternalHref` so the form's message and the render path's
 * message cannot describe different rules. The form says this on submit; the
 * list shows it for a row that is already stored, which can only happen if it
 * predates this check or was written by something other than this form.
 */
export const UNSAFE_URL_REASON =
  'Only http and https links are allowed. Remove javascript:, data: or any other scheme.'

/** Human file size. Null when the size was never recorded. */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

export function contentStatusLabel(status: ContentStatus): string {
  return CONTENT_STATUS_LABELS[status] ?? 'Unknown'
}

const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
}

export function progressStatusLabel(status: ProgressStatus): string {
  return PROGRESS_LABELS[status] ?? 'Unknown'
}

import { supabase } from './supabase/client'
import type { EnrollmentStatus, MaterialType } from '@/types'

/**
 * Dashboard figures, and the rows behind them.
 *
 * These exist because both dashboards were static. `student/Dashboard.vue` shipped
 * four `StatCard`s with literal `value="0"` and `value="--"`, and two hardcoded
 * empty states, and called no service at all. A student with three enrolments, two
 * graded quizzes and a lesson in progress was told they had none of them.
 *
 * Two rules this file follows.
 *
 * Every failure is contained. A dashboard that loses its whole layout because one
 * count query failed is worse than one showing three of four numbers, so each figure
 * is fetched independently and a failure becomes `null` - which the views render as
 * a dash, not as a zero. Zero is a fact about a student; null is a fact about the
 * request, and conflating them is how a broken dashboard comes to look like a new
 * student.
 *
 * Nothing is counted in the browser. Every figure is a `head: true` count, so the
 * payload stays empty however much data the platform holds, and a student cannot
 * widen their own reach by counting rows client-side.
 */

/** A figure that could not be read. Distinct from a figure that is genuinely zero. */
type Maybe = number | null

/** Whatever supabase-js hands back once a query has run. */
type CountResult = { count: number | null; error: unknown }

/**
 * Run a count, absorbing failure.
 *
 * Takes the query already built rather than the table name, because `supabase.from`
 * is generic and a `Parameters<typeof supabase.from>[0]` parameter collapses to
 * `never` - which reads as if the table list were wrong rather than as a typing
 * artefact.
 */
async function countOf(run: () => PromiseLike<CountResult>): Promise<Maybe> {
  try {
    const { count: total, error } = await run()
    if (error) return null
    return total ?? 0
  } catch {
    return null
  }
}

/**
 * Same, for a query that returns rows.
 *
 * Returns `unknown[]` rather than a generic `T[]`. A PostgREST select with a nested
 * `!inner` join types its result as an array of arrays, which does not survive a
 * generic parameter, and the call sites already narrow with `as unknown as`. Doing
 * it here keeps the cast visible where the shape is actually known.
 */
async function rowsOf(
  run: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<unknown[]> {
  try {
    const { data, error } = await run()
    if (error || !data) return []
    return Array.isArray(data) ? (data as unknown[]) : []
  } catch {
    return []
  }
}

/** Round to one decimal, so an average is not shown as 62.49999999. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

/** Where a student should pick up next. */
export interface ContinueLearning {
  courseId: string
  courseSlug: string
  courseTitle: string
  lessonId: string
  lessonTitle: string
  moduleTitle: string | null
  /** How many lessons are complete in this course. */
  completedInCourse: number
  /** How many lessons the course has in total. */
  totalLessons: number
}

export interface StudentGradeRow {
  quizTitle: string
  courseTitle: string
  quizId: string
  attemptId: string
  percentage: number
  passed: boolean
  submittedAt: string
  attemptNumber: number
}

export interface UpcomingQuiz {
  quizId: string
  title: string
  courseTitle: string
  questionCount: number
  /** Attempts already used, so a student at their limit is not told to try again. */
  attemptsUsed: number
  attemptsAllowed: number
  /** True when a finished attempt is waiting to be resumed. */
  hasOpenAttempt: boolean
}

export interface StudentDashboard {
  enrolledCourses: Maybe
  completedCourses: Maybe
  lessonsCompleted: Maybe
  /** null until at least one quiz has been graded. */
  averageQuizScore: Maybe
  quizzesAvailable: Maybe
  certificates: Maybe
  unreadNotifications: Maybe
  continueLearning: ContinueLearning | null
  recentGrades: StudentGradeRow[]
  upcomingQuizzes: UpcomingQuiz[]
}

/**
 * Module ids for a course.
 *
 * Cached because `loadContinueLearning` walks every active enrolment and would
 * otherwise re-read the same course's modules once per enrolment on a dashboard
 * that refreshes often. A module id list for one course is small and only changes
 * when somebody edits the curriculum.
 */
const moduleIdCache = new Map<string, string[]>()

async function moduleIdsFor(courseId: string): Promise<string[]> {
  const cached = moduleIdCache.get(courseId)
  if (cached) return cached

  const rows = await rowsOf(() => supabase.from('modules').select('id').eq('course_id', courseId))
  const ids = (rows as Array<{ id: string }>).map((r) => r.id)
  moduleIdCache.set(courseId, ids)
  return ids
}

/** Called when curriculum changes, so a new module is not invisible until reload. */
export function forgetModuleCache(courseId?: string): void {
  if (courseId) moduleIdCache.delete(courseId)
  else moduleIdCache.clear()
}

/**
 * The next lesson in an active enrolment the student has not finished.
 *
 * "Next" is the first incomplete lesson in course order, which is the only ordering
 * a learner would recognise. Enrolments whose lessons are all complete are skipped,
 * so a finished course does not sit on the dashboard forever.
 */
async function loadContinueLearning(): Promise<ContinueLearning | null> {
  const enrolments = await rowsOf(() =>
    supabase
      .from('enrollments')
      // `enrolled_at` is selected because the sort below reads it. It was not selected
      // when this query was written, so every row arrived with `enrolled_at` undefined and
      // `b.enrolled_at.localeCompare(...)` threw a TypeError - taking down the whole
      // student dashboard, and the activity figures on the profile page, for every
      // student. Found by loading the app, not by reading it: nothing type-checks a
      // column a select string forgot to ask for.
      .select('course_id, enrolled_at, courses!inner(id, slug, title)')
      .eq('status', 'active'),
  )

  // Most recent first, so a student who just joined a course sees that one rather
  // than whichever happens to sort first by id.
  //
  // `?? ''` on both sides: a sort that can throw is a sort that takes the page with it,
  // and the ordering is a convenience rather than a correctness requirement.
  const ordered = [...(enrolments as unknown as EnrolmentWithCourse[])].sort((a, b) =>
    (b.enrolled_at ?? '').localeCompare(a.enrolled_at ?? ''),
  )

  for (const row of ordered) {
    const course = row.courses
    if (!course) continue

    const moduleIds = await moduleIdsFor(course.id)
    if (moduleIds.length === 0) continue

    const lessons = (await rowsOf(() =>
      supabase
        .from('lessons')
        .select('id, title, position, modules!inner(title), lesson_progress!left(status)')
        .in('module_id', moduleIds),
    )) as unknown as LessonWithProgress[]

    if (lessons.length === 0) continue

    const sorted = [...lessons].sort((a, b) => a.position - b.position)
    const isDone = (l: LessonWithProgress) => l.lesson_progress?.[0]?.status === 'completed'
    const next = sorted.find((l) => !isDone(l))
    if (!next) continue

    return {
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      lessonId: next.id,
      lessonTitle: next.title,
      moduleTitle: next.modules?.title ?? null,
      completedInCourse: sorted.filter(isDone).length,
      totalLessons: sorted.length,
    }
  }

  return null
}

type EnrolmentWithCourse = {
  course_id: string
  enrolled_at: string
  courses: { id: string; slug: string; title: string } | null
}

type LessonWithProgress = {
  id: string
  title: string
  position: number
  modules: { title: string } | null
  lesson_progress: Array<{ status: string }> | null
}

/**
 * Recent graded quizzes, newest first.
 *
 * Read through the attempt rather than through the quiz, so only quizzes this
 * student actually sat appear. `reveal_answers` is deliberately not consulted: the
 * score is shown either way, and whether the answers were revealed is the result
 * screen's business.
 */
async function loadRecentGrades(limit: number): Promise<StudentGradeRow[]> {
  const rows = await rowsOf(() =>
    supabase
      .from('quiz_attempts')
      .select(
        'id, quiz_id, attempt_number, percentage, passed, submitted_at, quizzes!inner(title, courses!inner(title))',
      )
      .eq('status', 'submitted')
      .not('percentage', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(limit),
  )

  type AttemptRow = {
    id: string
    quiz_id: string
    attempt_number: number
    percentage: number
    passed: boolean
    submitted_at: string
    quizzes: { title: string; courses: { title: string } | null } | null
  }

  return (rows as unknown as AttemptRow[])
    .filter((row) => row.quizzes)
    .map((row) => ({
      quizTitle: row.quizzes!.title,
      courseTitle: row.quizzes!.courses?.title ?? 'Unknown course',
      quizId: row.quiz_id,
      attemptId: row.id,
      percentage: Number(row.percentage),
      passed: row.passed === true,
      submittedAt: row.submitted_at,
      attemptNumber: row.attempt_number,
    }))
}

/**
 * Published quizzes in enrolled courses that still have something to do.
 *
 * "Something to do" is the point of the list. A quiz already passed is not a thing
 * to attempt, and one with no attempts left is not either - showing either sends the
 * student into a dead end. An open attempt sorts first, because resuming work in
 * hand beats starting something new.
 */
async function loadUpcomingQuizzes(limit: number): Promise<UpcomingQuiz[]> {
  const quizRows = await rowsOf(() =>
    supabase
      .from('quizzes')
      // `courses!inner(title)` because `courseTitle` is rendered under every quiz name
      // in the "Quizzes to do" card. This select carried only `course_id` and the mapper
      // wrote `courseTitle: ''`, so the panel showed a bare quiz title followed by a blank
      // line. A placeholder that reaches the interface is a lie about data being absent,
      // which is the rule this whole file is written against.
      .select('id, title, course_id, attempts_allowed, courses!inner(title)')
      .eq('status', 'published'),
  )

  if (quizRows.length === 0) return []

  type QuizRow = {
    id: string
    title: string
    course_id: string
    attempts_allowed: number
    courses: { title: string } | null
  }
  const quizzes = quizRows as unknown as QuizRow[]

  const [attemptRows, questionRows] = await Promise.all([
    rowsOf(() =>
      supabase
        .from('quiz_attempts')
        .select('quiz_id, status, passed')
        .in(
          'quiz_id',
          quizzes.map((q) => q.id),
        ),
    ),
    rowsOf(() =>
      supabase
        .from('quiz_questions')
        .select('quiz_id')
        .in(
          'quiz_id',
          quizzes.map((q) => q.id),
        ),
    ),
  ])

  const questionsByQuiz = new Map<string, number>()
  for (const row of questionRows as unknown as Array<{ quiz_id: string }>) {
    questionsByQuiz.set(row.quiz_id, (questionsByQuiz.get(row.quiz_id) ?? 0) + 1)
  }

  type AttemptRow = { quiz_id: string; status: string; passed: boolean | null }
  const attemptsByQuiz = new Map<string, AttemptRow[]>()
  for (const row of attemptRows as unknown as AttemptRow[]) {
    const list = attemptsByQuiz.get(row.quiz_id) ?? []
    list.push(row)
    attemptsByQuiz.set(row.quiz_id, list)
  }

  return quizzes
    .map((quiz) => {
      const mine = attemptsByQuiz.get(quiz.id) ?? []
      const graded = mine.filter((a) => a.status === 'submitted')
      const hasOpen = mine.some((a) => a.status === 'in_progress')
      const hasPassed = graded.some((a) => a.passed === true)
      const attemptsAllowed = Math.min(quiz.attempts_allowed, 3)

      return {
        row: {
          quizId: quiz.id,
          title: quiz.title,
          // Resolved from the join. An unknown course is stated as one rather than
          // rendered as blank, because a blank line reads as "no course" and an
          // unreadable row is a different fact.
          courseTitle: quiz.courses?.title ?? 'Unknown course',
          questionCount: questionsByQuiz.get(quiz.id) ?? 0,
          attemptsUsed: graded.length,
          attemptsAllowed,
          hasOpenAttempt: hasOpen,
        },
        // Resume first, then anything still attemptable.
        weight: hasOpen ? 0 : 1,
        actionable: hasOpen || (!hasPassed && graded.length < attemptsAllowed),
      }
    })
    .filter((entry) => entry.actionable)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, limit)
    .map((entry) => entry.row)
}

export async function loadStudentDashboard(): Promise<StudentDashboard> {
  const [
    enrolledCourses,
    completedCourses,
    lessonsCompleted,
    certificates,
    quizzesAvailable,
    unread,
    average,
  ] = await Promise.all([
    countOf(() =>
      supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
    ),
    countOf(() =>
      supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
    ),
    countOf(() =>
      supabase
        .from('lesson_progress')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
    ),
    countOf(() => supabase.from('certificates').select('*', { count: 'exact', head: true })),
    // Enrolment gates which quizzes a student may read, so this count is already
    // scoped by Row Level Security to the courses they can see.
    countOf(() =>
      supabase
        .from('quizzes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),
    ),
    countOf(() =>
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
    ),
    (async () => {
      const rows = await rowsOf(() =>
        supabase
          .from('quiz_attempts')
          .select('percentage')
          .eq('status', 'submitted')
          .not('percentage', 'is', null),
      )
      if (rows.length === 0) return null
      const values = (rows as unknown as Array<{ percentage: number }>).map((r) =>
        Number(r.percentage),
      )
      return round1(values.reduce((a, b) => a + b, 0) / values.length)
    })(),
    Promise.resolve(null as Maybe),
  ])

  const [continueLearning, recentGrades, upcomingQuizzes] = await Promise.all([
    loadContinueLearning(),
    loadRecentGrades(5),
    loadUpcomingQuizzes(4),
  ])

  return {
    enrolledCourses,
    completedCourses,
    lessonsCompleted,
    averageQuizScore: average,
    quizzesAvailable,
    certificates,
    unreadNotifications: unread,
    continueLearning,
    recentGrades,
    upcomingQuizzes: upcomingQuizzes.map((q) => ({ ...q })),
  }
}

// ---------------------------------------------------------------------------
// Instructor
// ---------------------------------------------------------------------------

export interface RecentEnrolment {
  studentName: string | null
  courseTitle: string
  status: EnrollmentStatus
  enrolledAt: string
}

export interface RecentMaterial {
  materialTitle: string
  /** Typed rather than a bare string so `materialTypeLabel` applies without a cast. */
  materialType: MaterialType
  courseTitle: string
  createdAt: string
}

export interface RecentQuizAttempt {
  studentId: string
  studentName: string | null
  quizTitle: string
  courseTitle: string
  percentage: number | null
  passed: boolean | null
  submittedAt: string
  /** How the attempt ended, so a timeout or a warning-exhausted run is visible. */
  endedVia: string | null
}

export interface InstructorDashboard {
  courses: Maybe
  publishedCourses: Maybe
  draftCourses: Maybe
  /** Distinct students across this instructor's courses. */
  students: Maybe
  materials: Maybe
  quizzes: Maybe
  quizAttempts: Maybe
  averageQuizScore: Maybe
  recentEnrolments: RecentEnrolment[]
  recentMaterials: RecentMaterial[]
  recentQuizAttempts: RecentQuizAttempt[]
}

/**
 * Instructor figures.
 *
 * Scoped by `is_instructor_of`, which every course, enrolment and attempt policy
 * calls, so an instructor sees their own courses and nothing else - including in
 * these aggregates. `students` is distinct student ids rather than a count of
 * enrolment rows, so one student across three courses counts once, which is the
 * number an instructor would recognise.
 */
export async function loadInstructorDashboard(): Promise<InstructorDashboard> {
  const [
    courses,
    publishedCourses,
    draftCourses,
    students,
    materials,
    quizzes,
    quizAttempts,
    average,
  ] = await Promise.all([
    countOf(() => supabase.from('courses').select('*', { count: 'exact', head: true })),
    countOf(() =>
      supabase
        .from('courses')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published'),
    ),
    countOf(() =>
      supabase.from('courses').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    ),
    (async () => {
      const rows = await rowsOf(() => supabase.from('enrollments').select('student_id'))
      if (rows.length === 0) return 0
      return new Set((rows as Array<{ student_id: string }>).map((r) => r.student_id)).size
    })(),
    countOf(() => supabase.from('lesson_materials').select('*', { count: 'exact', head: true })),
    countOf(() => supabase.from('quizzes').select('*', { count: 'exact', head: true })),
    countOf(() => supabase.from('quiz_attempts').select('*', { count: 'exact', head: true })),
    (async () => {
      const rows = await rowsOf(() =>
        supabase
          .from('quiz_attempts')
          .select('percentage')
          .eq('status', 'submitted')
          .not('percentage', 'is', null),
      )
      if (rows.length === 0) return null
      const values = (rows as unknown as Array<{ percentage: number }>).map((r) =>
        Number(r.percentage),
      )
      return round1(values.reduce((a, b) => a + b, 0) / values.length)
    })(),
  ])

  const [recentEnrolments, recentMaterials, recentQuizAttempts] = await Promise.all([
    loadRecentEnrolments(),
    loadRecentMaterials(),
    loadRecentQuizAttempts(),
  ])

  return {
    courses,
    publishedCourses,
    draftCourses,
    students,
    materials,
    quizzes,
    quizAttempts,
    averageQuizScore: average,
    recentEnrolments,
    recentMaterials,
    recentQuizAttempts,
  }
}

async function loadRecentEnrolments(limit = 6): Promise<RecentEnrolment[]> {
  const rows = (await rowsOf(() =>
    supabase
      .from('enrollments')
      .select('student_id, status, enrolled_at, courses!inner(title)')
      .order('enrolled_at', { ascending: false })
      .limit(limit),
  )) as unknown as Array<{
    student_id: string
    status: EnrollmentStatus
    enrolled_at: string
    courses: { title: string } | null
  }>

  if (rows.length === 0) return []

  const names = await nameMap([...new Set(rows.map((r) => r.student_id))])

  return rows.map((r) => ({
    studentName: names.get(r.student_id) ?? null,
    courseTitle: r.courses?.title ?? 'Unknown course',
    status: r.status,
    enrolledAt: r.enrolled_at,
  }))
}

async function loadRecentMaterials(limit = 6): Promise<RecentMaterial[]> {
  const rows = (await rowsOf(() =>
    supabase
      .from('lesson_materials')
      .select(
        'title, material_type, created_at, lessons!inner(modules!inner(courses!inner(title)))',
      )
      .order('created_at', { ascending: false })
      .limit(limit),
  )) as unknown as Array<{
    title: string
    material_type: string
    created_at: string
    lessons: { modules: { courses: { title: string } | null } | null } | null
  }>

  return rows.map((r) => ({
    materialTitle: r.title,
    materialType: r.material_type as MaterialType,
    courseTitle: r.lessons?.modules?.courses?.title ?? 'Unknown course',
    createdAt: r.created_at,
  }))
}

async function loadRecentQuizAttempts(limit = 6): Promise<RecentQuizAttempt[]> {
  const rows = (await rowsOf(() =>
    supabase
      .from('quiz_attempts')
      .select(
        'student_id, percentage, passed, submitted_at, ended_via, quizzes!inner(title, courses!inner(title))',
      )
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(limit),
  )) as unknown as Array<{
    student_id: string
    percentage: number | null
    passed: boolean | null
    submitted_at: string
    ended_via: string | null
    quizzes: { title: string; courses: { title: string } | null } | null
  }>

  if (rows.length === 0) return []

  const names = await nameMap([...new Set(rows.map((r) => r.student_id))])

  return rows.map((r) => ({
    // Carried through as well as the name: two students can share a name, and a
    // list keyed on it would collide and render the wrong row.
    studentId: r.student_id,
    studentName: names.get(r.student_id) ?? null,
    quizTitle: r.quizzes?.title ?? 'Unknown quiz',
    courseTitle: r.quizzes?.courses?.title ?? 'Unknown course',
    percentage: r.percentage === null ? null : Number(r.percentage),
    passed: r.passed,
    submittedAt: r.submitted_at,
    endedVia: r.ended_via,
  }))
}

async function nameMap(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const rows = await rowsOf(() => supabase.from('profiles').select('id, full_name').in('id', ids))
  return new Map(
    (rows as Array<{ id: string; full_name: string | null }>).map((r) => [r.id, r.full_name]),
  )
}

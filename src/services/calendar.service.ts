import { supabase } from './supabase/client'

/**
 * Calendar events, assembled from the dated rows the LMS actually has.
 *
 * Why this file exists, and why it is shaped this way
 * ---------------------------------------------------
 * The Calendar used to be a list of assignment due dates wearing a calendar's
 * name. It was titled "Deadlines", showed three stat cards and a table, and had no
 * notion of a month. It was not wrong about its contents - `assignments.due_at` is
 * the only deadline column in the schema - it was wrong to call that a calendar and
 * to put it at `/student/calendar`.
 *
 * So this builds a real date-based view from every source that genuinely has a
 * date. The list below is the honest inventory of what this LMS can put on a
 * calendar, and it is worth reading because several things one would expect are
 * missing for a specific, structural reason rather than by oversight:
 *
 *   Quizzes have no due date. `quizzes` has `created_at` and `updated_at` and
 *   nothing else - there is no column to schedule against and no instructor UI
 *   that sets one. A "quiz deadline" would have to be invented to appear, so
 *   quizzes appear here as things that *happened* (an attempt submitted), never as
 *   things that are *scheduled*. Adding a real `due_at` to quizzes plus a field in
 *   the authoring form is the change that would make it appear, and this file is
 *   arranged so that is a one-line addition to `collectEvents`.
 *
 *   Lessons and materials have publication dates but no scheduled ones. A lesson
 *   appearing in a student's calendar on the day it was written is noise, not
 *   information, so lessons appear only as completions.
 *
 * Every source is a separate query and every failure is absorbed to an empty list.
 * Eight independent queries means one failing does not blank the calendar, and a
 * calendar with three of five sections is more useful than a spinner.
 */

export type CalendarEventKind =
  | 'assignment_due'
  | 'quiz_attempt_due'
  | 'announcement'
  | 'course_published'
  | 'quiz_graded'
  | 'lesson_completed'
  | 'course_started'
  | 'course_completed'
  | 'certificate_issued'
  /** Instructor-only: a lesson written. Distinct from `course_published`. */
  | 'lesson_published'
  /** Instructor-only: a quiz created. Distinct from `quiz_graded`. */
  | 'quiz_created'

/** How an event sits relative to now. Drives colour and ordering. */
export type EventTense = 'past' | 'today' | 'future'

export interface CalendarEvent {
  /** Stable across loads, and unique within an event list. */
  id: string
  kind: CalendarEventKind
  title: string
  /** One line of supporting context: the course, or the score. */
  detail: string | null
  /** ISO 8601. */
  at: string
  courseTitle: string | null
  /** An internal route, when there is somewhere to go. */
  link: string | null
  tense: EventTense
}

/** Presentation per kind. Icon and label live with the kind, not at each call site. */
export const EVENT_PRESENTATION: Record<
  CalendarEventKind,
  { label: string; /** Tailwind classes for the dot / chip. */ tone: string }
> = {
  assignment_due: {
    label: 'Assignment due',
    tone: 'bg-error-500 text-white',
  },
  quiz_attempt_due: {
    label: 'Quiz closes',
    tone: 'bg-warning-500 text-white',
  },
  announcement: {
    label: 'Announcement',
    tone: 'bg-brand-500 text-white',
  },
  course_published: {
    label: 'Course published',
    tone: 'bg-brand-400 text-white',
  },
  quiz_graded: {
    label: 'Quiz graded',
    tone: 'bg-success-600 text-white',
  },
  lesson_completed: {
    label: 'Lesson completed',
    tone: 'bg-success-500 text-white',
  },
  course_started: {
    label: 'Enrolled',
    tone: 'bg-gray-400 text-white',
  },
  course_completed: {
    label: 'Course completed',
    tone: 'bg-success-700 text-white',
  },
  certificate_issued: {
    label: 'Certificate issued',
    tone: 'bg-success-700 text-white',
  },
  // Instructor-only. These were originally folded into `announcement` and
  // `course_published`, which made the legend read "Announcement" for a quiz an
  // instructor had just created. The row was accurate; the label was not.
  lesson_published: {
    label: 'Lesson written',
    tone: 'bg-brand-300 text-gray-900',
  },
  quiz_created: {
    label: 'Quiz created',
    tone: 'bg-brand-400 text-white',
  },
}

/** Run a query, absorbing failure to an empty list. */
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

/**
 * The courses this viewer holds a live place on.
 *
 * `active` and `completed` only. `pending` is a payment in flight - the enrolment exists
 * so that money has somewhere to land, and it grants nothing until `settle_payment` runs -
 * and `dropped` is a place the viewer left, which keeps the row for reporting but no longer
 * grants access. `is_enrolled_in` in the database draws the same line, and this is the same
 * line written where the calendar can be read.
 *
 * No student id is passed in: the viewer is whoever is signed in, and RLS already limits
 * this to their own enrolments.
 */
async function liveCourseIdsForViewer(): Promise<string[]> {
  const rows = await rowsOf(() =>
    supabase.from('enrollments').select('course_id').in('status', ['active', 'completed']),
  )

  const ids = new Set<string>()
  for (const row of rows) {
    const id = (row as { course_id?: unknown }).course_id
    if (typeof id === 'string' && id !== '') ids.add(id)
  }
  return [...ids]
}

export function tenseOf(at: string, now: Date = new Date()): EventTense {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return 'past'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

  if (startOfThatDay < startOfToday) return 'past'
  if (startOfThatDay > startOfToday) return 'future'
  return date.getTime() < now.getTime() ? 'past' : 'today'
}

/*
 * Which day an event lands on, and why it is the viewer's day
 * ------------------------------------------------------------
 * Every date in this file is keyed by the *reader's* local calendar day, never by
 * `toISOString().slice(0, 10)`. That function converts to UTC first, so an event at
 * 23:00 on the 5th in Manila serialises as the 6th and lands on the wrong day of
 * the grid - the one bug a calendar cannot have.
 *
 * For events that *happened* - an enrolment, a submission, a completion - there is
 * no argument: the reader wants the day they experienced it.
 *
 * For a *deadline* there is one, and it is worth writing down because there is no
 * assignment authoring UI in this app yet, so nobody has had to decide it:
 * `assignments.due_at` is currently only ever set by seed data, and when authoring
 * arrives the author must store UTC midnight of the day they picked. Under that
 * convention the UTC date *is* the intended calendar day, and keying by the reader's
 * local date is still the right rendering: a deadline is due when it becomes late
 * for the person who has to hand it in, and that is a fact about their clock, not
 * the author's.
 *
 * This also matches the rest of the app. `Grades.vue`, `Grading.vue` and
 * `CourseDetail.vue` all render `dueAt` through `formatDateTime`, which is local,
 * so a deadline shown here and one shown there agree. Keying deadlines by UTC here
 * while the rest of the app renders them locally would put a deadline on two
 * different days in two different places, which is worse than either choice alone.
 */

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Collect events for the signed-in student.
 *
 * Every query below is already scoped by Row Level Security to what this student may
 * read: enrolments to their own, quiz attempts to their own, lesson progress to
 * their own. Nothing here filters by student id in application code, because doing
 * so would be a second, weaker copy of a rule the database already enforces.
 *
 * Assignments and announcements are the two scoped to a *course* rather than to a person,
 * so they are filtered here as well. Two reasons, in order of importance:
 *
 * 1. RLS used not to scope them. `assignments select` granted every published assignment
 *    to every signed-in account through a disjunct that mentioned nothing about the
 *    caller, and this query carried no course filter of its own - so a student with only
 *    a pending enrolment on a paid course was shown that course's assignment deadline.
 *    The policy is fixed. The fix would be hollow if this query were still trusting it.
 *
 * 2. RLS is a boundary, not a filter. It answers "may this person read this row", not
 *    "which rows belong on this person's calendar". The second question is the
 *    application's, and the page's own subtitle is "Every dated thing across your
 *    courses" - so the course list it means is written here, where it can be read.
 *
 * A pending enrolment is not a course you hold. `pending` is a payment in flight and
 * `dropped` is a place you left; neither puts a deadline in front of somebody.
 */
async function collectStudentEvents(): Promise<CalendarEvent[]> {
  const now = new Date()

  // Fetched first because two of the sources below are filtered by it. `.in([])` is
  // rejected by PostgREST rather than matching nothing, so an empty result short-circuits
  // to no course-scoped events instead of sending a query that errors.
  const liveCourseIds = await liveCourseIdsForViewer()

  const [
    assignments,
    openAttempts,
    announcements,
    courses,
    attempts,
    lessons,
    enrolments,
    certificates,
  ] = await Promise.all([
    // A deadline the student can be held to. `due_at is not null` because the
    // column is nullable and an assignment with no date is not a calendar event.
    //
    // Filtered to the courses this student actually holds a place on. That is redundant
    // with `assignments select` as it now stands, and deliberately so - see the note on
    // this function. When the policy is right the filter changes nothing; when the policy
    // is wrong, the calendar still shows only the viewer's own courses, which is the
    // difference between a student's calendar and a list of other people's deadlines.
    liveCourseIds.length === 0
      ? Promise.resolve([])
      : rowsOf(() =>
          supabase
            .from('assignments')
            .select('id, title, due_at, courses!inner(id, title, slug)')
            .in('course_id', liveCourseIds)
            .not('due_at', 'is', null),
        ),
    // The only genuinely forward-looking quiz date in the schema: the moment an
    // open attempt's time limit runs out. It is set by `start_quiz_attempt` from
    // the server clock, so it is a real deadline and not a local countdown.
    rowsOf(() =>
      supabase
        .from('quiz_attempts')
        .select('id, expires_at, quizzes!inner(id, title, course_id, courses!inner(title, slug))')
        .eq('status', 'in_progress')
        .not('expires_at', 'is', null),
    ),
    // An announcement is aimed either at everybody - `course_id is null`, which the
    // policy deliberately grants to every account - or at one course. The course-scoped
    // ones are filtered to this student's courses for the same reason assignments are: a
    // site-wide announcement is genuinely for everybody, but an announcement about a
    // course you are not on is not your news.
    //
    // `.is('course_id', null)` rather than `.not(...)`, because "not aimed at a course" is
    // the case worth being explicit about and the one a reader would otherwise have to
    // infer from the absence of a filter.
    // A LEFT join, and `course_id` selected beside it.
    //
    // `!inner` here was a real bug, and a quiet one: an announcement with `course_id` null
    // is a platform-wide notice, an inner join on `courses` finds nothing for it, and the
    // row never reached the filter below - so the filter's own `courseId === null` branch,
    // written specifically to keep platform-wide notices, could never fire. The one
    // notice an administrator posts for everybody was the one notice that could never
    // reach a calendar.
    rowsOf(() =>
      supabase
        .from('announcements')
        .select('id, title, published_at, course_id, courses(title, slug)')
        .not('published_at', 'is', null),
    ).then((rows) =>
      rows.filter((row) => {
        const courseId = (row as { course_id?: string | null }).course_id ?? null
        return courseId === null || liveCourseIds.includes(courseId)
      }),
    ),
    rowsOf(() =>
      supabase
        .from('courses')
        .select('id, title, slug, published_at')
        .not('published_at', 'is', null),
    ),
    rowsOf(() =>
      supabase
        .from('quiz_attempts')
        .select(
          'id, quiz_id, percentage, passed, submitted_at, quizzes!inner(title, courses!inner(title, slug))',
        )
        .eq('status', 'submitted')
        .neq('ended_via', 'abandoned')
        .not('submitted_at', 'is', null),
    ),
    rowsOf(() =>
      supabase
        .from('lesson_progress')
        .select(
          'id, completed_at, lessons!inner(id, title, modules!inner(courses!inner(title, slug)))',
        )
        .not('completed_at', 'is', null),
    ),
    rowsOf(() =>
      supabase
        .from('enrollments')
        .select('id, enrolled_at, completed_at, courses!inner(id, title, slug)'),
    ),
    rowsOf(() =>
      supabase
        .from('certificates')
        .select('id, issued_at, courses!inner(title, slug)')
        .not('issued_at', 'is', null),
    ),
  ])

  const events: CalendarEvent[] = []

  for (const row of assignments as Array<{
    id: string
    title: string | null
    due_at: string
    courses: { id: string; title: string; slug: string } | null
  }>) {
    const course = row.courses
    events.push({
      id: `assignment-${row.id}`,
      kind: 'assignment_due',
      // A null title is possible; the id would be worse than a generic label.
      title: row.title?.trim() || 'Untitled assignment',
      detail: course?.title ?? null,
      at: row.due_at,
      courseTitle: course?.title ?? null,
      link: course ? `/student/courses/${course.slug}` : null,
      tense: tenseOf(row.due_at, now),
    })
  }

  for (const row of openAttempts as Array<{
    id: string
    expires_at: string
    quizzes: { id: string; title: string; courses: { title: string; slug: string } | null } | null
  }>) {
    const quiz = row.quizzes
    const course = quiz?.courses
    events.push({
      id: `attempt-due-${row.id}`,
      kind: 'quiz_attempt_due',
      title: quiz?.title ?? 'Quiz',
      detail: `Time limit ends${course ? ` · ${course.title}` : ''}`,
      at: row.expires_at,
      courseTitle: course?.title ?? null,
      link: quiz ? `/student/quizzes/${quiz.id}` : null,
      tense: tenseOf(row.expires_at, now),
    })
  }

  for (const row of announcements as Array<{
    id: string
    title: string
    published_at: string
    courses: { title: string; slug: string } | null
  }>) {
    events.push({
      id: `announcement-${row.id}`,
      kind: 'announcement',
      title: row.title,
      detail: row.courses?.title ?? null,
      at: row.published_at,
      courseTitle: row.courses?.title ?? null,
      link: row.courses ? `/student/courses/${row.courses.slug}` : null,
      tense: tenseOf(row.published_at, now),
    })
  }

  for (const row of courses as Array<{
    id: string
    title: string
    slug: string
    published_at: string
  }>) {
    events.push({
      id: `course-published-${row.id}`,
      kind: 'course_published',
      title: row.title,
      detail: 'Course published',
      at: row.published_at,
      courseTitle: row.title,
      link: `/student/courses/${row.slug}`,
      tense: tenseOf(row.published_at, now),
    })
  }

  for (const row of attempts as Array<{
    id: string
    quiz_id: string
    percentage: number | null
    passed: boolean | null
    submitted_at: string
    quizzes: { title: string; courses: { title: string; slug: string } | null } | null
  }>) {
    const course = row.quizzes?.courses
    const score = row.percentage === null ? null : `${row.percentage}%`
    events.push({
      id: `attempt-${row.id}`,
      kind: 'quiz_graded',
      title: row.quizzes?.title ?? 'Quiz',
      detail: [score, course?.title].filter(Boolean).join(' · ') || null,
      at: row.submitted_at,
      courseTitle: course?.title ?? null,
      link: `/student/quizzes/${row.quiz_id}`,
      tense: tenseOf(row.submitted_at, now),
    })
  }

  for (const row of lessons as Array<{
    id: string
    completed_at: string
    lessons: {
      id: string
      title: string
      modules: { courses: { title: string; slug: string } | null } | null
    } | null
  }>) {
    const course = row.lessons?.modules?.courses
    events.push({
      id: `lesson-${row.id}`,
      kind: 'lesson_completed',
      title: row.lessons?.title ?? 'Lesson',
      detail: course?.title ?? null,
      at: row.completed_at,
      courseTitle: course?.title ?? null,
      link: course ? `/student/lessons/${row.lessons!.id}` : null,
      tense: tenseOf(row.completed_at, now),
    })
  }

  for (const row of enrolments as Array<{
    id: string
    enrolled_at: string
    completed_at: string | null
    courses: { id: string; title: string; slug: string } | null
  }>) {
    const course = row.courses
    if (!course) continue
    events.push({
      id: `enrolment-${row.id}`,
      kind: 'course_started',
      title: course.title,
      detail: 'Enrolled',
      at: row.enrolled_at,
      courseTitle: course.title,
      link: `/student/courses/${course.slug}`,
      tense: tenseOf(row.enrolled_at, now),
    })
    if (row.completed_at) {
      events.push({
        id: `completion-${row.id}`,
        kind: 'course_completed',
        title: course.title,
        detail: 'Course completed',
        at: row.completed_at,
        courseTitle: course.title,
        link: `/student/courses/${course.slug}`,
        tense: tenseOf(row.completed_at, now),
      })
    }
  }

  for (const row of certificates as Array<{
    id: string
    issued_at: string
    courses: { title: string; slug: string } | null
  }>) {
    events.push({
      id: `certificate-${row.id}`,
      kind: 'certificate_issued',
      title: 'Certificate issued',
      detail: row.courses?.title ?? null,
      at: row.issued_at,
      courseTitle: row.courses?.title ?? null,
      link: row.courses ? `/student/courses/${row.courses.slug}` : '/student/grades',
      tense: tenseOf(row.issued_at, now),
    })
  }

  return events
}

/**
 * The courses an instructor teaches.
 *
 * `is_instructor_of` decides every row here, so no instructor id is passed: the viewer is
 * whoever is signed in and the query cannot be pointed at somebody else's teaching list.
 * A course that has not been published yet is still a course they teach, so there is no
 * publication filter - "no announcements yet" on a brand-new course is the honest answer.
 */
async function liveCourseIdsForInstructor(): Promise<string[]> {
  const rows = await rowsOf(() => supabase.from('course_instructors').select('course_id'))

  const ids = new Set<string>()
  for (const row of rows) {
    const id = (row as { course_id?: unknown }).course_id
    if (typeof id === 'string' && id !== '') ids.add(id)
  }
  return [...ids]
}

/**
 * Collect events for an instructor.
 *
 * Scoped by `is_instructor_of` through the course policies, so an instructor sees
 * their own courses' activity and nothing else. The teaching calendar is mostly
 * things that *happened to their students*, plus the assignment deadlines they set.
 */
async function collectInstructorEvents(): Promise<CalendarEvent[]> {
  const now = new Date()

  // The courses this instructor teaches. Used to filter course-scoped announcements to
  // their own, for the same reason the student calendar does: RLS decides what may be
  // read, and "which rows belong on this person's calendar" is the second question.
  const liveCourseIds = await liveCourseIdsForInstructor()

  const [assignments, announcements, courses, attempts, enrolments, lessons, quizzes] =
    await Promise.all([
      rowsOf(() =>
        supabase
          .from('assignments')
          .select('id, title, due_at, courses!inner(id, title)')
          .not('due_at', 'is', null),
      ),
      // A LEFT join, and `course_id` selected beside it.
      //
      // This was `courses!inner(title)`, which silently dropped every platform-wide
      // notice. An announcement with `course_id` null has no course to inner-join on, so
      // the one notice an administrator posts for everybody - maintenance, a closure -
      // was the one notice that could never reach a calendar. The map below already read
      // `courses: null` as "for everybody"; the query was the thing disagreeing.
      //
      // The filter below is applied in JS, matching the student calendar exactly, so the
      // two cannot drift apart on what "my calendar" means.
      rowsOf(() =>
        supabase
          .from('announcements')
          .select('id, title, published_at, course_id, courses(title, slug)')
          .not('published_at', 'is', null),
      ).then((rows) =>
        rows.filter((row) => {
          const courseId = (row as { course_id?: string | null }).course_id ?? null
          return courseId === null || liveCourseIds.includes(courseId)
        }),
      ),
      rowsOf(() =>
        supabase
          .from('courses')
          .select('id, title, slug, published_at')
          .not('published_at', 'is', null),
      ),
      rowsOf(() =>
        supabase
          .from('quiz_attempts')
          .select(
            'id, quiz_id, percentage, passed, submitted_at, ended_via, quizzes!inner(id, title, course_id, courses!inner(title))',
          )
          .eq('status', 'submitted')
          // `time_expired` and `warnings_exhausted` are real outcomes the instructor
          // wants (see below). `abandoned` is not: it is a sitting the student never
          // came back to, so it falls through the qualifier chain and would show as a
          // bare "0%" with no explanation.
          .neq('ended_via', 'abandoned')
          .not('submitted_at', 'is', null),
      ),
      rowsOf(() =>
        supabase
          .from('enrollments')
          .select('id, enrolled_at, student_id, courses!inner(id, title, slug)'),
      ),
      rowsOf(() =>
        supabase
          .from('lessons')
          .select('id, title, created_at, modules!inner(courses!inner(title))'),
      ),
      rowsOf(() =>
        supabase
          .from('quizzes')
          .select('id, title, created_at, course_id, courses!inner(title, slug)')
          .order('created_at', { ascending: false }),
      ),
    ])

  const events: CalendarEvent[] = []

  for (const row of assignments as Array<{
    id: string
    title: string | null
    due_at: string
    courses: { id: string; title: string } | null
  }>) {
    events.push({
      id: `assignment-${row.id}`,
      kind: 'assignment_due',
      title: row.title?.trim() || 'Untitled assignment',
      detail: row.courses?.title ?? null,
      at: row.due_at,
      courseTitle: row.courses?.title ?? null,
      link: row.courses ? `/instructor/courses/${row.courses.id}` : null,
      tense: tenseOf(row.due_at, now),
    })
  }

  for (const row of announcements as Array<{
    id: string
    title: string
    published_at: string
    courses: { title: string } | null
  }>) {
    events.push({
      id: `announcement-${row.id}`,
      kind: 'announcement',
      title: row.title,
      detail: row.courses?.title ?? null,
      at: row.published_at,
      courseTitle: row.courses?.title ?? null,
      link: null,
      tense: tenseOf(row.published_at, now),
    })
  }

  for (const row of courses as Array<{
    id: string
    title: string
    slug: string
    published_at: string
  }>) {
    events.push({
      id: `course-published-${row.id}`,
      kind: 'course_published',
      title: row.title,
      detail: 'Course published',
      at: row.published_at,
      courseTitle: row.title,
      link: `/instructor/courses/${row.id}`,
      tense: tenseOf(row.published_at, now),
    })
  }

  for (const row of attempts as Array<{
    id: string
    quiz_id: string
    percentage: number | null
    passed: boolean | null
    submitted_at: string
    ended_via: string | null
    quizzes: {
      id: string
      title: string
      course_id: string
      courses: { id: string; title: string } | null
    } | null
  }>) {
    const course = row.quizzes?.courses
    // A run that ended on warnings or a timeout is a different event from one the
    // student finished, and an instructor looking at their calendar is exactly the
    // person who would want to know.
    const qualifier =
      row.ended_via === 'warnings_exhausted'
        ? 'ended on warnings'
        : row.ended_via === 'time_expired'
          ? 'ran out of time'
          : null
    events.push({
      id: `attempt-${row.id}`,
      kind: 'quiz_graded',
      title: row.quizzes?.title ?? 'Quiz',
      detail:
        [row.percentage === null ? null : `${row.percentage}%`, course?.title, qualifier]
          .filter(Boolean)
          .join(' · ') || null,
      at: row.submitted_at,
      courseTitle: course?.title ?? null,
      // The results live on the quiz manager for that course, which is where an
      // instructor goes to read an attempt.
      link: course ? `/instructor/courses/${course.id}/quiz` : null,
      tense: tenseOf(row.submitted_at, now),
    })
  }

  for (const row of enrolments as Array<{
    id: string
    enrolled_at: string
    courses: { id: string; title: string; slug: string } | null
  }>) {
    if (!row.courses) continue
    events.push({
      id: `enrolment-${row.id}`,
      kind: 'course_started',
      title: 'New enrollment',
      detail: row.courses.title,
      at: row.enrolled_at,
      courseTitle: row.courses.title,
      link: `/instructor/courses/${row.courses.id}`,
      tense: tenseOf(row.enrolled_at, now),
    })
  }

  // Lessons and quizzes are dated by when the instructor wrote them. That is
  // genuine authoring activity and belongs on a teaching calendar; it is
  // deliberately not shown to students, where the same date is noise.
  for (const row of lessons as Array<{
    id: string
    title: string
    created_at: string
    modules: { courses: { title: string } | null } | null
  }>) {
    events.push({
      id: `lesson-authored-${row.id}`,
      kind: 'lesson_published',
      title: row.title,
      detail: `Lesson written · ${row.modules?.courses?.title ?? 'Unknown course'}`,
      at: row.created_at,
      courseTitle: row.modules?.courses?.title ?? null,
      link: null,
      tense: tenseOf(row.created_at, now),
    })
  }

  for (const row of quizzes as Array<{
    id: string
    title: string
    created_at: string
    course_id: string
    courses: { title: string; slug: string } | null
  }>) {
    events.push({
      id: `quiz-authored-${row.id}`,
      kind: 'quiz_created',
      title: row.title,
      detail: `Quiz created · ${row.courses?.title ?? 'Unknown course'}`,
      at: row.created_at,
      courseTitle: row.courses?.title ?? null,
      link: `/instructor/courses/${row.course_id}/quiz`,
      tense: tenseOf(row.created_at, now),
    })
  }

  return events
}

/** Events for the signed-in student. */
export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  return sortEvents(await collectStudentEvents())
}

/** Events for the signed-in instructor. */
export async function loadInstructorCalendarEvents(): Promise<CalendarEvent[]> {
  return sortEvents(await collectInstructorEvents())
}

/**
 * Newest first within a day, future before past across days.
 *
 * A calendar is read forwards and backwards, so "what is coming" must not be buried
 * under "what already happened".
 */
function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  const weight: Record<EventTense, number> = { future: 0, today: 1, past: 2 }
  return events.sort((a, b) => {
    const dayA = new Date(a.at).setHours(0, 0, 0, 0)
    const dayB = new Date(b.at).setHours(0, 0, 0, 0)
    if (dayA !== dayB)
      return weight[a.tense] === weight[b.tense] ? dayA - dayB : weight[a.tense] - weight[b.tense]
    return new Date(b.at).getTime() - new Date(a.at).getTime()
  })
}

// ---------------------------------------------------------------------------
// Deadlines - a different thing, on purpose
// ---------------------------------------------------------------------------

/**
 * The nearest things a student still owes, for the dashboard.
 *
 * Deliberately narrow: only dated, unfinished work. A quiz already passed and an
 * assignment already submitted are not deadlines, and listing them as though they
 * were is how a dashboard ends up telling somebody they are behind when they are not.
 *
 * This is the "Upcoming Deadlines" summary. The Calendar is where the same events
 * appear on their dates; neither replaces the other.
 */
export async function loadUpcomingDeadlines(limit = 4): Promise<CalendarEvent[]> {
  const events = await collectStudentEvents()
  const now = Date.now()

  return events
    .filter((e) => e.kind === 'assignment_due' || e.kind === 'quiz_attempt_due')
    .filter((e) => new Date(e.at).getTime() >= now - 86_400_000)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, limit)
}

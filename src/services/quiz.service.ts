import { supabase } from './supabase/client'
import type {
  AttemptStatus,
  QuestionType,
  Quiz,
  QuizAttempt,
  QuizOption,
  QuizQuestion,
  QuizResult,
  QuizRow,
  QuizQuestionRow,
  QuizOptionRow,
  QuizAttemptRow,
} from '@/types'

/**
 * Every Supabase query about quizzes lives here.
 *
 * Two rules this file exists to keep.
 *
 * 1. Grading is not here. `submitQuizAttempt` sends answers to Postgres and
 *    returns whatever the database decided. It never computes a score, because a
 *    score computed in the browser is a score the student chose.
 *
 * 2. The answer key does not cross this boundary. A student reads questions
 *    through `listQuizQuestions`, which selects named columns and has no way to
 *    ask for `is_correct` - `authenticated` has no SELECT grant on it. The
 *    instructor's view of the same data comes from the `quiz_with_answers` RPC,
 *    which Postgres refuses unless the caller teaches the course.
 */

/**
 * What a student is allowed to read.
 *
 * `explanation` is excluded alongside `is_correct`: it is the answer written out
 * in words, so withholding only the boolean would give the whole thing away.
 */
const STUDENT_QUESTION_COLUMNS = 'id, quiz_id, question_type, prompt, points, position'

/** No `is_correct`. The grant for that column does not exist for students. */
const STUDENT_OPTION_COLUMNS = 'id, question_id, option_text, position'

const QUIZ_COLUMNS =
  'id, course_id, module_id, lesson_id, title, description, passing_score, attempts_allowed, time_limit_minutes, shuffle_questions, reveal_answers, status'

const ATTEMPT_COLUMNS =
  'id, quiz_id, course_id, attempt_number, status, score, max_score, percentage, passed, started_at, submitted_at'

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    lessonId: row.lesson_id,
    title: row.title,
    description: row.description,
    passingScore: Number(row.passing_score),
    attemptsAllowed: row.attempts_allowed,
    timeLimitMinutes: row.time_limit_minutes,
    shuffleQuestions: row.shuffle_questions,
    revealAnswers: row.reveal_answers,
    status: row.status,
    // Filled in by listQuizzesForCourse, which batches the question fetch.
    questions: [],
  }
}

function toQuestion(row: QuizQuestionRow, options: QuizOption[]): QuizQuestion {
  return {
    id: row.id,
    questionType: row.question_type as QuestionType,
    prompt: row.prompt,
    points: Number(row.points),
    position: row.position,
    options,
  }
}

function toAttempt(row: QuizAttemptRow): QuizAttempt {
  return {
    id: row.id,
    quizId: row.quiz_id,
    courseId: row.course_id,
    attemptNumber: row.attempt_number,
    status: row.status as AttemptStatus,
    score: row.score === null ? null : Number(row.score),
    maxScore: row.max_score === null ? null : Number(row.max_score),
    percentage: row.percentage === null ? null : Number(row.percentage),
    passed: row.passed,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
  }
}

/**
 * A Postgres error, carried with the message the database chose.
 *
 * The quiz functions raise exceptions whose text is written to be shown to a
 * person: "no attempts remaining: 3 of 3 used", "attempt already submitted at
 * ...". Swallowing those into a generic failure would throw away the only useful
 * thing in the response.
 */
export class QuizError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuizError'
  }
}

/**
 * Postgres error text, made presentable.
 *
 * The strip is deliberately narrow. An earlier version used `^[^:]*:\s*`, on the
 * theory that Postgres prefixes raised exceptions with a routine name. It does,
 * but that pattern also matched the first colon in a timestamp, so
 * "attempt already submitted at 2026-10-05 09:00:00+00" reached the student as
 * "00:00+00". Losing the sentence that explains the problem is worse than showing
 * a prefix, so this removes only the two forms Postgres genuinely emits: a
 * leading `ERROR: ` and a five-character SQLSTATE code.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  if (!error) return fallback
  return error.message.replace(/^(?:ERROR:\s*|[A-Z]{5}:\s*)/, '').trim() || fallback
}

// ---------------------------------------------------------------------------
// Reading, as a student
// ---------------------------------------------------------------------------

/**
 * The quizzes on a course, with their questions.
 *
 * Questions and options are fetched in two extra queries rather than a nested
 * select, because the columns have to be named explicitly: a `select *` on
 * quiz_questions fails outright rather than quietly including the explanation.
 */
export async function listQuizzesForCourse(courseId: string): Promise<Quiz[]> {
  const { data: quizRows, error: quizError } = await supabase
    .from('quizzes')
    .select(QUIZ_COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: true })

  if (quizError) throw new QuizError(messageOf(quizError, 'Could not load the quizzes.'))
  if (!quizRows?.length) return []

  const quizzes = quizRows.map((row) => toQuiz(row as QuizRow))
  const quizIds = quizzes.map((q) => q.id)

  const { data: questionRows, error: questionError } = await supabase
    .from('quiz_questions')
    .select(STUDENT_QUESTION_COLUMNS)
    .in('quiz_id', quizIds)
    .order('position', { ascending: true })

  if (questionError) throw new QuizError(messageOf(questionError, 'Could not load the questions.'))
  if (!questionRows?.length) return quizzes.map((quiz) => ({ ...quiz, questions: [] }))

  // Scoped to this course's questions.
  //
  // This query had no `.in('question_id', ...)` at all, so it fetched every
  // option row in the database. The JavaScript grouped them by question, so the
  // quiz that rendered looked correct - but the network payload carried the full
  // option text of every published quiz on the platform, for every student, on
  // every course page. It was also O(platform) rather than O(course).
  const questionIds = questionRows.map((row) => row.id)

  const { data: optionRows, error: optionError } = await supabase
    .from('quiz_options')
    .select(STUDENT_OPTION_COLUMNS)
    .in('question_id', questionIds)
    .order('position', { ascending: true })

  if (optionError) throw new QuizError(messageOf(optionError, 'Could not load the answers.'))

  if (questionError) throw new QuizError(messageOf(questionError, 'Could not load the questions.'))
  if (optionError) throw new QuizError(messageOf(optionError, 'Could not load the answers.'))

  // Group options by question in one pass. Asking the database for the join
  // would mean selecting quiz_options.*, which is the column-level grant this
  // whole design turns on.
  const optionsByQuestion = new Map<string, QuizOption[]>()
  for (const row of (optionRows ?? []) as QuizOptionRow[]) {
    const list = optionsByQuestion.get(row.question_id) ?? []
    list.push({ id: row.id, optionText: row.option_text })
    optionsByQuestion.set(row.question_id, list)
  }

  const questionsByQuiz = new Map<string, QuizQuestion[]>()
  for (const row of (questionRows ?? []) as QuizQuestionRow[]) {
    const list = questionsByQuiz.get(row.quiz_id) ?? []
    list.push(toQuestion(row, optionsByQuestion.get(row.id) ?? []))
    questionsByQuiz.set(row.quiz_id, list)
  }

  return quizzes.map((quiz) => ({ ...quiz, questions: questionsByQuiz.get(quiz.id) ?? [] }))
}

/** One quiz with its questions. */
export async function getQuiz(quizId: string): Promise<Quiz | null> {
  const { data: quizRows, error } = await supabase
    .from('quizzes')
    .select(QUIZ_COLUMNS)
    .eq('id', quizId)
    .limit(1)

  if (error) throw new QuizError(messageOf(error, 'Could not load this quiz.'))
  if (!quizRows?.length) return null

  const quizzes = await listQuizzesForCourse(quizRows[0].course_id)
  return quizzes.find((q) => q.id === quizId) ?? null
}

/** This student's attempts at one quiz, newest attempt last. */
export async function listMyAttempts(quizId: string): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('quiz_id', quizId)
    .order('attempt_number', { ascending: true })

  if (error) throw new QuizError(messageOf(error, 'Could not load your attempts.'))
  return ((data ?? []) as QuizAttemptRow[]).map(toAttempt)
}

/** Attempts still available, given what has already been used. */
export function attemptsRemaining(quiz: Pick<Quiz, 'attemptsAllowed'>, used: number): number {
  return Math.max(Math.min(quiz.attemptsAllowed, 3) - used, 0)
}

// ---------------------------------------------------------------------------
// Sitting a quiz
// ---------------------------------------------------------------------------

/**
 * Opens an attempt.
 *
 * The cap lives in the database: `start_quiz_attempt` refuses the fourth try even
 * though three are allowed, and refuses when the quiz is not published or the
 * student is not enrolled. All this does is report the refusal.
 */
export async function startAttempt(quizId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_quiz_attempt', { p_quiz_id: quizId })
  if (error) throw new QuizError(messageOf(error, 'Could not start this quiz.'))
  if (typeof data !== 'string') throw new QuizError('Could not start this quiz.')
  return data
}

/** One answer, as `submit_quiz_attempt` expects it. */
export type SubmittedAnswer =
  { questionId: string; optionId: string } | { questionId: string; text: string }

/**
 * Submits and receives the graded result.
 *
 * The score in the return value was computed by Postgres from the answer key.
 * Nothing here derives it, and a second call on the same attempt is refused by
 * the database rather than allowed to overwrite a marked result.
 */
export async function submitAttempt(
  attemptId: string,
  answers: SubmittedAnswer[],
): Promise<QuizResult> {
  const payload = answers.map((answer) =>
    'optionId' in answer
      ? { question_id: answer.questionId, option_id: answer.optionId }
      : { question_id: answer.questionId, text: answer.text },
  )

  const { data, error } = await supabase.rpc('submit_quiz_attempt', {
    p_attempt_id: attemptId,
    p_answers: payload,
  })

  if (error) throw new QuizError(messageOf(error, 'Could not submit your answers.'))
  return toResult(data)
}

/**
 * Narrows the RPC's jsonb into the shape the UI renders.
 *
 * PostgREST returns jsonb columns as parsed objects, but the type is `unknown`,
 * so this validates rather than asserts. A result page that trusts a malformed
 * payload would show a blank score next to a real one.
 */
function toResult(data: unknown): QuizResult {
  if (typeof data !== 'object' || data === null) {
    throw new QuizError('The server returned an unreadable result.')
  }
  const raw = data as Record<string, unknown>
  const answers = Array.isArray(raw.answers) ? raw.answers : []

  return {
    attemptId: String(raw.attempt_id ?? ''),
    score: Number(raw.score ?? 0),
    maxScore: Number(raw.max_score ?? 0),
    percentage: Number(raw.percentage ?? 0),
    passed: raw.passed === true,
    passingScore: Number(raw.passing_score ?? 0),
    attemptsRemaining: Number(raw.attempts_remaining ?? 0),
    revealAnswers: raw.reveal_answers !== false,
    answers: answers.map((entry) => {
      const answer = (entry ?? {}) as Record<string, unknown>
      return {
        questionId: String(answer.question_id ?? ''),
        isCorrect: answer.is_correct === true,
        points: Number(answer.points ?? 0),
        pointsAwarded: Number(answer.points_awarded ?? 0),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// The attempt experience
// ---------------------------------------------------------------------------
//
// Everything below goes through a SECURITY DEFINER function rather than a direct
// table read, and that is not a stylistic choice.
//
// `get_attempt_questions` decides what a student is shown for an attempt: the
// questions in the order this attempt was served, the options in the order this
// attempt was served, and never `is_correct`. The student holds no SELECT grant on
// that column, so a direct query cannot ask for it - but a client that reads
// tables directly also decides its own ordering, and that is how a shuffle
// computed in the browser gets renumbered by a refresh.
//
// The order is written once, by `start_quiz_attempt`, into
// `quiz_attempts.question_order` and `option_order`. Those hold *ids*, never
// positions and never copies of the question, so grading - which looks an option
// up by id and checks the key - cannot be affected by where anything was
// displayed.

/** What the pre-quiz screen shows. Contains no question text and no key. */
export interface QuizBriefing {
  quizId: string
  title: string
  description: string | null
  instructions: string | null
  questionCount: number
  totalPoints: number
  passingScore: number
  attemptsAllowed: number
  attemptsUsed: number
  timeLimitMinutes: number | null
  maxWarnings: number
  shuffleQuestions: boolean
  revealAnswers: boolean
}

/**
 * Everything the pre-quiz screen needs, in one call.
 *
 * Returns null rather than throwing when the quiz is not visible, because
 * "you cannot see this" and "this does not exist" are the same answer to a
 * student who followed a stale link.
 */
export async function getQuizBriefing(quizId: string): Promise<QuizBriefing | null> {
  const { data, error } = await supabase.rpc('quiz_briefing', { p_quiz_id: quizId })
  if (error) throw new QuizError(messageOf(error, 'Could not load this quiz.'))
  if (!data) return null
  return data as unknown as QuizBriefing
}

/** One question as served to an attempt. No correctness field exists on this type. */
export interface ServedQuestion {
  questionId: string
  prompt: string
  questionType: QuestionType
  points: number
  /** Always empty for a short_text question: the accepted answers stay on the server. */
  options: QuizOption[]
}

/** The whole open-attempt state, in one call. */
export interface AttemptState {
  questions: ServedQuestion[]
  expiresAt: string | null
  warningCount: number
  maxWarnings: number
  timeLimitMinutes: number | null
  attemptNumber: number
  attemptsAllowed: number
  status: string
  passed: boolean | null
  percentage: number | null
  score: number | null
  maxScore: number | null
  revealAnswers: boolean
}

export async function getAttemptState(attemptId: string): Promise<AttemptState | null> {
  const { data, error } = await supabase.rpc('get_attempt_questions', {
    p_attempt_id: attemptId,
  })
  if (error) throw new QuizError(messageOf(error, 'Could not load this attempt.'))
  if (!data) return null
  return data as unknown as AttemptState
}

/** Saved selections for an open attempt. Never includes correctness. */
export async function getSavedAnswers(
  attemptId: string,
): Promise<Record<string, { optionId: string | null; text: string | null }>> {
  const { data, error } = await supabase.rpc('get_attempt_answers', {
    p_attempt_id: attemptId,
  })
  if (error) throw new QuizError(messageOf(error, 'Could not recover your saved answers.'))
  return (data ?? {}) as Record<string, { optionId: string | null; text: string | null }>
}

/**
 * Store one answer choice as it is made.
 *
 * Fire and forget from the interface's point of view: a failure here must not
 * interrupt answering, because the answer is still submitted explicitly at the
 * end. It exists so a refresh does not lose work - which the old Laravel system
 * did, with no mechanism at all and no test covering it.
 */
export async function saveAnswer(input: {
  attemptId: string
  questionId: string
  optionId?: string | null
  text?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('save_attempt_answer', {
    p_attempt_id: input.attemptId,
    p_question_id: input.questionId,
    p_option_id: input.optionId ?? null,
    p_text: input.text ?? null,
  })
  if (error) throw new QuizError(messageOf(error, 'Could not save that answer.'))
}

/**
 * Record a focus-loss warning and learn what it cost.
 *
 * The count is a database column, not browser state, so it survives a reload and
 * cannot be reset by the student. The function stops counting at the limit and
 * reports `ended`, so the interface is told the consequence rather than working it
 * out from a number and guessing.
 */
export interface WarningOutcome {
  warningCount: number
  maxWarnings: number
  remaining: number
  ended: boolean
}

export async function recordWarning(attemptId: string, reason: string): Promise<WarningOutcome> {
  const { data, error } = await supabase.rpc('record_quiz_warning', {
    p_attempt_id: attemptId,
    p_reason: reason,
  })
  if (error) throw new QuizError(messageOf(error, 'Could not record that warning.'))
  return data as unknown as WarningOutcome
}

/** An open attempt on a quiz, if the student has one. Powers "Resume". */
export async function findOpenAttempt(quizId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('id')
    .eq('quiz_id', quizId)
    .eq('status', 'in_progress')
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new QuizError(messageOf(error, 'Could not check for an open attempt.'))
  return (data as { id: string } | null)?.id ?? null
}

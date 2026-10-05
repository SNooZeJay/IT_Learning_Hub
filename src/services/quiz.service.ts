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
  return (
    error.message.replace(/^(?:ERROR:\s*|[A-Z]{5}:\s*)/, '').trim() || fallback
  )
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

  const [{ data: questionRows, error: questionError }, { data: optionRows, error: optionError }] =
    await Promise.all([
      supabase
        .from('quiz_questions')
        .select(STUDENT_QUESTION_COLUMNS)
        .in('quiz_id', quizIds)
        .order('position', { ascending: true }),
      supabase
        .from('quiz_options')
        .select(STUDENT_OPTION_COLUMNS)
        .order('position', { ascending: true }),
    ])

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

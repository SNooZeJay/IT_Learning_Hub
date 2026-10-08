import { supabase } from '@/services/supabase/client'
import type { Database } from '@/services/supabase/types'
import type { MaterialType } from '@/types'
import type { QuestionType, QuizStatus } from '@/types/enums'

/**
 * Quiz authoring.
 *
 * Separate from `quiz.service.ts` on purpose: that file is the student's
 * reader and its types deliberately have no correctness field, because a shape
 * that cannot carry `isCorrect` cannot leak it even if something renders the
 * whole object. Adding authoring to it would put `isCorrect` and the accepted
 * answer list in the same module as the code a student path imports, which is
 * exactly the risk that separation exists to prevent.
 *
 * Every read here goes through `quiz_with_answers`, the SECURITY DEFINER
 * function that is the only thing permitted to return the key. Direct selects
 * cannot: `quiz_options.is_correct`, `quiz_questions.explanation` and every row
 * of `quiz_text_answers` have no SELECT grant for `authenticated`.
 *
 * The old Laravel system could add questions but never edit or delete them, and
 * the key was fixed at creation. Both are addressed here, because an assessment
 * you cannot correct is not an assessment tool - it is a data entry form.
 */

export class QuizAuthoringError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'QuizAuthoringError'
  }
}

function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string' && m.trim() !== '') return m
  }
  return fallback
}

function fail(error: unknown, fallback: string): never {
  throw new QuizAuthoringError(messageOf(error, fallback), error)
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface AuthoredOption {
  id: string
  optionText: string
  isCorrect: boolean
  position: number
}

export interface AuthoredQuestion {
  id: string
  questionType: QuestionType
  prompt: string
  points: number
  position: number
  explanation: string | null
  options: AuthoredOption[]
}

export interface AuthoredQuiz {
  id: string
  courseId: string
  title: string
  description: string | null
  instructions: string | null
  passingScore: number
  attemptsAllowed: number
  timeLimitMinutes: number | null
  shuffleQuestions: boolean
  revealAnswers: boolean
  maxWarnings: number
  status: QuizStatus
  questions: AuthoredQuestion[]
}

/** A quiz without its questions, for the list. */
export interface AuthoredQuizSummary {
  id: string
  title: string
  description: string | null
  status: QuizStatus
  passingScore: number
  attemptsAllowed: number
  timeLimitMinutes: number | null
  shuffleQuestions: boolean
  revealAnswers: boolean
  questionCount: number
  totalPoints: number
}

type AnswerKeyPayload = {
  quiz: Record<string, unknown>
  questions: Array<{
    id: string
    question_type: QuestionType
    prompt: string
    points: number
    position: number
    explanation: string | null
    options: Array<{
      id: string
      option_text: string
      is_correct: boolean
      position: number
    }>
  }>
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toAuthored(payload: AnswerKeyPayload): AuthoredQuiz {
  const q = payload.quiz
  return {
    id: String(q.id),
    courseId: String(q.course_id),
    title: String(q.title),
    description: (q.description as string | null) ?? null,
    instructions: (q.instructions as string | null) ?? null,
    passingScore: num(q.passing_score),
    attemptsAllowed: num(q.attempts_allowed),
    timeLimitMinutes: q.time_limit_minutes === null ? null : num(q.time_limit_minutes),
    shuffleQuestions: q.shuffle_questions === true,
    revealAnswers: q.reveal_answers === true,
    maxWarnings: q.max_warnings === undefined ? 3 : num(q.max_warnings),
    status: q.status as QuizStatus,
    questions: (payload.questions ?? []).map((question) => ({
      id: question.id,
      questionType: question.question_type,
      prompt: question.prompt,
      points: num(question.points),
      position: num(question.position),
      explanation: question.explanation ?? null,
      options: (question.options ?? [])
        .map((o) => ({
          id: o.id,
          optionText: o.option_text,
          isCorrect: o.is_correct === true,
          position: num(o.position),
        }))
        .sort((a, b) => a.position - b.position),
    })),
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A quiz with its full answer key. Instructor and admin only. */
export async function getQuizForAuthoring(quizId: string): Promise<AuthoredQuiz | null> {
  const { data, error } = await supabase.rpc('quiz_with_answers', { p_quiz_id: quizId })
  if (error) {
    if (/not your course/i.test(messageOf(error, ''))) return null
    fail(error, 'Could not load this quiz.')
  }
  if (!data) return null
  return toAuthored(data as unknown as AnswerKeyPayload)
}

/**
 * Every quiz on a course, with counts.
 *
 * Reads the quiz rows directly rather than through `quiz_with_answers`, because
 * a list does not need the key and fetching it for every quiz would put every
 * answer key in the browser at once. Counts come from the questions table, whose
 * SELECT grant excludes `explanation`.
 */
export async function listQuizzesForAuthoring(courseId: string): Promise<AuthoredQuizSummary[]> {
  const { data: quizRows, error: quizError } = await supabase
    .from('quizzes')
    .select(
      'id, course_id, title, description, instructions, passing_score, attempts_allowed, time_limit_minutes, shuffle_questions, reveal_answers, status',
    )
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })

  if (quizError) fail(quizError, 'Could not load the quizzes for this course.')

  const quizzes = (quizRows ?? []) as Array<Record<string, unknown>>
  if (quizzes.length === 0) return []

  const ids = quizzes.map((q) => String(q.id))

  const { data: questionRows, error: questionError } = await supabase
    .from('quiz_questions')
    .select('quiz_id, points')
    .in('quiz_id', ids)

  if (questionError) fail(questionError, 'Could not load the quiz questions.')

  const stats = new Map<string, { count: number; points: number }>()
  for (const row of (questionRows ?? []) as Array<{ quiz_id: string; points: number }>) {
    const entry = stats.get(row.quiz_id) ?? { count: 0, points: 0 }
    entry.count += 1
    entry.points += num(row.points)
    stats.set(row.quiz_id, entry)
  }

  return quizzes.map((q) => {
    const entry = stats.get(String(q.id)) ?? { count: 0, points: 0 }
    return {
      id: String(q.id),
      title: String(q.title),
      description: (q.description as string | null) ?? null,
      status: q.status as QuizStatus,
      passingScore: num(q.passing_score),
      attemptsAllowed: num(q.attempts_allowed),
      timeLimitMinutes: q.time_limit_minutes === null ? null : num(q.time_limit_minutes),
      shuffleQuestions: q.shuffle_questions === true,
      revealAnswers: q.reveal_answers === true,
      questionCount: entry.count,
      totalPoints: entry.points,
    }
  })
}

// ---------------------------------------------------------------------------
// Quiz writes
// ---------------------------------------------------------------------------

export interface QuizDraft {
  title: string
  description?: string | null
  /** Shown on the pre-quiz screen. Where the rules live. */
  instructions?: string | null
  passingScore?: number
  attemptsAllowed?: number
  timeLimitMinutes?: number | null
  shuffleQuestions?: boolean
  revealAnswers?: boolean
  maxWarnings?: number
}

export async function createQuiz(courseId: string, draft: QuizDraft): Promise<string> {
  // created_by is NOT NULL with no default, so it has to be read from the
  // session. It is read here rather than accepted as an argument so a caller
  // cannot record a quiz against somebody else's name.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new QuizAuthoringError('You need to be signed in to create a quiz.')

  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      course_id: courseId,
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      instructions: draft.instructions?.trim() || null,
      passing_score: draft.passingScore ?? 70,
      attempts_allowed: draft.attemptsAllowed ?? 3,
      time_limit_minutes: draft.timeLimitMinutes ?? null,
      shuffle_questions: draft.shuffleQuestions ?? true,
      reveal_answers: draft.revealAnswers ?? true,
      max_warnings: draft.maxWarnings ?? 3,
      // Always a draft. Publishing is a separate, deliberate step, because the
      // publish trigger refuses a quiz with no valid key.
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) fail(error, 'Could not create the quiz.')
  return String((data as { id: string }).id)
}

export async function updateQuiz(quizId: string, draft: Partial<QuizDraft>): Promise<void> {
  const update: Database['public']['Tables']['quizzes']['Update'] = {}
  if (draft.title !== undefined) update.title = draft.title.trim()
  if (draft.description !== undefined) update.description = draft.description?.trim() || null
  if (draft.instructions !== undefined) update.instructions = draft.instructions?.trim() || null
  if (draft.passingScore !== undefined) update.passing_score = draft.passingScore
  if (draft.attemptsAllowed !== undefined) update.attempts_allowed = draft.attemptsAllowed
  if (draft.timeLimitMinutes !== undefined) update.time_limit_minutes = draft.timeLimitMinutes
  if (draft.shuffleQuestions !== undefined) update.shuffle_questions = draft.shuffleQuestions
  if (draft.revealAnswers !== undefined) update.reveal_answers = draft.revealAnswers
  if (draft.maxWarnings !== undefined) update.max_warnings = draft.maxWarnings

  const { error } = await supabase.from('quizzes').update(update).eq('id', quizId)
  if (error) fail(error, 'Could not save the quiz.')
}

/**
 * Publish or unpublish.
 *
 * The database refuses to publish a quiz that cannot be answered - fewer than two
 * options on any choice question, or no option marked correct - and says which.
 * That check is the trigger's, and duplicating it here would be a second place for
 * the two to disagree.
 */
export async function setQuizPublished(quizId: string, published: boolean): Promise<void> {
  const { error } = await supabase
    .from('quizzes')
    .update({ status: published ? 'published' : 'draft' })
    .eq('id', quizId)

  if (error) {
    const message = messageOf(error, '')
    if (/publish/i.test(message)) {
      throw new QuizAuthoringError(
        'This quiz cannot be published yet. Every choice question needs at least two options, and exactly one option on each must be marked correct.',
        error,
      )
    }
    fail(error, published ? 'Could not publish the quiz.' : 'Could not unpublish the quiz.')
  }
}

// ---------------------------------------------------------------------------
// Question writes
// ---------------------------------------------------------------------------

export interface OptionDraft {
  optionText: string
  /** Strictly a boolean. See the note on coerceMarker. */
  isCorrect: boolean
}

export interface QuestionDraft {
  questionType: QuestionType
  prompt: string
  points?: number
  explanation?: string | null
  options?: OptionDraft[]
}

export async function nextQuestionPosition(quizId: string): Promise<number> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select('position')
    .eq('quiz_id', quizId)
    .order('position', { ascending: false })
    .limit(1)

  if (error) fail(error, 'Could not read the question order.')
  const last = (data ?? [])[0] as { position: number } | undefined
  return (last?.position ?? 0) + 1
}

/**
 * A checkbox value, read strictly.
 *
 * The old system got this wrong in a way worth recording. Its marker parser
 * accepted anything in `['1','true','on','yes']` and treated the rest as false,
 * with a comment explaining that PHP's loose truthiness would otherwise let two
 * options both be stored correct - which would make every answer score.
 *
 * The same trap exists here in a different shape: a form posts `"false"` as a
 * string, and `"false"` is truthy in JavaScript. So an unchecked "this is the
 * correct answer" box read as checked. Everything below exists so that the only
 * value meaning correct is the boolean true.
 */
function coerceMarker(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === 'true' || v === '1' || v === 'on'
  }
  return false
}

/**
 * Validate a choice question's options before they are sent.
 *
 * Returns the reason rather than throwing, so a form can put it next to the field
 * that caused it. The same rule is enforced again by the publish trigger.
 */
export function validateChoiceOptions(
  options: OptionDraft[],
): { ok: true } | { ok: false; reason: string } {
  const filled = options.filter((o) => o.optionText.trim() !== '')
  if (filled.length < 2) {
    return { ok: false, reason: 'A question needs at least two options.' }
  }
  const correct = filled.filter((o) => coerceMarker(o.isCorrect)).length
  if (correct === 0) {
    return { ok: false, reason: 'Mark which option is correct before saving.' }
  }
  if (correct > 1) {
    return {
      ok: false,
      reason: 'Exactly one option can be correct. More than one is marked.',
    }
  }
  return { ok: true }
}

export function validateQuestion(
  draft: QuestionDraft,
): { ok: true } | { ok: false; reason: string } {
  if (draft.prompt.trim() === '') {
    return { ok: false, reason: 'Give the question some text.' }
  }
  // One validation, not two. It used to branch first on the question type: a
  // written-answer question needed accepted answers, a choice question needed options.
  // With one type there is one thing to check, and the reason it reports is about
  // options because that is the only way a question can now be answered.
  return validateChoiceOptions(draft.options ?? [])
}

export async function createQuestion(quizId: string, draft: QuestionDraft): Promise<string> {
  const check = validateQuestion(draft)
  if (!check.ok) throw new QuizAuthoringError(check.reason)

  const position = await nextQuestionPosition(quizId)

  const { data, error } = await supabase
    .from('quiz_questions')
    .insert({
      quiz_id: quizId,
      question_type: draft.questionType,
      prompt: draft.prompt.trim(),
      points: draft.points ?? 1,
      position,
      explanation: draft.explanation?.trim() || null,
      // `case_sensitive` only ever mattered for comparing a typed answer against the key.
      // The column stays - dropping it is a separate change - and this writes the only
      // value it can now correctly hold. Writing `false` explicitly rather than leaving
      // the column out avoids depending on a default nobody has checked.
      case_sensitive: false,
    })
    .select('id')
    .single()

  if (error) fail(error, 'Could not add the question.')

  const questionId = String((data as { id: string }).id)

  // Every question is answered by choosing an option, so the key is always options.
  // There used to be a second kind here - accepted answers, written to `quiz_text_answers`
  // in a follow-up insert - with a compensating delete if that insert failed. It is gone
  // with the question type it served. The compensating delete stays, because the failure
  // it covers is unchanged: an insert can still fail, and a question whose key never
  // landed cannot be published.
  const options = (draft.options ?? [])
    .map((o) => ({ ...o, optionText: o.optionText.trim() }))
    .filter((o) => o.optionText !== '')

  const { error: optionError } = await supabase.from('quiz_options').insert(
    options.map((o, index) => ({
      question_id: questionId,
      option_text: o.optionText,
      is_correct: coerceMarker(o.isCorrect),
      position: index + 1,
    })),
  )

  // A key that never landed leaves a question that cannot be published. Removing it is
  // better than leaving a half-built question that fails at publish time with an error
  // about a different thing.
  if (optionError) {
    const { error: cleanupError } = await supabase
      .from('quiz_questions')
      .delete()
      .eq('id', questionId)

    // The cleanup's own error is included rather than discarded. If the compensating
    // delete also fails, a question with no key survives, and the next thing that happens
    // is a publish attempt refused with "no option is marked correct" - a message about a
    // different question at a different moment, from which the real cause is not
    // recoverable. The two messages are joined so the author is told both things.
    if (cleanupError) {
      throw new QuizAuthoringError(
        `Could not save the options (${messageOf(optionError, 'unknown error')}), ` +
          `and the incomplete question could not be removed either ` +
          `(${messageOf(cleanupError, 'unknown error')}). ` +
          'Delete that question by hand before adding it again.',
        cleanupError,
      )
    }

    fail(optionError, 'Could not save the options, so the question was not kept.')
  }

  return questionId
}

/**
 * Edit a question in place.
 *
 * Replaces the options wholesale rather than diffing them. The option ids are not
 * referenced by anything a student can reach - `quiz_answers.selected_option_id`
 * is only ever written at grading time, and an attempt is graded once - so there
 * is nothing to preserve by keeping rows.
 *
 * The key replacement goes through `replace_quiz_question_answers`, one
 * statement, rather than a delete followed by an insert.
 *
 * It used to be four round trips: update the question, delete the key, insert
 * the new key. Each is its own transaction, so the delete committed whether or
 * not the insert then succeeded - and when it did not, the author had saved a
 * working question before and now had one with no answer key. Nothing said so at
 * the time. The failure surfaced later, as a publish refused with "no option is
 * marked correct" about a question edited days earlier.
 *
 * The question row's own columns stay a separate update, deliberately. They are
 * not the key: a failed key replacement leaves the prompt and points as the
 * author last wrote them, which is a lost edit rather than a destroyed one.
 */
export async function updateQuestion(questionId: string, draft: QuestionDraft): Promise<void> {
  const check = validateQuestion(draft)
  if (!check.ok) throw new QuizAuthoringError(check.reason)

  const { error } = await supabase
    .from('quiz_questions')
    .update({
      prompt: draft.prompt.trim(),
      points: draft.points ?? 1,
      explanation: draft.explanation?.trim() || null,
      // `case_sensitive` only ever mattered for comparing a typed answer against the key.
      // The column stays - dropping it is a separate change - and this writes the only
      // value it can now correctly hold. Writing `false` explicitly rather than leaving
      // the column out avoids depending on a default nobody has checked.
      case_sensitive: false,
    })
    .eq('id', questionId)

  if (error) fail(error, 'Could not save the question.')

  // The key is always options now. The RPC still takes two payloads and still refuses a
  // question type that does not match, so the empty second one is sent rather than
  // omitted - omitting it would pass the array check by default and quietly mean
  // something different from what it means when sent empty.
  const options = (draft.options ?? [])
    .map((o) => ({ ...o, optionText: o.optionText.trim() }))
    .filter((o) => o.optionText !== '')

  const { error: replaceError } = await supabase.rpc('replace_quiz_question_answers', {
    p_question_id: questionId,
    p_options: options.map((o) => ({
      optionText: o.optionText,
      isCorrect: coerceMarker(o.isCorrect),
    })),
    p_text_answers: [],
  })

  if (replaceError) {
    fail(
      replaceError,
      'Could not save the answer key. Nothing was changed, so this question still has the answers it had before.',
    )
  }
}

/**
 * Delete a question.
 *
 * Cascades to its options and accepted answers. Any attempt that already recorded
 * an answer for it loses that answer, which is why the confirmation says so: the
 * grading result of a past attempt is not recomputed, so a quiz whose questions
 * are edited after marking has results that refer to questions no longer in the
 * same shape.
 */
export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from('quiz_questions').delete().eq('id', questionId)
  if (error) fail(error, 'Could not delete the question.')
}

/**
 * Move a question to a new position.
 *
 * Goes through the same atomic reorder helper the curriculum uses, because
 * `unique (quiz_id, position)` makes per-row updates impossible: writing the new
 * position collides with whatever currently holds it.
 */
export async function reorderQuestions(quizId: string, orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_quiz_questions', {
    p_quiz_id: quizId,
    p_ordered_ids: orderedIds,
  })
  if (error) fail(error, 'Could not save the new order.')
}

/** Move an option within its question. */
export async function reorderOptions(questionId: string, orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_quiz_options', {
    p_question_id: questionId,
    p_ordered_ids: orderedIds,
  })
  if (error) fail(error, 'Could not save the new option order.')
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface AttemptSummary {
  id: string
  studentId: string
  studentName: string | null
  attemptNumber: number
  status: string
  score: number | null
  maxScore: number | null
  percentage: number | null
  passed: boolean | null
  warningCount: number
  endedVia: string | null
  startedAt: string
  submittedAt: string | null
}

/**
 * Every attempt on a quiz, for the instructor's review.
 *
 * Reads `quiz_attempts` directly, which the instructor policy allows and which
 * carries no answer key - the key is in `quiz_answers`, and this deliberately
 * does not read it. A review list needs names, scores and how each attempt ended,
 * not the right answers.
 */
export async function listQuizAttempts(quizId: string): Promise<AttemptSummary[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select(
      'id, student_id, attempt_number, status, score, max_score, percentage, passed, warning_count, ended_via, started_at, submitted_at',
    )
    .eq('quiz_id', quizId)
    .order('student_id', { ascending: true })
    .order('attempt_number', { ascending: true })

  if (error) fail(error, 'Could not load the attempts for this quiz.')

  const attempts = (data ?? []) as Array<Record<string, unknown>>
  if (attempts.length === 0) return []

  const ids = [...new Set(attempts.map((a) => String(a.student_id)))]
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids)

  const names = new Map(
    ((profileRows ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
      p.id,
      p.full_name,
    ]),
  )

  return attempts.map((a) => ({
    id: String(a.id),
    studentId: String(a.student_id),
    studentName: names.get(String(a.student_id)) ?? null,
    attemptNumber: num(a.attempt_number),
    status: String(a.status),
    score: a.score === null ? null : num(a.score),
    maxScore: a.max_score === null ? null : num(a.max_score),
    percentage: a.percentage === null ? null : num(a.percentage),
    passed: a.passed === null ? null : a.passed === true,
    warningCount: num(a.warning_count),
    endedVia: (a.ended_via as string | null) ?? null,
    startedAt: String(a.started_at),
    submittedAt: a.submitted_at === null ? null : String(a.submitted_at),
  }))
}

// Re-exported so a view does not need to reach into the enum module for a type it
// only passes through.
export type { MaterialType }

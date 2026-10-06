import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The client is mocked rather than stubbed per test so the assertions can be
 * about what the service ASKS the database, which is the part that matters.
 *
 * Two of these tests exist because a failure would be invisible otherwise. If
 * `listQuizzesForCourse` started selecting `*` on quiz_questions, the type-check
 * would still pass, the build would still pass, and every student would be able
 * to read the answer key. Nothing about a green gate notices. Only an assertion
 * on the requested columns does.
 */

const from = vi.fn()
const rpc = vi.fn()

vi.mock('@/services/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

import {
  attemptsRemaining,
  draftHasAnswer,
  getQuiz,
  listMyAttempts,
  listQuizzesForCourse,
  QuizError,
  startAttempt,
  submitAttempt,
  toSubmittedAnswers,
  type DraftAnswer,
} from '@/services/quiz.service'

/** A thenable chain that resolves to whatever the test queued for that table. */
function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder)
  }
  // `await` on the builder resolves it, which is how supabase-js query builders
  // behave.
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

/** Queue a response per table name, in the order the service asks for them. */
/** Builders handed out, keyed by table, so a test can inspect what was asked. */
const builders: Record<string, ReturnType<typeof chain>[]> = {}

/** Queue a response per table name, in the order the service asks for them. */
function respondByTable(
  responses: Record<string, { data?: unknown; error?: { message: string } | null }>,
) {
  for (const key of Object.keys(builders)) delete builders[key]
  from.mockImplementation((table: string) => {
    const builder = chain(responses[table] ?? { data: [] })
    ;(builders[table] ??= []).push(builder)
    return builder
  })
}

/**
 * The column list the service asked for on a table, or undefined if it never
 * asked. Captured here rather than read back out of the mock's call record,
 * because `from` receives only the table name - there is no second argument to
 * destructure, and reaching for one yields undefined rather than an error.
 */
function selectedColumns(table: string): string | undefined {
  const select = builders[table]?.[0]?.select as ReturnType<typeof vi.fn> | undefined
  return select?.mock.calls[0]?.[0]
}

const quizRow = {
  id: 'quiz-1',
  course_id: 'course-1',
  module_id: null,
  lesson_id: null,
  title: 'Networking basics',
  description: null,
  passing_score: '70',
  attempts_allowed: 3,
  time_limit_minutes: null,
  shuffle_questions: false,
  reveal_answers: true,
  status: 'published',
}

const questionRow = {
  id: 'q1',
  quiz_id: 'quiz-1',
  question_type: 'multiple_choice',
  prompt: 'What is a subnet mask?',
  points: '2',
  position: 0,
}

const optionRows = [
  { id: 'o1', question_id: 'q1', option_text: '255.255.255.0', position: 0 },
  { id: 'o2', question_id: 'q1', option_text: 'A password', position: 1 },
]

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
})

describe('the answer key never crosses into a student query', () => {
  it('names the columns it selects instead of asking for every column', async () => {
    respondByTable({
      quizzes: { data: [quizRow] },
      quiz_questions: { data: [questionRow] },
      quiz_options: { data: optionRows },
    })

    await listQuizzesForCourse('course-1')

    const questionSelect = selectedColumns('quiz_questions')
    const optionSelect = selectedColumns('quiz_options')

    expect(questionSelect).toBeTypeOf('string')
    expect(questionSelect).not.toBe('*')
    expect(questionSelect).not.toContain('explanation')
    expect(optionSelect).toBeTypeOf('string')
    expect(optionSelect).not.toBe('*')
    expect(optionSelect).not.toContain('is_correct')
  })

  it('does not leak the key through the shape it hands back either', async () => {
    respondByTable({
      quizzes: { data: [quizRow] },
      quiz_questions: { data: [questionRow] },
      quiz_options: { data: optionRows },
    })

    const [quiz] = await listQuizzesForCourse('course-1')
    const serialised = JSON.stringify(quiz)

    expect(serialised).not.toContain('is_correct')
    expect(serialised).not.toContain('isCorrect')
    // The option ids are needed to submit; the correctness flag is not.
    expect(quiz.questions[0].options).toHaveLength(2)
    expect(quiz.questions[0].options[0]).toEqual({ id: 'o1', optionText: '255.255.255.0' })
  })
})

describe('attemptsRemaining', () => {
  it('counts down and stops at zero', () => {
    expect(attemptsRemaining({ attemptsAllowed: 3 }, 0)).toBe(3)
    expect(attemptsRemaining({ attemptsAllowed: 3 }, 2)).toBe(1)
    expect(attemptsRemaining({ attemptsAllowed: 3 }, 3)).toBe(0)
  })

  it('never goes negative when more attempts exist than allowed', () => {
    // Reaching here means the cap was bypassed somewhere. Showing "-1
    // attempts remaining" would compound that with a nonsense number.
    expect(attemptsRemaining({ attemptsAllowed: 3 }, 5)).toBe(0)
  })

  it('applies the section 19.4 cap of three even if a quiz somehow claims more', () => {
    expect(attemptsRemaining({ attemptsAllowed: 9 }, 0)).toBe(3)
  })
})

describe('startAttempt', () => {
  it('returns the id the database made', async () => {
    rpc.mockResolvedValue({ data: 'attempt-7', error: null })
    await expect(startAttempt('quiz-1')).resolves.toBe('attempt-7')
  })

  it('surfaces the database refusal in words a person can act on', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'no attempts remaining: 3 of 3 used' } })
    // The message is the whole value of the error. A generic "something went
    // wrong" here would leave a student with no idea the limit was the problem.
    await expect(startAttempt('quiz-1')).rejects.toThrow('no attempts remaining: 3 of 3 used')
  })

  it('refuses a non-string result rather than returning undefined', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(startAttempt('quiz-1')).rejects.toBeInstanceOf(QuizError)
  })
})

describe('submitAttempt', () => {
  it('sends answers and nothing else, and never computes a score', async () => {
    rpc.mockResolvedValue({
      data: {
        attempt_id: 'attempt-7',
        score: '2',
        max_score: '2',
        percentage: '100',
        passed: true,
        passing_score: '70',
        attempts_remaining: 2,
        reveal_answers: true,
        answers: [{ question_id: 'q1', is_correct: true, points: '2', points_awarded: '2' }],
      },
      error: null,
    })

    const result = await submitAttempt('attempt-7', [{ questionId: 'q1', optionId: 'o1' }])

    // The client sent answers. It did not send a score, a pass flag, or a
    // percentage, because it has no standing to.
    const payload = rpc.mock.calls[0][1]
    expect(payload.p_answers).toEqual([{ question_id: 'q1', option_id: 'o1' }])
    expect(Object.keys(payload)).toEqual(['p_attempt_id', 'p_answers'])
    expect(JSON.stringify(payload)).not.toContain('score')

    // And the score it returns is the database's, read straight through.
    expect(result.percentage).toBe(100)
    expect(result.passed).toBe(true)
    expect(result.attemptsRemaining).toBe(2)
  })

  it('reports a failed quiz as failed even though the call succeeded', async () => {
    rpc.mockResolvedValue({
      data: {
        attempt_id: 'a',
        score: '1',
        max_score: '4',
        percentage: '25',
        passed: false,
        passing_score: '70',
        attempts_remaining: 2,
        reveal_answers: false,
        answers: [],
      },
      error: null,
    })

    const result = await submitAttempt('a', [{ questionId: 'q1', text: 'subnet' }])

    expect(result.passed).toBe(false)
    expect(result.percentage).toBe(25)
    expect(result.revealAnswers).toBe(false)
  })

  it('keeps a text answer and an option answer distinguishable on the wire', async () => {
    rpc.mockResolvedValue({ data: { answers: [] }, error: null })

    await submitAttempt('a', [
      { questionId: 'q1', optionId: 'o1' },
      { questionId: 'q2', text: 'a subnet mask' },
    ])

    expect(rpc.mock.calls[0][1].p_answers).toEqual([
      { question_id: 'q1', option_id: 'o1' },
      { question_id: 'q2', text: 'a subnet mask' },
    ])
  })

  it('refuses a resubmission instead of quietly regrading', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'attempt already submitted at 2026-10-05 09:00:00+00' },
    })
    await expect(submitAttempt('a', [{ questionId: 'q1', optionId: 'o1' }])).rejects.toThrow(
      /already submitted/,
    )
  })

  it('refuses an unreadable result rather than rendering a blank score', async () => {
    rpc.mockResolvedValue({ data: 'not an object', error: null })
    // A results page showing 0/0 next to a real attempt is worse than an error,
    // because it looks like a genuine fail.
    await expect(submitAttempt('a', [])).rejects.toBeInstanceOf(QuizError)
  })
})

describe('reads', () => {
  it('returns an empty list rather than null when a course has no quizzes', async () => {
    respondByTable({ quizzes: { data: [] } })
    await expect(listQuizzesForCourse('course-1')).resolves.toEqual([])
    // No question or option query should have been attempted.
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('groups options onto the right question and leaves others bare', async () => {
    respondByTable({
      quizzes: { data: [quizRow] },
      quiz_questions: {
        data: [questionRow, { ...questionRow, id: 'q2', question_type: 'short_text' }],
      },
      quiz_options: { data: optionRows },
    })

    const [quiz] = await listQuizzesForCourse('course-1')

    expect(quiz.questions).toHaveLength(2)
    expect(quiz.questions[0].options).toHaveLength(2)
    // A short-text question legitimately has no options, and must not inherit
    // the previous question's.
    expect(quiz.questions[1].options).toEqual([])
  })

  it('reports a load failure rather than showing an empty quiz list', async () => {
    respondByTable({ quizzes: { error: { message: 'permission denied for table quizzes' } } })
    await expect(listQuizzesForCourse('course-1')).rejects.toThrow(/permission denied/)
  })

  it('returns null for a quiz that does not exist', async () => {
    respondByTable({ quizzes: { data: [] } })
    await expect(getQuiz('missing')).resolves.toBeNull()
  })

  it('turns attempt rows into the shape the results screen uses', async () => {
    respondByTable({
      quiz_attempts: {
        data: [
          {
            id: 'a1',
            quiz_id: 'quiz-1',
            course_id: 'course-1',
            attempt_number: 1,
            status: 'submitted',
            score: '3',
            max_score: '4',
            percentage: '75',
            passed: true,
            started_at: '2026-10-05T09:00:00Z',
            submitted_at: '2026-10-05T09:10:00Z',
          },
        ],
      },
    })

    const [attempt] = await listMyAttempts('quiz-1')

    expect(attempt.percentage).toBe(75)
    expect(attempt.passed).toBe(true)
    // Postgres numerics arrive as strings. Left unconverted, `75` would render as
    // a decimal point and a trailing zero.
    expect(typeof attempt.percentage).toBe('number')
    expect(typeof attempt.score).toBe('number')
  })

  it('keeps an unsubmitted attempt null rather than showing it as zero', async () => {
    respondByTable({
      quiz_attempts: {
        data: [
          {
            id: 'a1',
            quiz_id: 'quiz-1',
            course_id: 'course-1',
            attempt_number: 1,
            status: 'in_progress',
            score: null,
            max_score: null,
            percentage: null,
            passed: null,
            started_at: '2026-10-05T09:00:00Z',
            submitted_at: null,
          },
        ],
      },
    })

    const [attempt] = await listMyAttempts('quiz-1')

    expect(attempt.score).toBeNull()
    expect(attempt.percentage).toBeNull()
    expect(attempt.passed).toBeNull()
  })
})

/**
 * How a form's answers become the payload the grader reads.
 *
 * The `submitAttempt` tests above already prove the service puts a written answer under
 * `text` on the wire - and they passed while the application scored every written answer
 * zero. The service was never the broken layer. The bug was one line up, in the view:
 *
 *     const answers = ref<Record<string, string>>({})          // option id OR text
 *     .map(([questionId, value]) => ({ questionId, optionId: value }))
 *
 * One map holding both kinds of answer has to flatten them into one key before it can
 * build a payload, and it flattened everything into `optionId`. A written answer then
 * reached `submit_quiz_attempt` as `option_id`, the grader read `->>'text'`, found
 * nothing, and scored the question zero however correct it was.
 *
 * Measured on a written question worth 5 points with the accepted answer "4":
 *
 *     {question_id, option_id: "4"}   ->  0.00 points
 *     {question_id, text: "4"}        ->  5.00 points
 *
 * So these tests pin the layer that was actually broken: the mapping from a draft, which
 * keeps the two kinds apart, into the union the service already handled correctly.
 */
const Q_CHOICE = '11111111-1111-4111-8111-111111111111'
const Q_WRITTEN = '22222222-2222-4222-8222-222222222222'
const OPTION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('toSubmittedAnswers', () => {
  it('sends a chosen option under option_id', () => {
    expect(toSubmittedAnswers({ [Q_CHOICE]: { optionId: OPTION_A, text: null } })).toEqual([
      { questionId: Q_CHOICE, optionId: OPTION_A },
    ])
  })

  it('sends a written answer under text, which is the regression this describes', () => {
    const payload = toSubmittedAnswers({ [Q_WRITTEN]: { optionId: null, text: '4' } })

    expect(payload).toEqual([{ questionId: Q_WRITTEN, text: '4' }])
    // The failure, stated as an assertion: a written answer must NOT be sent as an
    // option. Under `option_id` the grader's `->>'text'` is null and the question scores
    // zero however correct the answer was.
    expect('optionId' in payload[0]).toBe(false)
  })

  it('keeps a choice answer and a written answer apart in the same attempt', () => {
    const payload = toSubmittedAnswers({
      [Q_CHOICE]: { optionId: OPTION_A, text: null },
      [Q_WRITTEN]: { optionId: null, text: '4' },
    })

    expect(payload).toHaveLength(2)
    expect(payload.find((a) => a.questionId === Q_CHOICE)).toEqual({
      questionId: Q_CHOICE,
      optionId: OPTION_A,
    })
    expect(payload.find((a) => a.questionId === Q_WRITTEN)).toEqual({
      questionId: Q_WRITTEN,
      text: '4',
    })
  })

  it('never puts a written answer under option_id, whatever the text looks like', () => {
    // An option id is a uuid and typed text is arbitrary, so text can be uuid-shaped.
    // Keying off the shape instead of off which field was set would be the same bug in
    // a different costume.
    const payload = toSubmittedAnswers({
      [Q_WRITTEN]: { optionId: null, text: OPTION_A },
      [Q_CHOICE]: { optionId: null, text: '4' },
    })

    for (const entry of payload) {
      expect('optionId' in entry).toBe(false)
    }
  })

  it('drops an empty answer rather than sending a blank', () => {
    // A blank string satisfies the payload's "present" check while contributing nothing,
    // so an empty answer would sit in the denominator and lower the percentage.
    const payload = toSubmittedAnswers({
      [Q_CHOICE]: { optionId: OPTION_A, text: null },
      [Q_WRITTEN]: { optionId: null, text: '   ' },
    })

    expect(payload).toHaveLength(1)
    expect(payload[0].questionId).toBe(Q_CHOICE)
  })

  it('trims, so the value sent is the value the student can see', () => {
    const payload = toSubmittedAnswers({
      [Q_CHOICE]: { optionId: `  ${OPTION_A}  `, text: null },
      [Q_WRITTEN]: { optionId: null, text: '  4  ' },
    })

    expect(payload[0]).toEqual({ questionId: Q_CHOICE, optionId: OPTION_A })
    expect(payload[1]).toEqual({ questionId: Q_WRITTEN, text: '4' })
  })

  it('prefers the option when a malformed draft carries both', () => {
    // The interface cannot produce this - choosing an option clears the text and typing
    // clears the option - so it is a rule for bad input. An option id is checkable
    // against the question; free text is not.
    expect(toSubmittedAnswers({ [Q_CHOICE]: { optionId: OPTION_A, text: '4' } })).toEqual([
      { questionId: Q_CHOICE, optionId: OPTION_A },
    ])
  })

  it('returns nothing for an empty attempt', () => {
    expect(toSubmittedAnswers({})).toEqual([])
  })

  it('reaches the wire correctly, composing with submitAttempt', async () => {
    rpc.mockResolvedValue({ data: { answers: [] }, error: null })

    await submitAttempt(
      'attempt-1',
      toSubmittedAnswers({
        [Q_CHOICE]: { optionId: OPTION_A, text: null },
        [Q_WRITTEN]: { optionId: null, text: '4' },
      }),
    )

    expect(rpc.mock.calls[0][1].p_answers).toEqual([
      { question_id: Q_CHOICE, option_id: OPTION_A },
      { question_id: Q_WRITTEN, text: '4' },
    ])
  })
})

describe('draftHasAnswer', () => {
  it('is false for a missing draft', () => {
    expect(draftHasAnswer(undefined)).toBe(false)
    expect(draftHasAnswer(null)).toBe(false)
  })

  it('is true for a chosen option and for typed text', () => {
    expect(draftHasAnswer({ optionId: OPTION_A, text: null })).toBe(true)
    expect(draftHasAnswer({ optionId: null, text: '4' })).toBe(true)
  })

  it('is false for whitespace, which the student sees as an untouched box', () => {
    // A progress dot counting a blank box as answered tells the student they have
    // answered a question they have not.
    expect(draftHasAnswer({ optionId: null, text: '   ' })).toBe(false)
    expect(draftHasAnswer({ optionId: '', text: '' })).toBe(false)
  })

  it('agrees with toSubmittedAnswers, so the button and the badge cannot contradict it', () => {
    const drafts: Record<string, DraftAnswer> = {
      [Q_CHOICE]: { optionId: OPTION_A, text: null },
      [Q_WRITTEN]: { optionId: null, text: '   ' },
    }

    expect(Object.values(drafts).filter((d) => draftHasAnswer(d)).length).toBe(
      toSubmittedAnswers(drafts).length,
    )
  })
})

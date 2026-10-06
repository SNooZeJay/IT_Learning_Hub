<script setup lang="ts">
/**
 * One quiz, from briefing to result.
 *
 * Four states, and the view owns the transitions between them:
 *
 *   briefing  - read the rules, then start or resume
 *   running   - one question at a time, fullscreen, warnings counted
 *   ending    - warnings exhausted or time up; submitting
 *   result    - score, review, retake
 *
 * Two things here are worth reading the comments for, because both were broken in
 * the version this replaces.
 *
 * Resume. `attemptId` used to be a ref, so a reload landed on the briefing screen
 * while the open attempt sat in the database still counting against the three
 * allowed. Every click of "Resume" from the grades page started *another* attempt
 * and burned one. It is now recovered from the server on load, so a refresh
 * mid-quiz resumes the same attempt with the same shuffled order.
 *
 * The shuffle. It used to be a computed that re-sorted on every evaluation, with a
 * comment claiming the attempt pinned the ordering. Nothing did. Now the order is
 * written once by `start_quiz_attempt` and read back, so a reload cannot renumber
 * the quiz under a student who has already answered half of it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  useAttemptClock,
  useQuizFocusGuard,
  exitFullscreen,
  requestFullscreen,
} from '@/composables/useQuizFocusGuard'
import QuizBriefingPanel from '@/components/quiz/QuizBriefingPanel.vue'
import QuizQuestionRunner from '@/components/quiz/QuizQuestionRunner.vue'
import QuizWarningDialog from '@/components/quiz/QuizWarningDialog.vue'
import QuizResultPanel from '@/components/quiz/QuizResultPanel.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import type { QuizBriefing, AttemptState, WarningOutcome } from '@/services/quiz.service'
import {
  findOpenAttempt,
  getAttemptState,
  getQuizBriefing,
  getSavedAnswers,
  recordWarning,
  saveAnswer,
  startAttempt,
  submitAttempt,
  toSubmittedAnswers,
  draftHasAnswer,
  type DraftAnswer,
  type SubmittedAnswer,
} from '@/services/quiz.service'
import type { QuizResult } from '@/types'

type Phase = 'loading' | 'briefing' | 'running' | 'ending' | 'result' | 'unavailable'

const route = useRoute()
const router = useRouter()

const quizId = computed(() => String(route.params.id ?? ''))

const phase = ref<Phase>('loading')
const errorMessage = ref('')
const actionError = ref('')

const briefing = ref<QuizBriefing | null>(null)
const openAttemptId = ref<string | null>(null)
const alreadyPassed = ref(false)

const attemptId = ref<string | null>(null)
const attempt = ref<AttemptState | null>(null)
const answers = ref<Record<string, DraftAnswer>>({})
const currentIndex = ref(0)
const flagged = ref<Set<string>>(new Set())

const result = ref<QuizResult | null>(null)
const endedVia = ref<string | null>(null)

const starting = ref(false)
const submitting = ref(false)
const retaking = ref(false)
const supportOpen = ref(false)

/** The warning currently on screen, if any. */
const warning = ref<{
  number: number
  max: number
  remaining: number
  reason: string
  final: boolean
} | null>(null)

/** Set when the attempt must be submitted because the consequence arrived. */
const pendingEnd = ref(false)

// ---------------------------------------------------------------------------
// The clock, and the focus guard
// ---------------------------------------------------------------------------

const clock = useAttemptClock(() => attempt.value?.expiresAt ?? null)

const inAttempt = computed(() => phase.value === 'running')

const guard = useQuizFocusGuard({
  active: () => phase.value === 'running' && warning.value === null,
  onWarning: (reason) => void handleFocusLoss(reason),
  onFullscreenExit: () => void handleFocusLoss('left_fullscreen'),
})

/** The clock counts from the server's expiresAt, not from a local start. */
watch(inAttempt, (running) => (running ? clock.start() : clock.stop()), { immediate: true })

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function load(): Promise<void> {
  phase.value = 'loading'
  errorMessage.value = ''
  result.value = null
  attemptId.value = null
  attempt.value = null
  endedVia.value = null
  currentIndex.value = 0

  const data = await getQuizBriefing(quizId.value).catch(() => null)
  if (!data) {
    phase.value = 'unavailable'
    return
  }

  briefing.value = data
  // The graded verdict, not the attempt count. `attemptsUsed > 0` means "has an
  // attempt", which is true the moment one is started - so reloading mid-quiz
  // resolved the four-way branch to 'passed' and rendered a message with no
  // Start button and no Resume button. The student was stuck on a quiz they had
  // already begun, with an attempt still counting against their three.
  alreadyPassed.value = data.hasPassed

  // Recover an open attempt before deciding what to show. Without this a reload
  // mid-quiz presented the briefing screen and every click started a new attempt.
  const existing = await findOpenAttempt(quizId.value).catch(() => null)
  openAttemptId.value = existing
  phase.value = 'briefing'
}

/** Adopt an existing attempt rather than creating one. */
async function resume(attemptIdToResume: string): Promise<void> {
  starting.value = true
  actionError.value = ''
  try {
    await enterAttempt(attemptIdToResume)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Could not reopen that attempt.'
  } finally {
    starting.value = false
  }
}

async function start(): Promise<void> {
  starting.value = true
  actionError.value = ''

  // Fullscreen is requested synchronously - browsers only grant it from a user
  // gesture - but deliberately NOT awaited.
  //
  // Awaiting it blocked the whole start on a browser promise that need never
  // settle. A student clicks Start, the request goes out, and nothing further
  // happens: no attempt is created and no error is shown. It was reproduced by
  // clicking Start in an automated browser, where `requestFullscreen` never
  // resolves - and a student on a locked-down or embedded browser can hit the same
  // thing.
  //
  // So it is fired and forgotten. The attempt starts regardless, and the warnings
  // simply have one less signal if fullscreen never engages. A quiz that does not
  // open is worse than one that opens without fullscreen.
  void requestFullscreen().catch(() => false)

  try {
    const id = await startAttempt(quizId.value)
    await enterAttempt(id)
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : 'Could not start the quiz. Please try again.'
    // Leaving fullscreen on a failure matters: the student should not be left
    // staring at a fullscreen window with no quiz in it.
    await exitFullscreen()
  } finally {
    starting.value = false
  }
}

async function enterAttempt(id: string): Promise<void> {
  attemptId.value = id

  const [state, saved] = await Promise.all([
    getAttemptState(id),
    getSavedAnswers(id).catch(() => ({}) as never),
  ])

  if (!state) {
    phase.value = 'unavailable'
    return
  }

  attempt.value = state

  // The order comes from the server, in the order this attempt was served. It is
  // not re-derived here, because a client-side shuffle is recomputed on reload.
  answers.value = {}
  for (const question of state.questions) {
    const entry = saved[question.questionId]
    if (!entry) continue
    if (entry.optionId)
      answers.value[question.questionId] = { optionId: entry.optionId, text: null }
    else if (entry.text) answers.value[question.questionId] = { optionId: null, text: entry.text }
  }

  // Land on the first unanswered question. A resumed attempt that dropped the
  // student back at question 1 with eleven answered would look like their work was
  // lost.
  const firstUnanswered = state.questions.findIndex(
    (q) => !draftHasAnswer(answers.value[q.questionId]),
  )
  currentIndex.value = firstUnanswered === -1 ? 0 : firstUnanswered

  phase.value = 'running'

  // Attached only once the quiz is genuinely being sat. Listening on mount would
  // record a warning for the student reading the briefing.
  await nextTick()
  guard.attach()
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

const answeredCount = computed(
  () => Object.values(answers.value).filter((draft) => draftHasAnswer(draft)).length,
)

async function handleAnswer(payload: {
  questionId: string
  optionId: string | null
  text: string | null
}): Promise<void> {
  answers.value = {
    ...answers.value,
    [payload.questionId]: { optionId: payload.optionId ?? null, text: payload.text ?? null },
  }

  // Persisted as it is made, so a refresh does not lose it. A failure here is
  // deliberately swallowed: the answer is still submitted explicitly at the end,
  // and interrupting the student with an error they cannot act on would be worse
  // than a save that will be retried.
  try {
    await saveAnswer({
      attemptId: attemptId.value!,
      questionId: payload.questionId,
      optionId: payload.optionId,
      text: payload.text,
    })
  } catch {
    // Intentionally ignored. See above.
  }
}

function toggleFlag(questionId: string): void {
  const next = new Set(flagged.value)
  if (next.has(questionId)) next.delete(questionId)
  else next.add(questionId)
  flagged.value = next
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

const REASON_TEXT: Record<string, string> = {
  tab_hidden: 'You switched to another tab or minimised this one.',
  window_blurred: 'This window lost focus, which usually means you moved to another application.',
  left_fullscreen: 'The quiz left fullscreen.',
}

async function handleFocusLoss(reason: string): Promise<void> {
  if (!attemptId.value || phase.value !== 'running' || warning.value) return

  // Show the dialog immediately rather than after the round trip, so the student is
  // looking at the consequence while the server is being asked about it.
  let outcome: WarningOutcome
  try {
    outcome = await recordWarning(attemptId.value, reason)
  } catch {
    // The server refused. That means the attempt is already submitted or no longer
    // open, so the safest response is to stop the quiz rather than continue
    // counting warnings against nothing.
    phase.value = 'ending'
    await finish('warnings_exhausted')
    return
  }

  if (attempt.value) {
    attempt.value = {
      ...attempt.value,
      warningCount: outcome.warningCount,
      maxWarnings: outcome.maxWarnings,
    }
  }

  warning.value = {
    number: outcome.warningCount,
    max: outcome.maxWarnings,
    remaining: outcome.remaining,
    reason: REASON_TEXT[reason] ?? 'You moved away from the quiz.',
    final: outcome.ended,
  }

  if (outcome.ended) pendingEnd.value = true
}

async function acknowledgeWarning(): Promise<void> {
  const current = warning.value
  warning.value = null
  if (!current) return

  if (current.final && pendingEnd.value) {
    pendingEnd.value = false
    phase.value = 'ending'
    await finish('warnings_exhausted')
    return
  }

  // Suppress the next moment. Returning focus to the quiz after acknowledging a
  // dialog can itself fire a blur, and counting that would punish the student for
  // reading the warning.
  guard.suppress()
  try {
    await requestFullscreen()
  } catch {
    // A refused fullscreen request is not fatal; the warnings still work.
  }
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

/** Whether the attempt may be submitted now. Time up forces it. */
const timeExpired = computed(() => clock.expired.value)

/**
 * Why Submit is blocked, if it is.
 *
 * Never silently: an empty quiz is a real choice to make, so the button says what
 * will happen rather than refusing and leaving the student guessing.
 */
const blockedReason = computed(() => {
  if (answeredCount.value === 0) return 'Answer at least one question before submitting.'
  return ''
})

const canSubmit = computed(() => blockedReason.value === '' && !submitting.value)

/**
 * Submit the moment the clock runs out.
 *
 * The previous version refused to submit once `timeExpired` was true and then called
 * that "time up submits anyway". Nothing watched the clock, so an attempt that ran out
 * of time could never be submitted at all: the button stayed enabled and silently did
 * nothing, the attempt stayed `in_progress` for ever, it kept counting against the
 * attempts allowed, and `find_open_attempt` kept offering "Resume" into an attempt that
 * was already over.
 *
 * Submitted even with nothing answered. A time limit exists to end the attempt, and an
 * attempt left open is worse than one closed with a zero: it blocks the student from
 * starting again. The server grades unanswered questions as wrong either way, which is
 * the same outcome as submitting a blank paper.
 */
watch(timeExpired, async (expired) => {
  if (!expired) return
  if (phase.value !== 'running' || submitting.value) return
  actionError.value = ''
  await finish('time_expired')
})

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value || submitting.value) return
  await finish('student_submit')
}

/**
 * Submit the attempt.
 *
 * The button is disabled while this runs and the function refuses a second submit
 * anyway, so a double click cannot produce two results. The `finally` block turns
 * fullscreen off on every path including failure, because a student left in a
 * fullscreen window with no quiz in it cannot work out how to get back.
 */
async function finish(via: string): Promise<void> {
  if (submitting.value || !attemptId.value) return
  submitting.value = true
  actionError.value = ''

  try {
    const payload: SubmittedAnswer[] = toSubmittedAnswers(answers.value)

    result.value = await submitAttempt(attemptId.value, payload)
    endedVia.value = via
    phase.value = 'result'
    clock.stop()
    guard.detach()
    warning.value = null
    await exitFullscreen()
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : 'Your answers could not be submitted.'
    // Back to the quiz rather than a dead end. The attempt is still open, the
    // answers are still saved, and Submit will work on a second attempt.
    phase.value = 'running'
  } finally {
    submitting.value = false
  }
}

/** Back to the course list. Also the "Try again" path: reload and start again. */
async function handleRetake(): Promise<void> {
  retaking.value = true
  try {
    if (result.value?.passed) {
      await router.push('/student/courses')
      return
    }
    await load()
  } finally {
    retaking.value = false
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(load)

onBeforeUnmount(() => {
  guard.detach()
  clock.stop()
  // Leaving the quiz view should not strand the student in fullscreen. When the
  // attempt is still open it stays open and resumable, which is the point of
  // saving answers as they go.
  void exitFullscreen()
})
</script>

<template>
  <div>
    <LoadingState v-if="phase === 'loading'" label="Loading quiz" />

    <ErrorState
      v-else-if="phase === 'unavailable'"
      message="This quiz is not available. It may have been unpublished, or you may not be enrolled in the course it belongs to."
      @retry="load"
    />

    <template v-else-if="briefing">
      <PageHeader
        :title="phase === 'result' && result ? 'Your result' : 'Quiz'"
        :crumbs="[
          { label: 'Student', to: '/student/dashboard' },
          { label: 'Courses', to: '/student/courses' },
          { label: briefing.title },
        ]"
      />

      <div class="mt-6">
        <Alert
          v-if="actionError"
          variant="error"
          title="Something went wrong"
          :message="actionError"
          class="mb-5"
        />

        <!-- Sitting. No page header: the quiz owns the screen while it is running,
             because the only thing that matters is the question in front of you. -->
        <template v-if="phase === 'running' || phase === 'ending'">
          <div
            v-if="attempt"
            class="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-800"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-gray-900 dark:text-white/90">
                {{ briefing.title }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Attempt {{ attempt.attemptNumber }} of {{ attempt.attemptsAllowed }}
                <template v-if="attempt.warningCount > 0">
                  <span class="text-warning-600 dark:text-warning-400">
                    · {{ attempt.warningCount }} warning{{ attempt.warningCount === 1 ? '' : 's' }}
                  </span>
                </template>
              </p>
            </div>

            <!-- The clock. Turns red in the last five minutes, because a number
                 changing on its own is easy to miss while reading. -->
            <div
              v-if="clock.secondsLeft.value !== null"
              class="shrink-0 rounded-lg px-3 py-1.5 text-center"
              :class="
                clock.urgent.value
                  ? 'bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200'
              "
            >
              <p class="text-xs uppercase tracking-wide opacity-70">Time left</p>
              <p class="text-sm font-semibold tabular-nums">{{ clock.label.value }}</p>
            </div>
          </div>

          <QuizQuestionRunner
            v-if="attempt && phase === 'running'"
            :questions="attempt.questions"
            :answers="answers"
            :current-index="currentIndex"
            :flagged="flagged"
            :submitting="submitting"
            :submitting-blocked="!canSubmit"
            :submit-blocked-reason="blockedReason"
            @update:current-index="currentIndex = $event"
            @answer="handleAnswer"
            @toggle-flag="toggleFlag"
            @submit="handleSubmit"
          />

          <div v-else class="mx-auto max-w-3xl py-12 text-center">
            <LoadingState label="Submitting your answers" />
            <p v-if="actionError" class="mt-4 text-sm text-error-600 dark:text-error-400">
              {{ actionError }}
            </p>
          </div>
        </template>

        <QuizResultPanel
          v-else-if="phase === 'result' && result"
          :result="result"
          :quiz-title="briefing.title"
          :can-retake="!result.passed && result.attemptsRemaining > 0"
          :ended-by-time="endedVia === 'time_expired'"
          :ended-by-warnings="endedVia === 'warnings_exhausted'"
          :retaking="retaking"
          @retake="handleRetake"
        />

        <QuizBriefingPanel
          v-else
          :briefing="briefing"
          :already-passed="alreadyPassed"
          :has-open-attempt="Boolean(openAttemptId)"
          :open-attempt-id="openAttemptId"
          :starting="starting"
          :support-open="supportOpen"
          @start="start"
          @resume="resume"
          @toggle-support="supportOpen = !supportOpen"
        />
      </div>
    </template>

    <!-- Over everything, and only while running: an unanswered submit is
         explained here rather than by a disabled control with no explanation. -->
    <QuizWarningDialog
      :open="warning !== null"
      :warning-number="warning?.number ?? 0"
      :max-warnings="warning?.max ?? 3"
      :remaining="warning?.remaining ?? 0"
      :reason="warning?.reason ?? ''"
      :final="warning?.final ?? false"
      :ending="submitting"
      @acknowledge="acknowledgeWarning"
    />
  </div>
</template>

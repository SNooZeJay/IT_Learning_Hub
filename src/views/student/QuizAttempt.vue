<template>
  <div>
    <PageHeader
      :title="quiz?.title ?? 'Quiz'"
      :subtitle="headerSubtitle"
      :crumbs="[
        { label: 'Student', to: '/student/dashboard' },
        { label: 'My courses', to: '/student/courses' },
        { label: 'Quiz' },
      ]"
    />

    <LoadingState v-if="isLoading" label="Loading quiz" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="!quiz"
      title="This quiz is not available"
      description="It may have been unpublished, or the link may be out of date."
      :icon="ClipboardList"
    />

    <!-- ============================ RESULT ============================ -->
    <template v-else-if="result">
      <div class="mx-auto max-w-3xl">
        <div
          class="rounded-lg border p-6"
          :class="
            result.passed
              ? 'border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10'
              : 'border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10'
          "
        >
          <div class="flex items-start gap-3">
            <CheckCircle2 v-if="result.passed" class="mt-0.5 size-6 shrink-0 text-success-600" />
            <XCircle v-else class="mt-0.5 size-6 shrink-0 text-warning-600" />
            <div>
              <h2 class="text-xl font-semibold tracking-tight text-gray-900 dark:text-white/90">
                {{ result.passed ? 'Passed' : 'Not passed' }}
              </h2>
              <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
                You scored {{ result.percentage }}%, which is {{ result.passingScore }}% to pass.
              </p>
            </div>
          </div>

          <dl class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div
              v-for="stat in [
                { label: 'Score', value: `${result.score} / ${result.maxScore}` },
                { label: 'Percentage', value: `${result.percentage}%` },
                { label: 'Pass mark', value: `${result.passingScore}%` },
                { label: 'Attempts left', value: String(result.attemptsRemaining) },
              ]"
              :key="stat.label"
            >
              <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                {{ stat.label }}
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">
                {{ stat.value }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Per-question breakdown. Suppressed when the quiz says only the
             outcome is disclosed, which is the whole point of that flag. -->
        <div v-if="result.revealAnswers && result.answers.length" class="mt-8">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white/90">Question review</h3>
          <ul class="mt-3 space-y-2">
            <li
              v-for="answer in result.answers"
              :key="answer.questionId"
              class="flex items-center gap-3 rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <CheckCircle2
                v-if="answer.isCorrect"
                class="size-5 shrink-0 text-success-600"
                aria-hidden="true"
              />
              <XCircle v-else class="size-5 shrink-0 text-error-600" aria-hidden="true" />
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Question {{ questionNumber(answer.questionId) }} —
                {{ answer.isCorrect ? 'correct' : 'incorrect' }}
              </span>
              <span class="ms-auto text-sm text-gray-500 dark:text-gray-400">
                {{ answer.pointsAwarded }} / {{ answer.points }} pts
              </span>
            </li>
          </ul>
        </div>

        <p
          v-else-if="!result.revealAnswers"
          class="mt-6 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          This quiz does not reveal which questions were answered correctly. Only the score is
          shown.
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          <button
            v-if="result.passed"
            type="button"
            class="inline-flex h-11 items-center justify-center rounded-md bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            @click="finish"
          >
            Back to my courses
          </button>
          <button
            v-else-if="result.attemptsRemaining > 0"
            type="button"
            class="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
            :disabled="isBusy"
            @click="begin"
          >
            Try again ({{ result.attemptsRemaining }} left)
          </button>
          <RouterLink
            to="/student/courses"
            class="inline-flex h-11 items-center justify-center rounded-md border border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Back to my courses
          </RouterLink>
        </div>
      </div>
    </template>

    <!-- ============================ SITTING ============================ -->
    <template v-else-if="attemptId">
      <form class="mx-auto max-w-3xl" @submit.prevent="submit">
        <!-- Timer. Advisory, not enforced: the deadline is not checked by the
             database, so showing a hard countdown that then lets you submit
             anyway would be a lie. -->
        <div
          v-if="remainingSeconds !== null"
          class="mb-5 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          role="timer"
          aria-live="off"
        >
          <Timer class="size-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <span class="text-gray-700 dark:text-gray-300">
            {{ remainingSeconds }}s remaining on this attempt
          </span>
          <span class="ms-auto text-xs text-gray-500 dark:text-gray-400">
            The timer is a guide. Submitting is always allowed.
          </span>
        </div>

        <ol class="space-y-5">
          <li
            v-for="(question, index) in questions"
            :key="question.id"
            class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
          >
            <fieldset>
              <legend class="text-sm font-medium text-gray-900 dark:text-white/90">
                <span class="text-gray-500 dark:text-gray-400">Question {{ index + 1 }}.</span>
                {{ question.prompt }}
                <span class="ms-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                  ({{ question.points }} {{ question.points === 1 ? 'point' : 'points' }})
                </span>
              </legend>

              <div v-if="question.questionType === 'short_text'" class="mt-3">
                <input
                  v-model="answers[question.id]"
                  type="text"
                  :aria-label="`Your answer for question ${index + 1}`"
                  placeholder="Type your answer"
                  class="w-full rounded border border-gray-300 bg-white py-2.5 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>

              <div v-else class="mt-3 space-y-2">
                <label
                  v-for="option in question.options"
                  :key="option.id"
                  class="flex cursor-pointer items-center gap-3 rounded border border-gray-200 px-4 py-3 text-sm transition-colors hover:bg-gray-50 has-checked:border-brand-500 has-checked:bg-brand-50 dark:border-gray-700 dark:hover:bg-gray-700/40 dark:has-checked:bg-brand-500/10"
                >
                  <input
                    v-model="answers[question.id]"
                    type="radio"
                    :name="question.id"
                    :value="option.id"
                    class="size-4 shrink-0 text-brand-600 focus:ring-brand-500"
                  />
                  <span class="text-gray-700 dark:text-gray-300">{{ option.optionText }}</span>
                </label>

                <p
                  v-if="question.options.length === 0"
                  class="text-sm text-warning-600 dark:text-warning-400"
                >
                  This question has no answer options yet. Ask your instructor to check it.
                </p>
              </div>
            </fieldset>
          </li>
        </ol>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            class="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            :disabled="isBusy"
          >
            <LoaderCircle v-if="isBusy" class="me-2 size-4 animate-spin" aria-hidden="true" />
            Submit answers
          </button>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ answeredCount }} of {{ questions.length }} answered
          </p>
        </div>
      </form>
    </template>

    <!-- ============================ NOT STARTED ============================ -->
    <div v-else class="mx-auto max-w-3xl">
      <div
        class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 class="text-lg font-semibold tracking-tight text-gray-900 dark:text-white/90">
          Ready when you are
        </h2>
        <p v-if="quiz.description" class="mt-2 text-sm text-gray-700 dark:text-gray-300">
          {{ quiz.description }}
        </p>

        <dl class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div
            v-for="stat in [
              { label: 'Questions', value: String(questions.length) },
              { label: 'To pass', value: `${quiz.passingScore}%` },
              { label: 'Attempts used', value: `${attemptsUsed} of ${quiz.attemptsAllowed}` },
              {
                label: 'Time limit',
                value: quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : 'None',
              },
            ]"
            :key="stat.label"
          >
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {{ stat.label }}
            </dt>
            <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">
              {{ stat.value }}
            </dd>
          </div>
        </dl>

        <p
          v-if="bestAttempt"
          class="mt-5 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          Your best so far is {{ bestAttempt.percentage }}% on attempt
          {{ bestAttempt.attemptNumber }}.
        </p>

        <p
          v-if="remaining === 0"
          class="mt-5 rounded border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300"
        >
          You have used all {{ quiz.attemptsAllowed }} attempts for this quiz.
        </p>

        <button
          type="button"
          class="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          :disabled="isBusy || remaining === 0"
          @click="begin"
        >
          <LoaderCircle v-if="isBusy" class="me-2 size-4 animate-spin" aria-hidden="true" />
          {{ attemptsUsed === 0 ? 'Start quiz' : 'Start another attempt' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircle2, ClipboardList, LoaderCircle, Timer, XCircle } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import {
  attemptsRemaining,
  getQuiz,
  listMyAttempts,
  QuizError,
  startAttempt,
  submitAttempt,
} from '@/services/quiz.service'
import type { SubmittedAnswer } from '@/services/quiz.service'
import type { Quiz, QuizAttempt, QuizQuestion, QuizResult } from '@/types'

const route = useRoute()
const router = useRouter()

const quiz = ref<Quiz | null>(null)
const attempts = ref<QuizAttempt[]>([])
const attemptId = ref<string | null>(null)
const result = ref<QuizResult | null>(null)
/** questionId -> chosen option id, or the typed text for a short answer. */
const answers = ref<Record<string, string>>({})

const isLoading = ref(true)
const isBusy = ref(false)
const errorMessage = ref('')

const remainingSeconds = ref<number | null>(null)
let ticker: ReturnType<typeof setInterval> | null = null

const quizId = computed(() => String(route.params.id ?? ''))

const attemptsUsed = computed(() => attempts.value.length)
const remaining = computed(() =>
  quiz.value ? attemptsRemaining(quiz.value, attemptsUsed.value) : 0,
)

/**
 * Shuffling happens here rather than in SQL because it is presentation: it must
 * not change on a refresh mid-quiz, and the attempt is what pins the ordering.
 */
const questions = computed<QuizQuestion[]>(() => {
  if (!quiz.value) return []
  const list = quiz.value.questions
  return quiz.value.shuffleQuestions ? [...list].sort(() => Math.random() - 0.5) : list
})

const answeredCount = computed(
  () => questions.value.filter((question) => (answers.value[question.id] ?? '').trim()).length,
)

const bestAttempt = computed(() =>
  attempts.value
    .filter((attempt) => attempt.percentage !== null)
    .reduce<QuizAttempt | null>(
      (best, attempt) =>
        !best || (attempt.percentage ?? 0) > (best.percentage ?? 0) ? attempt : best,
      null,
    ),
)

const headerSubtitle = computed(() => {
  if (!quiz.value) return 'Check your answers and submit.'
  const count = quiz.value.questions.length
  return `${count} question${count === 1 ? '' : 's'} · ${quiz.value.passingScore}% to pass`
})

function questionNumber(questionId: string): number {
  return questions.value.findIndex((question) => question.id === questionId) + 1
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const [loaded, mine] = await Promise.all([getQuiz(quizId.value), listMyAttempts(quizId.value)])
    quiz.value = loaded
    attempts.value = mine
  } catch (error) {
    // QuizError messages are written to be shown to a person ("no attempts
    // remaining: 3 of 3 used"), so they pass through untouched.
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load this quiz. Try again.'
  } finally {
    isLoading.value = false
  }
}

function startTimer(minutes: number | null): void {
  stopTimer()
  if (!minutes) return
  remainingSeconds.value = minutes * 60
  ticker = setInterval(() => {
    if (remainingSeconds.value === null) return
    remainingSeconds.value = Math.max(remainingSeconds.value - 1, 0)
    if (remainingSeconds.value === 0) stopTimer()
  }, 1000)
}

function stopTimer(): void {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

async function begin(): Promise<void> {
  isBusy.value = true
  errorMessage.value = ''
  try {
    attemptId.value = await startAttempt(quizId.value)
    result.value = null
    answers.value = {}
    attempts.value = await listMyAttempts(quizId.value)
    startTimer(quiz.value?.timeLimitMinutes ?? null)
  } catch (error) {
    if (error instanceof QuizError) errorMessage.value = error.message
    else errorMessage.value = 'Could not start this quiz. Try again.'
  } finally {
    isBusy.value = false
  }
}

async function submit(): Promise<void> {
  if (!attemptId.value) return
  isBusy.value = true
  errorMessage.value = ''
  try {
    const payload: SubmittedAnswer[] = []
    for (const question of questions.value) {
      const answer = (answers.value[question.id] ?? '').trim()
      if (!answer) continue
      payload.push(
        question.questionType === 'short_text'
          ? { questionId: question.id, text: answer }
          : { questionId: question.id, optionId: answer },
      )
    }

    // The score comes back from the database. Nothing here computes one.
    result.value = await submitAttempt(attemptId.value, payload)
    stopTimer()
    attempts.value = await listMyAttempts(quizId.value)
  } catch (error) {
    if (error instanceof QuizError) errorMessage.value = error.message
    else errorMessage.value = 'Could not submit your answers. Try again.'
  } finally {
    isBusy.value = false
  }
}

function finish(): void {
  void router.push('/student/courses')
}

onMounted(load)
onBeforeUnmount(stopTimer)
</script>

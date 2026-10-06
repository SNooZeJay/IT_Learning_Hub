<script setup lang="ts">
/**
 * The result of an attempt.
 *
 * Ported from the old system's result blade, which was the best screen in it: the
 * pass or fail as a word rather than a colour, the percentage, the points, and a
 * per-question review with three states per option - the correct one, your answer,
 * and your answer when it is also the correct one.
 *
 * One thing is done differently, and it is the important one. The old system
 * always revealed the key after submission. Here that is `revealAnswers`, and
 * when it is off the server does not send the correctness data at all - so this
 * component cannot show what it was not given. Hiding it here would be a promise
 * the network payload did not keep, which is the bug that hole was.
 */
import { computed } from 'vue'
import {
  Check,
  CheckCircle2,
  CircleSlash,
  Clock,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import type { QuizResult } from '@/types'

const props = defineProps<{
  result: QuizResult
  quizTitle: string
  /** True when a further attempt is allowed by the quiz's own limit. */
  canRetake: boolean
  /** True when the attempt ended because the clock ran out, not by choice. */
  endedByTime: boolean
  /** True when the attempt ended because warnings ran out. */
  endedByWarnings: boolean
  retaking: boolean
}>()

const emit = defineEmits<{ retake: [] }>()

const correctCount = computed(() => props.result.answers.filter((a) => a.isCorrect === true).length)

const answeredCount = computed(() => props.result.answers.length)

/**
 * How the attempt ended, in words.
 *
 * The three outcomes are genuinely different to a student - finished, ran out of
 * time, and ran out of warnings - and collapsing them into "submitted" hides the
 * two that somebody might need to ask about.
 */
const outcome = computed(() => {
  if (props.endedByWarnings) {
    return {
      tone: 'warning' as const,
      icon: ShieldAlert,
      heading: 'Submitted after too many warnings',
      detail:
        'This attempt was submitted automatically when your warnings ran out. Everything you had answered was marked.',
    }
  }
  if (props.endedByTime) {
    return {
      tone: 'warning' as const,
      icon: Clock,
      heading: 'Submitted when time ran out',
      detail: 'Your answers were marked at the moment the limit was reached.',
    }
  }
  return {
    tone: 'neutral' as const,
    icon: CheckCircle2,
    heading: 'Submitted',
    detail: 'Your answers were marked when you submitted.',
  }
})

const percent = computed(() => Number(props.result.percentage ?? 0))
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- Pass or fail. A word, not only a colour: colour alone fails anyone who
         cannot distinguish the two, and it fails in a screenshot. -->
    <div
      class="rounded-lg border p-6"
      :class="
        result.passed
          ? 'border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/[0.08]'
          : 'border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/[0.08]'
      "
    >
      <div class="flex items-start gap-4">
        <CheckCircle2
          v-if="result.passed"
          class="mt-0.5 size-8 shrink-0 text-success-600 dark:text-success-400"
          aria-hidden="true"
        />
        <XCircle
          v-else
          class="mt-0.5 size-8 shrink-0 text-error-600 dark:text-error-400"
          aria-hidden="true"
        />

        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white/90">
            {{ result.passed ? 'Passed' : 'Not passed' }}
          </h1>
          <p class="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{{ quizTitle }}</p>
        </div>

        <div class="shrink-0 text-end">
          <p
            class="text-3xl font-semibold tracking-tight tabular-nums"
            :class="
              result.passed
                ? 'text-success-700 dark:text-success-400'
                : 'text-error-700 dark:text-error-400'
            "
          >
            {{ percent }}%
          </p>
          <p class="mt-0.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
            {{ result.score }} of {{ result.maxScore }} points
          </p>
        </div>
      </div>

      <!-- How it ended. Named rather than assumed. -->
      <div class="mt-5 flex items-start gap-2.5 border-t border-black/5 pt-4 dark:border-white/10">
        <component
          :is="outcome.icon"
          class="mt-0.5 size-4 shrink-0"
          :class="
            outcome.tone === 'warning' ? 'text-warning-600 dark:text-warning-400' : 'text-gray-500'
          "
          aria-hidden="true"
        />
        <p class="text-sm leading-6 text-gray-700 dark:text-gray-200">
          <strong class="font-semibold">{{ outcome.heading }}.</strong>
          {{ outcome.detail }}
        </p>
      </div>
    </div>

    <!-- The numbers. -->
    <dl
      class="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4 dark:border-gray-800 dark:bg-gray-800"
    >
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Pass mark</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ result.passingScore }}%
        </dd>
      </div>
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Correct</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ result.revealAnswers ? correctCount : '—' }}
        </dd>
      </div>
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Answered</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ answeredCount }}
        </dd>
      </div>
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Attempts left</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ result.attemptsRemaining }}
        </dd>
      </div>
    </dl>

    <!-- Review. Only when the server sent it. -->
    <section
      v-if="result.revealAnswers && result.answers.length > 0"
      class="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      aria-labelledby="quiz-review-heading"
    >
      <h2 id="quiz-review-heading" class="text-theme-sm text-gray-900 dark:text-white/90">
        Review
      </h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Each question with the right answer marked, and yours beside it.
      </p>

      <ol role="list" class="mt-4 flex flex-col gap-4">
        <li
          v-for="(answer, index) in result.answers"
          :key="answer.questionId"
          class="rounded-lg border px-4 py-4"
          :class="
            answer.isCorrect === true
              ? 'border-success-200 bg-success-50/40 dark:border-success-500/25 dark:bg-success-500/[0.05]'
              : answer.isCorrect === false
                ? 'border-error-200 bg-error-50/40 dark:border-error-500/25 dark:bg-error-500/[0.05]'
                : 'border-gray-200 dark:border-gray-800'
          "
        >
          <div class="flex items-start gap-3">
            <span class="mt-0.5 shrink-0">
              <CheckCircle2
                v-if="answer.isCorrect === true"
                class="size-5 text-success-600 dark:text-success-400"
                aria-hidden="true"
              />
              <XCircle
                v-else-if="answer.isCorrect === false"
                class="size-5 text-error-600 dark:text-error-400"
                aria-hidden="true"
              />
              <CircleSlash v-else class="size-5 text-gray-400" aria-hidden="true" />
            </span>

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                Question {{ index + 1 }}
                <span
                  v-if="answer.isCorrect !== undefined"
                  class="ms-1.5 font-normal"
                  :class="
                    answer.isCorrect
                      ? 'text-success-700 dark:text-success-400'
                      : 'text-error-700 dark:text-error-400'
                  "
                >
                  {{ answer.isCorrect ? 'correct' : 'incorrect' }}
                </span>
                <span
                  v-if="answer.pointsAwarded !== undefined"
                  class="ms-1.5 font-normal text-gray-500 tabular-nums dark:text-gray-400"
                >
                  {{ answer.pointsAwarded }} of {{ answer.points }} points
                </span>
              </p>

              <!-- The question itself. A review that does not repeat what was
                   asked leaves the student to match it against memory. -->
              <p
                v-if="answer.prompt"
                class="mt-1.5 text-sm leading-6 text-gray-700 dark:text-gray-200"
              >
                {{ answer.prompt }}
              </p>

              <!-- Options. Three states, which is what makes the difference
                   legible: the correct one, your wrong one, and the case where
                   your choice was also the right one. -->
              <ul
                v-if="answer.options && answer.options.length > 0"
                class="mt-3 flex flex-col gap-1.5"
              >
                <li
                  v-for="option in answer.options"
                  :key="option.id"
                  class="flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm"
                  :class="[
                    option.isCorrect
                      ? 'border-success-300 bg-success-50 text-success-900 dark:border-success-500/40 dark:bg-success-500/10 dark:text-success-100'
                      : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300',
                    option.id === answer.yourOptionId && !option.isCorrect
                      ? 'border-error-300 dark:border-error-500/40'
                      : '',
                    option.id === answer.yourOptionId && option.isCorrect
                      ? 'ring-1 ring-success-500'
                      : '',
                  ]"
                >
                  <Check
                    v-if="option.isCorrect"
                    class="mt-0.5 size-4 shrink-0 text-success-600 dark:text-success-400"
                    aria-hidden="true"
                  />
                  <X
                    v-else-if="option.id === answer.yourOptionId"
                    class="mt-0.5 size-4 shrink-0 text-error-500 dark:text-error-400"
                    aria-hidden="true"
                  />
                  <span v-else class="mt-0.5 size-4 shrink-0" aria-hidden="true" />

                  <span class="min-w-0 flex-1 leading-6">{{ option.optionText }}</span>

                  <span class="mt-0.5 shrink-0 text-xs font-medium whitespace-nowrap">
                    <template v-if="option.id === answer.yourOptionId && option.isCorrect">
                      Your answer
                    </template>
                    <template v-else-if="option.isCorrect">Correct answer</template>
                    <template v-else-if="option.id === answer.yourOptionId"> Your answer </template>
                  </span>
                </li>
              </ul>

              <p
                v-else-if="answer.yourOptionId === null"
                class="mt-3 text-sm text-gray-500 dark:text-gray-400"
              >
                You did not answer this question.
              </p>

              <!-- The explanation is the answer in words, so it sits behind the
                   same flag as the boolean rather than being assumed safe. -->
              <p
                v-if="answer.explanation"
                class="mt-3 border-s-2 border-gray-200 ps-3 text-sm leading-6 text-gray-600 italic dark:border-gray-700 dark:text-gray-400"
              >
                {{ answer.explanation }}
              </p>
            </div>
          </div>
        </li>
      </ol>
    </section>

    <!-- When the key is withheld, say so and say why. An unexplained absence reads
         as a bug, and a student who thinks the review failed will submit again. -->
    <section
      v-else
      class="mt-6 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-white/[0.02]"
    >
      <TriangleAlert class="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
      <p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
        This quiz does not show which questions were right or wrong, so that a further attempt is a
        fair one. Your score and pass mark are above.
      </p>
    </section>

    <!-- What next. -->
    <div
      class="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6 dark:border-gray-800"
    >
      <Button variant="outline" @click="emit('retake')">
        <RefreshCw class="size-4" aria-hidden="true" />
        Back to my courses
      </Button>
      <Button v-if="canRetake" variant="primary" :disabled="retaking" @click="emit('retake')">
        <RefreshCw v-if="retaking" class="size-4 animate-spin" aria-hidden="true" />
        Try again ({{ result.attemptsRemaining }} left)
      </Button>
      <p v-else-if="!result.passed" class="text-sm text-gray-500 dark:text-gray-400">
        You have used every attempt. Your best result stands.
      </p>
    </div>
  </div>
</template>

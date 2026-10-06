<script setup lang="ts">
/**
 * One question at a time, with navigation.
 *
 * The old system put every question in one scrolling `<form>`. That works on a
 * desktop with a mouse and is close to unusable on a phone, and it gives no sense
 * of where you are in a twenty-question quiz. One question per screen with
 * explicit navigation is the improvement the brief asks for, and it is also what
 * makes a shuffle legible: if the order is random, the student needs to see that
 * it is deliberate.
 *
 * The progress strip along the top is the answer to "where am I" without adding a
 * dashboard. Every question is a dot: answered, unanswered, current, flagged.
 * A dot is a button, so jumping is a tap rather than a hunt.
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, Flag, Send } from 'lucide-vue-next'
import { draftHasAnswer, type DraftAnswer, type ServedQuestion } from '@/services/quiz.service'
import type { QuestionType } from '@/types/enums'

const props = defineProps<{
  questions: ServedQuestion[]
  /**
   * questionId -> the answer, with its kind attached.
   *
   * Not `Record<string, string>`. An option id and a typed answer are both strings, and
   * a flat map cannot say which is which - so on submit one of them was sent under the
   * wrong key and written answers were graded as option ids. See `DraftAnswer`.
   */
  answers: Record<string, DraftAnswer>
  /** Position of the question on screen. */
  currentIndex: number
  flagged: Set<string>
  submitting: boolean
  submittingBlocked: boolean
  /**
   * Why submitting is unavailable, written for the student.
   *
   * Passed in rather than derived here because the rules live in the view, which knows
   * about the clock and the attempt. A button that is disabled with no reason is a
   * question the interface has decided not to answer.
   */
  submitBlockedReason?: string
}>()

const emit = defineEmits<{
  'update:currentIndex': [index: number]
  answer: [payload: { questionId: string; optionId: string | null }]
  toggleFlag: [questionId: string]
  submit: []
}>()

const current = computed<ServedQuestion | null>(() => props.questions[props.currentIndex] ?? null)

const answered = computed(() => props.questions.filter((q) => hasAnswer(q.questionId)).length)

function hasAnswer(questionId: string): boolean {
  return draftHasAnswer(props.answers[questionId])
}

function selectOption(questionId: string, optionId: string): void {
  emit('answer', { questionId, optionId })
}

function isSelected(questionId: string, optionId: string): boolean {
  return props.answers[questionId]?.optionId === optionId
}

const isLast = computed(() => props.currentIndex === props.questions.length - 1)

function go(delta: number): void {
  const next = props.currentIndex + delta
  if (next < 0 || next >= props.questions.length) return
  emit('update:currentIndex', next)
}

/**
 * Every question is answered by choosing an option.
 *
 * The wording is the only thing left that differs between the two types, so this is a
 * label and not a branch. It was three branches until written-answer questions were
 * removed; the `Write your answer` case had no way to be reached once the type left the
 * enum, and keeping it would have meant a function that describes a question this
 * application cannot contain.
 */
function typeLabel(type: QuestionType): string {
  if (type === 'true_false') return 'True or false'
  return 'Choose one'
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <!-- Progress. A dot per question rather than a counter, because with a shuffled
         order "question 7 of 12" says nothing about where you are. -->
    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">
          Question {{ currentIndex + 1 }}
          <span class="font-normal text-gray-500 dark:text-gray-400">
            of {{ questions.length }}
          </span>
        </p>
        <p class="text-sm text-gray-500 tabular-nums dark:text-gray-400">{{ answered }} answered</p>
      </div>

      <ol role="list" class="mt-3 flex flex-wrap gap-1.5">
        <li v-for="(question, index) in questions" :key="question.questionId">
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors"
            :class="[
              index === currentIndex
                ? 'bg-brand-600 text-white'
                : hasAnswer(question.questionId)
                  ? 'bg-success-100 text-success-800 hover:bg-success-200 dark:bg-success-500/20 dark:text-success-300 dark:hover:bg-success-500/30'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1]',
              flagged.has(question.questionId) && index !== currentIndex
                ? 'ring-1 ring-warning-400'
                : '',
            ]"
            :aria-current="index === currentIndex ? 'step' : undefined"
            :aria-label="`Question ${index + 1}${hasAnswer(question.questionId) ? ', answered' : ', not answered'}${flagged.has(question.questionId) ? ', flagged' : ''}`"
            @click="emit('update:currentIndex', index)"
          >
            <Flag
              v-if="flagged.has(question.questionId) && index !== currentIndex"
              class="size-3"
              aria-hidden="true"
            />
            <template v-else>{{ index + 1 }}</template>
          </button>
        </li>
      </ol>
    </div>

    <!-- The question -->
    <fieldset
      v-if="current"
      class="rounded-lg border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <legend class="sr-only">Question {{ currentIndex + 1 }}</legend>

      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          {{ typeLabel(current.questionType) }}
        </p>
        <span class="text-xs text-gray-400 dark:text-gray-500">
          {{ current.points }} {{ current.points === 1 ? 'point' : 'points' }}
        </span>
      </div>

      <!-- The prompt is prose a person wrote and can be arbitrarily long, so it
           gets the measure and leading rather than a truncate. Clamping it would
           hide the actual question on a long one. -->
      <p class="mt-3 text-lg leading-8 text-balance text-gray-900 dark:text-white/90">
        {{ current.prompt }}
      </p>

      <!-- Choices. Full-width rows, not radios in a line: a long option needs to
           wrap under its own label, and a 16px tap target in a list of five is
           the difference between usable and not on a phone. -->
      <div class="mt-5">
        <fieldset>
          <legend class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Choose one answer
          </legend>
          <div class="mt-2 flex flex-col gap-2">
            <label
              v-for="(option, optionIndex) in current.options"
              :key="option.id"
              class="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-colors"
              :class="
                isSelected(current.questionId, option.id)
                  ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:hover:border-gray-600 dark:hover:bg-white/[0.06]'
              "
            >
              <input
                type="radio"
                :name="`q-${current.questionId}`"
                :value="option.id"
                :checked="isSelected(current.questionId, option.id)"
                class="mt-1 size-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                @change="selectOption(current.questionId, option.id)"
              />
              <span class="min-w-0 text-sm leading-6 text-gray-800 dark:text-gray-200">
                <!-- Lettered by display position, which is what a person reads
                     aloud. With a shuffled option order the letter changes and
                     the correct option does not. -->
                <span class="me-2 font-medium text-gray-500 dark:text-gray-400">
                  {{ String.fromCharCode(65 + optionIndex) }}.
                </span>
                {{ option.optionText }}
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      <!-- Flag. Reviewing a flagged question is why navigation is worth having. -->
      <div class="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
          :class="
            flagged.has(current.questionId)
              ? 'text-warning-600 dark:text-warning-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          "
          :aria-pressed="flagged.has(current.questionId)"
          @click="emit('toggleFlag', current.questionId)"
        >
          <Flag class="size-4" aria-hidden="true" />
          {{ flagged.has(current.questionId) ? 'Flagged for review' : 'Flag for review' }}
        </button>
      </div>
    </fieldset>

    <!-- Navigation. Stacked on a phone so neither control is squeezed, and the
         primary action is last where a thumb reaches it. -->
    <div
      class="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-gray-200 bg-white pt-4 pb-2 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-canvas sm:bg-transparent"
    >
      <button
        type="button"
        class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
        :disabled="currentIndex === 0"
        @click="go(-1)"
      >
        <ChevronLeft class="size-4" aria-hidden="true" />
        Previous
      </button>

      <button
        v-if="!isLast"
        type="button"
        class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
        @click="go(1)"
      >
        Next
        <ChevronRight class="size-4" aria-hidden="true" />
      </button>

      <button
        v-else
        type="button"
        class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="submitting || Boolean(submitBlockedReason)"
        @click="emit('submit')"
      >
        <Send class="size-4" aria-hidden="true" />
        {{ submitting ? 'Submitting…' : 'Submit the quiz' }}
      </button>
    </div>

    <!--
      Always rendered rather than only on failure, and given `role="status"` so it is
      announced when it appears. A reason that is shown once and then vanishes is no
      better than none.
    -->
    <p
      v-if="submitBlockedReason"
      role="status"
      class="text-center text-sm font-medium text-warning-700 dark:text-warning-400"
    >
      {{ submitBlockedReason }}
    </p>

    <p
      v-if="submittingBlocked && answered < questions.length"
      class="text-center text-sm text-gray-500 dark:text-gray-400"
    >
      {{ questions.length - answered }}
      {{ questions.length - answered === 1 ? 'question is' : 'questions are' }} still unanswered.
      Unanswered questions score zero.
    </p>
  </div>
</template>

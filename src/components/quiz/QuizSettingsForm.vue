<script setup lang="ts">
/**
 * Create or edit the quiz itself.
 *
 * Status is not a field here, deliberately. `createQuiz` always writes a draft and
 * `updateQuiz` never writes `status`, because publishing is guarded by a trigger
 * that refuses a quiz with no valid key. An instructor editing a title must not be
 * able to unpublish a live quiz by saving the form, and must not be handed a
 * "publish" checkbox that quietly fails the moment a question is incomplete. The
 * publish control lives in the manager, next to the questions it is validating.
 *
 * The numeric bounds are the database's, not guesses: `passing_score` is
 * `check (passing_score > 0 and passing_score <= 100)`, `attempts_allowed` is
 * `between 1 and 3`, and `max_warnings` is `between 1 and 5`. The inputs clamp to
 * those ranges so an invalid value cannot be typed and then refused by a constraint.
 */
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import { formSelectClass } from '@/components/ui/controlClasses'
import type { AuthoredQuiz, QuizDraft } from '@/services/quizAuthoring.service'

const props = defineProps<{
  courseId: string
  /** Null when creating. */
  quiz: AuthoredQuiz | null
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [draft: QuizDraft]
}>()

/** Mirrors the three `attempts_allowed` values the trigger will accept. */
const ATTEMPT_CHOICES = [1, 2, 3] as const
/** Mirrors `quizzes_max_warnings_check`. */
const WARNING_CHOICES = [1, 2, 3, 4, 5] as const

const title = ref('')
const description = ref('')
const instructions = ref('')
const passingScore = ref<number | string>(70)
const attemptsAllowed = ref<number>(3)
const timeLimitMinutes = ref<number | string>('')
const maxWarnings = ref<number>(3)
const shuffleQuestions = ref(true)
const revealAnswers = ref(true)
const formError = ref('')

/** Field ids scoped to the course, so two of these on one page cannot collide. */
const fieldPrefix = computed(() => `quiz-settings-${props.courseId}`)

watch(
  () => props.quiz,
  (value) => {
    title.value = value?.title ?? ''
    description.value = value?.description ?? ''
    instructions.value = value?.instructions ?? ''
    passingScore.value = value?.passingScore ?? 70
    attemptsAllowed.value = value?.attemptsAllowed ?? 3
    timeLimitMinutes.value = value?.timeLimitMinutes ?? ''
    maxWarnings.value = value?.maxWarnings ?? 3
    shuffleQuestions.value = value?.shuffleQuestions ?? true
    revealAnswers.value = value?.revealAnswers ?? true
    formError.value = ''
  },
  { immediate: true },
)

/** An emptied number input emits `''`, which is a real value for the time limit. */
function readTimeLimit(): number | null {
  if (timeLimitMinutes.value === '') return null
  const value = Number(timeLimitMinutes.value)
  return Number.isFinite(value) ? Math.trunc(value) : null
}

function submit(): void {
  formError.value = ''

  const trimmedTitle = title.value.trim()
  if (trimmedTitle === '') {
    formError.value = 'Give the quiz a title.'
    return
  }

  const passing = Number(passingScore.value)
  if (!Number.isFinite(passing) || passing <= 0 || passing > 100) {
    formError.value = 'The pass mark must be between 1 and 100.'
    return
  }

  const limit = readTimeLimit()
  if (limit !== null && limit <= 0) {
    formError.value = 'The time limit has to be more than zero minutes, or left blank.'
    return
  }

  emit('submit', {
    title: trimmedTitle,
    description: description.value.trim() === '' ? null : description.value.trim(),
    instructions: instructions.value.trim() === '' ? null : instructions.value.trim(),
    passingScore: passing,
    attemptsAllowed: attemptsAllowed.value,
    timeLimitMinutes: limit,
    maxWarnings: maxWarnings.value,
    shuffleQuestions: shuffleQuestions.value,
    revealAnswers: revealAnswers.value,
  })
}
</script>

<template>
  <form
    class="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02]"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="text-theme-sm text-gray-900 dark:text-white/90">
      {{ quiz ? 'Edit quiz settings' : 'New quiz' }}
    </h3>
    <p class="mt-1 section-subheading">
      A new quiz starts as a draft. Publishing is a separate step on the quiz itself, once it has
      questions that can actually be answered.
    </p>

    <div class="mt-4 flex flex-col gap-4">
      <div>
        <label
          :for="`${fieldPrefix}-title`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Title
        </label>
        <input
          :id="`${fieldPrefix}-title`"
          v-model="title"
          type="text"
          maxlength="255"
          placeholder="Module 3 check-in"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div>
        <label
          :for="`${fieldPrefix}-description`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Description
          <span class="font-normal text-gray-400">(optional)</span>
        </label>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          One line about what this quiz covers. Shown where the quiz is listed.
        </p>
        <textarea
          :id="`${fieldPrefix}-description`"
          v-model="description"
          rows="2"
          maxlength="2000"
          placeholder="Covers the request methods and status codes from the lesson."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div>
        <label
          :for="`${fieldPrefix}-instructions`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Instructions
          <span class="font-normal text-gray-400">(optional)</span>
        </label>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Shown to the student before they start. Put the rules here.
        </p>
        <textarea
          :id="`${fieldPrefix}-instructions`"
          v-model="instructions"
          rows="4"
          maxlength="4000"
          placeholder="You have 10 minutes and 3 attempts. Leaving the tab warns you, and three warnings ends the attempt."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            :for="`${fieldPrefix}-passing`"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Pass mark
          </label>
          <div class="mt-1.5 flex items-center gap-2">
            <input
              :id="`${fieldPrefix}-passing`"
              v-model="passingScore"
              type="number"
              min="1"
              max="100"
              step="1"
              class="w-28 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
            />
            <span class="shrink-0 section-subheading">%</span>
          </div>
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            From 1 to 100. A pass mark of 0 is not allowed.
          </p>
        </div>

        <div>
          <label
            :for="`${fieldPrefix}-attempts`"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Attempts allowed
          </label>
          <select
            :id="`${fieldPrefix}-attempts`"
            v-model.number="attemptsAllowed"
            :class="formSelectClass"
          >
            <option v-for="choice in ATTEMPT_CHOICES" :key="choice" :value="choice">
              {{ choice }} attempt{{ choice === 1 ? '' : 's' }}
            </option>
          </select>
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            How many times a student may sit this quiz.
          </p>
        </div>

        <div>
          <label
            :for="`${fieldPrefix}-time`"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Time limit
            <span class="font-normal text-gray-400">(optional)</span>
          </label>
          <div class="mt-1.5 flex items-center gap-2">
            <input
              :id="`${fieldPrefix}-time`"
              v-model="timeLimitMinutes"
              type="number"
              min="1"
              step="1"
              placeholder="No limit"
              class="w-28 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
            />
            <span class="shrink-0 section-subheading">minutes</span>
          </div>
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Blank means no limit. The time is enforced on the server, not in the browser.
          </p>
        </div>

        <div>
          <label
            :for="`${fieldPrefix}-warnings`"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Warnings before the attempt ends
          </label>
          <select
            :id="`${fieldPrefix}-warnings`"
            v-model.number="maxWarnings"
            :class="formSelectClass"
          >
            <option v-for="choice in WARNING_CHOICES" :key="choice" :value="choice">
              {{ choice }} warning{{ choice === 1 ? '' : 's' }}
            </option>
          </select>
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            A warning is raised when a student leaves the quiz tab.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2.5">
        <label
          class="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300"
          :for="`${fieldPrefix}-shuffle`"
        >
          <input
            :id="`${fieldPrefix}-shuffle`"
            v-model="shuffleQuestions"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-white/[0.03]"
          />
          <span>
            Shuffle the questions
            <span class="block text-xs text-gray-500 dark:text-gray-400">
              Each student gets them in a different order. Turn it off when a question refers to the
              one before it.
            </span>
          </span>
        </label>

        <label
          class="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300"
          :for="`${fieldPrefix}-reveal`"
        >
          <input
            :id="`${fieldPrefix}-reveal`"
            v-model="revealAnswers"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-white/[0.03]"
          />
          <span>
            Reveal the answers after submitting
            <span class="block text-xs text-gray-500 dark:text-gray-400">
              On, the student sees what they got wrong and any explanation you wrote. Off, they see
              only whether they passed.
            </span>
          </span>
        </label>
      </div>
    </div>

    <p
      v-if="error || formError"
      role="alert"
      class="mt-4 rounded-lg border border-error-200 bg-error-50 px-3 py-2.5 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error ?? formError }}
    </p>

    <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" variant="primary" :disabled="saving">
        {{ quiz ? 'Save settings' : 'Create quiz' }}
      </Button>
    </div>
  </form>
</template>

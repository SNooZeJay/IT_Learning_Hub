<script setup lang="ts">
/**
 * Create or edit ONE question, inline.
 *
 * The correct answer is a RADIO and not a checkbox, deliberately. `quiz_options`
 * holds the answer key and the publish trigger refuses a choice question unless
 * exactly one option is `is_correct`, so a form that could express "two options
 * are both correct" would be a form that can be filled in and then rejected on
 * publish. One control, one meaning.
 *
 * `validateQuestion` is imported rather than reimplemented: it is the same check
 * the service runs before it sends anything, so the reason shown here is the
 * reason the write would have failed with.
 *
 * The question TYPE is fixed once a question exists. `updateQuestion` writes
 * prompt, points, explanation and case sensitivity - it does not write
 * `question_type`, because the options and accepted answers already stored
 * belong to the type the question was created with. The select is therefore
 * disabled while editing, rather than offering a change that would silently not
 * stick.
 */
import { computed, ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import { validateQuestion } from '@/services/quizAuthoring.service'
import type { AuthoredQuestion, QuestionDraft } from '@/services/quizAuthoring.service'
import type { QuestionType } from '@/types'

const props = defineProps<{
  quizId: string
  /** Null when creating. */
  question: AuthoredQuestion | null
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [draft: QuestionDraft]
}>()

/** The author-facing bounds on options. Six is what a printed question can hold. */
const MIN_OPTIONS = 2
const MAX_OPTIONS = 6

const typeLabels: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice - pick one from a list',
  true_false: 'True or false - a statement to judge',
}

const typeHints: Record<QuestionType, string> = {
  multiple_choice:
    'Give the options below. Exactly one of them is marked correct, and that is what the quiz is graded against.',
  true_false:
    'Two fixed options, True and False. The student judges the statement and one of them is the correct answer.',
}

interface OptionRow {
  key: number
  optionText: string
}

/** Row keys, so removing one option does not make Vue reuse another input's state. */
let nextKey = 0

function newOption(optionText = ''): OptionRow {
  nextKey += 1
  return { key: nextKey, optionText }
}

const prompt = ref('')
const points = ref<number | string>(1)
const explanation = ref('')
const questionType = ref<QuestionType>('multiple_choice')
const options = ref<OptionRow[]>([newOption(), newOption()])
/** Index of the correct option, or -1 when the author has not chosen one. */
const correctIndex = ref(-1)
const formError = ref('')

/**
 * Field ids are scoped to the quiz, so two of these on one page cannot produce
 * two elements with the same id and cross-wire a `<label for>`.
 */
const fieldPrefix = computed(() => `quiz-question-${props.quizId}`)

const canAddOption = computed(
  () => questionType.value !== 'true_false' && options.value.length < MAX_OPTIONS,
)

const canRemoveOption = computed(() => options.value.length > MIN_OPTIONS)

watch(
  () => props.question,
  (value) => {
    prompt.value = value?.prompt ?? ''
    points.value = value?.points ?? 1
    explanation.value = value?.explanation ?? ''
    questionType.value = value?.questionType ?? 'multiple_choice'
    formError.value = ''

    if (questionType.value === 'true_false') {
      options.value = [newOption('True'), newOption('False')]
    } else if (value && value.options.length > 0) {
      options.value = value.options.map((option) => newOption(option.optionText))
    } else {
      options.value = [newOption(), newOption()]
    }

    correctIndex.value = value ? value.options.findIndex((option) => option.isCorrect) : -1
  },
  { immediate: true },
)

function onTypeChange(event: Event): void {
  const next = (event.target as HTMLSelectElement).value as QuestionType
  questionType.value = next
  formError.value = ''
  correctIndex.value = -1

  // Both remaining types are answered by choosing an option, so the only thing that
  // changes when the type does is how many options start out and what they say.
  if (next === 'true_false') {
    options.value = [newOption('True'), newOption('False')]
  } else {
    options.value = [newOption(), newOption()]
  }
}

function addOption(): void {
  if (!canAddOption.value) return
  options.value = [...options.value, newOption()]
}

/**
 * Remove an option and keep the marker on the same option.
 *
 * Without the index adjustment, removing the row above the marked one would move
 * the marker onto whichever option slid up into its place - silently changing
 * the answer key by deleting a distractor.
 */
function removeOption(index: number): void {
  if (!canRemoveOption.value) return
  options.value = options.value.filter((_, position) => position !== index)

  if (correctIndex.value === index) correctIndex.value = -1
  else if (correctIndex.value > index) correctIndex.value -= 1
}

/**
 * `points` is `number | string` because an emptied number input emits `''`.
 * Anything that is not a positive number becomes 0 and is refused by the submit
 * check, rather than being coerced into a default the author did not ask for.
 */
function pointValue(): number {
  const value = Number(points.value)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function buildDraft(): QuestionDraft {
  const draft: QuestionDraft = {
    questionType: questionType.value,
    prompt: prompt.value,
    points: pointValue(),
    explanation: explanation.value.trim() === '' ? null : explanation.value,
  }

  // Always options. This was a branch that read the question type and built one of two
  // shapes; there is one shape now, and `validateQuestion` checks exactly it.
  draft.options = options.value.map((row, index) => ({
    optionText: row.optionText,
    isCorrect: index === correctIndex.value,
  }))

  return draft
}

function submit(): void {
  formError.value = ''

  if (pointValue() <= 0) {
    formError.value = 'Points must be more than zero.'
    return
  }

  const draft = buildDraft()
  const check = validateQuestion(draft)
  if (!check.ok) {
    formError.value = check.reason
    return
  }

  emit('submit', draft)
}
</script>

<template>
  <form
    class="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02]"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="text-theme-sm text-gray-900 dark:text-white/90">
      {{ question ? 'Edit question' : 'New question' }}
    </h3>
    <p class="mt-1 section-subheading">
      A question is worth its points, and the quiz is graded by adding up the points it awards.
    </p>

    <div class="mt-4 flex flex-col gap-4">
      <div>
        <label
          :for="`${fieldPrefix}-type`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Kind
        </label>
        <select
          :id="`${fieldPrefix}-type`"
          :value="questionType"
          :disabled="Boolean(question)"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:disabled:bg-white/[0.02]"
          @change="onTypeChange"
        >
          <option v-for="(label, value) in typeLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          <template v-if="question">
            A question keeps the kind it was created with, because the options and accepted answers
            stored for it belong to that kind.
          </template>
          <template v-else>{{ typeHints[questionType] }}</template>
        </p>
      </div>

      <div>
        <label
          :for="`${fieldPrefix}-prompt`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Question
        </label>
        <textarea
          :id="`${fieldPrefix}-prompt`"
          v-model="prompt"
          rows="3"
          placeholder="Which HTTP status code means the request succeeded?"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <!-- Choice questions. A fieldset because the radios are one group: exactly
           one of the options is the key, which is a choice, not six toggles. -->
      <fieldset v-if="questionType === 'true_false'">
        <legend class="text-sm font-medium text-gray-700 dark:text-gray-300">The answer is</legend>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          One of these two is correct. Their wording is fixed, so every true-or-false question reads
          the same way to the student.
        </p>

        <div class="mt-3 flex flex-col gap-2">
          <label
            v-for="(row, index) in options"
            :key="row.key"
            class="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
          >
            <input
              v-model="correctIndex"
              type="radio"
              :value="index"
              :name="`${fieldPrefix}-correct`"
              class="size-4 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-white/[0.03]"
            />
            {{ row.optionText }}
          </label>
        </div>
      </fieldset>

      <!-- Every remaining type is answered by choosing from options, so this fieldset is
           what you get for anything that is not true/false. It used to be
           `v-else-if="questionType === 'multiple_choice'"` with a third fieldset
           behind it; with two types left, `v-else` says the same thing and cannot
           fall through to nothing. -->
      <fieldset v-else>
        <legend class="text-sm font-medium text-gray-700 dark:text-gray-300">Options</legend>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Select the one that is correct. Students see these in the order shown here, and the first
          one is not marked correct for them.
        </p>

        <div class="mt-3 flex flex-col gap-2">
          <div
            v-for="(row, index) in options"
            :key="row.key"
            class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <label :for="`${fieldPrefix}-option-${row.key}`" class="sr-only">
              Option {{ index + 1 }} text
            </label>
            <input
              :id="`${fieldPrefix}-option-${row.key}`"
              v-model="row.optionText"
              type="text"
              maxlength="500"
              placeholder="200 OK"
              class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
            />

            <div class="flex items-center justify-between gap-3 sm:justify-end">
              <label
                class="flex shrink-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
              >
                <input
                  v-model="correctIndex"
                  type="radio"
                  :value="index"
                  :name="`${fieldPrefix}-correct`"
                  class="size-4 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-white/[0.03]"
                />
                Correct
              </label>

              <button
                type="button"
                :disabled="!canRemoveOption"
                :aria-label="`Remove option ${index + 1}`"
                class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-error-50 hover:text-error-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-error-500/10 dark:hover:text-error-400"
                @click="removeOption(index)"
              >
                <Trash2 class="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-col gap-1.5">
          <button
            v-if="canAddOption"
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            @click="addOption"
          >
            <Plus class="size-4" aria-hidden="true" />
            Add an option
          </button>
          <p v-else class="text-xs text-gray-500 dark:text-gray-400">
            Six options is the maximum a question can carry.
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Two options is the minimum, and a question cannot be published with none marked correct.
          </p>
        </div>
      </fieldset>

      <div>
        <label
          :for="`${fieldPrefix}-points`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Points
        </label>
        <div class="mt-1.5 flex items-center gap-2">
          <input
            :id="`${fieldPrefix}-points`"
            v-model="points"
            type="number"
            min="0"
            step="0.5"
            class="w-28 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
          />
          <span class="shrink-0 section-subheading"> must be more than zero </span>
        </div>
      </div>

      <div>
        <label
          :for="`${fieldPrefix}-explanation`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Explanation
          <span class="font-normal text-gray-400">(optional)</span>
        </label>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Shown to the student after they submit, when the quiz reveals answers. Leave it empty and
          they are told only whether they got it right.
        </p>
        <textarea
          :id="`${fieldPrefix}-explanation`"
          v-model="explanation"
          rows="2"
          maxlength="2000"
          placeholder="2xx means the request succeeded; 4xx means you sent something wrong."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
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
        {{ question ? 'Save question' : 'Add question' }}
      </Button>
    </div>
  </form>
</template>

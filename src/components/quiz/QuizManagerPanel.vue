<script setup lang="ts">
/**
 * The instructor's quiz manager for one course.
 *
 * The old system could add questions and never edit or delete them, and the
 * answer key was fixed at creation. This panel is the opposite of that: the full
 * lifecycle on one screen, questions included, with publishing as a deliberate
 * last step rather than a side effect of saving.
 *
 * Every write reloads the quiz it touched rather than patching the copy in memory.
 * The answer key lives behind `quiz_with_answers` and the question counts come
 * from a different query, so a locally-patched row would drift from the server on
 * the first thing it could not compute itself - and the one thing an author must
 * be able to trust here is whether their question is actually saved.
 *
 * Attempts are cached per quiz id, including for the list, because
 * `listQuizAttempts` is per quiz and the service exposes no count aggregate. The
 * alternative was a dash where an attempt count should be, which is a column that
 * lies about what it does not know.
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QuizAttemptsPanel from './QuizAttemptsPanel.vue'
import QuizQuestionForm from './QuizQuestionForm.vue'
import QuizSettingsForm from './QuizSettingsForm.vue'
import {
  QuizAuthoringError,
  createQuestion,
  createQuiz,
  deleteQuestion,
  getQuizForAuthoring,
  listQuizzesForAuthoring,
  listQuizAttempts,
  reorderQuestions,
  setQuizPublished,
  updateQuestion,
  updateQuiz,
} from '@/services/quizAuthoring.service'
import type {
  AttemptSummary,
  AuthoredQuestion,
  AuthoredQuiz,
  AuthoredQuizSummary,
  QuestionDraft,
  QuizDraft,
} from '@/services/quizAuthoring.service'
import type { QuestionType, QuizStatus } from '@/types'

const props = withDefaults(
  defineProps<{
    courseId: string
    /** Optional quiz to open straight away, from a link on the course page. */
    initialQuizId?: string | null
  }>(),
  { initialQuizId: null },
)

const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  short_text: 'Written answer',
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const quizzes = ref<AuthoredQuizSummary[]>([])
const isLoadingList = ref(true)
const listError = ref('')

const selectedId = ref<string | null>(null)
const quiz = ref<AuthoredQuiz | null>(null)
const isLoadingQuiz = ref(false)
const quizError = ref('')

/** Attempts per quiz id. Cached so selecting a quiz never refetches what is known. */
const attemptsByQuiz = ref<Record<string, AttemptSummary[]>>({})
const attemptsErrorByQuiz = ref<Record<string, string>>({})
const loadingAttempts = ref<string[]>([])

/** One banner for the outcome of the last action, rather than a toast per action. */
const banner = reactive({ message: '', variant: 'success' as 'success' | 'error' })

const settingsForm = reactive({
  open: false,
  quiz: null as AuthoredQuiz | null,
  saving: false,
  error: null as string | null,
})

const questionForm = reactive({
  open: false,
  question: null as AuthoredQuestion | null,
  saving: false,
  error: null as string | null,
})

/** Guards the writes that have no form of their own to disable: publish, reorder, delete. */
const busy = ref(false)

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

const selectedAttempts = computed(() =>
  selectedId.value ? (attemptsByQuiz.value[selectedId.value] ?? []) : [],
)

const selectedAttemptsError = computed(() =>
  selectedId.value ? (attemptsErrorByQuiz.value[selectedId.value] ?? '') : '',
)

const isLoadingSelectedAttempts = computed(
  () => selectedId.value !== null && loadingAttempts.value.includes(selectedId.value),
)

/** The list with each row's attempt count attached, or null when not read yet. */
const quizRows = computed(() =>
  quizzes.value.map((summary) => {
    const cached = attemptsByQuiz.value[summary.id]
    return { summary, attempts: cached ? cached.length : null }
  }),
)

const totalPoints = computed(() =>
  (quiz.value?.questions ?? []).reduce((sum, question) => sum + question.points, 0),
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describe(error: unknown, fallback: string): string {
  if (error instanceof QuizAuthoringError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

function announce(message: string, variant: 'success' | 'error' = 'success'): void {
  banner.message = message
  banner.variant = variant
}

function statusBadge(status: QuizStatus): string {
  return status === 'published'
    ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
    : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
}

function attemptLabel(count: number | null): string {
  if (count === null) return 'not read yet'
  if (count === 0) return 'no attempts yet'
  return `${count} ${count === 1 ? 'attempt' : 'attempts'}`
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function loadQuizzes(): Promise<void> {
  isLoadingList.value = true
  listError.value = ''
  try {
    quizzes.value = await listQuizzesForAuthoring(props.courseId)
  } catch (error) {
    listError.value = describe(error, 'Could not load the quizzes for this course.')
  } finally {
    isLoadingList.value = false
  }
}

/**
 * Open one quiz: its answer key, then its results.
 *
 * A null result is not something the service throws. `getQuizForAuthoring` returns
 * null for a quiz this instructor may not read, and that reads as "not here"
 * rather than as a failure, because a failure would offer a retry that cannot help.
 *
 * Guarded by a request token. `select()` fires this without awaiting, so clicking
 * through two quizzes issues two concurrent reads, and whichever happened to be slower
 * used to win `quiz.value` while `selectedId` held the newer choice. The instructor then
 * saw quiz B highlighted in the list with quiz A's questions and answer key - and every
 * write went to quiz A, because the writes read `quiz.value` rather than the selection.
 * Adding, editing, deleting, reordering and publishing all did this.
 *
 * A counter rather than a boolean, because two loads can be in flight at once and only
 * the newest may land.
 */
let loadToken = 0

async function loadQuiz(quizId: string): Promise<void> {
  const token = ++loadToken
  selectedId.value = quizId
  quiz.value = null
  quizError.value = ''
  isLoadingQuiz.value = true

  try {
    const loaded = await getQuizForAuthoring(quizId)
    if (token !== loadToken) return
    if (!loaded) {
      quizError.value = 'That quiz is not on this course, or it has been deleted.'
      return
    }
    quiz.value = loaded
    // The settings form edits this row, so a quiz replaced under it is replaced
    // there too rather than left editing the previous version.
    if (settingsForm.quiz) settingsForm.quiz = loaded
  } catch (error) {
    if (token !== loadToken) return
    quizError.value = describe(error, 'Could not load this quiz.')
  } finally {
    // Only the newest load may clear the spinner. A stale one finishing would hide a
    // spinner that is still wanted for the load actually in progress.
    if (token === loadToken) isLoadingQuiz.value = false
  }
  void loadAttempts(quizId)
}

/** Read one quiz's attempts, once. A failure is recorded per quiz, never thrown. */
async function loadAttempts(quizId: string): Promise<void> {
  if (attemptsByQuiz.value[quizId] || attemptsErrorByQuiz.value[quizId]) return

  loadingAttempts.value = [...loadingAttempts.value, quizId]
  try {
    attemptsByQuiz.value = { ...attemptsByQuiz.value, [quizId]: await listQuizAttempts(quizId) }
  } catch (error) {
    attemptsErrorByQuiz.value = {
      ...attemptsErrorByQuiz.value,
      [quizId]: describe(error, 'Could not load the results for this quiz.'),
    }
  } finally {
    loadingAttempts.value = loadingAttempts.value.filter((id) => id !== quizId)
  }
}

/**
 * Re-read a quiz's results.
 *
 * Results move while the instructor is looking at them - students are sitting the
 * quiz in another tab - so the panel can be asked to read them again rather than
 * being a snapshot that quietly goes stale.
 */
function refreshAttempts(): void {
  const quizId = selectedId.value
  if (!quizId) return

  const attempts = { ...attemptsByQuiz.value }
  delete attempts[quizId]
  attemptsByQuiz.value = attempts

  const failures = { ...attemptsErrorByQuiz.value }
  delete failures[quizId]
  attemptsErrorByQuiz.value = failures

  void loadAttempts(quizId)
}

function retryQuiz(): void {
  if (selectedId.value) void loadQuiz(selectedId.value)
}

// ---------------------------------------------------------------------------
// Selection and forms
// ---------------------------------------------------------------------------

function closeForms(): void {
  settingsForm.open = false
  settingsForm.quiz = null
  settingsForm.error = null
  questionForm.open = false
  questionForm.question = null
  questionForm.error = null
}

function select(quizId: string): void {
  // Re-clicking the selected quiz is a no-op, except after a failure, where it is
  // the obvious way to try again.
  if (quizId === selectedId.value && quiz.value) return
  closeForms()
  void loadQuiz(quizId)
}

function openNewQuiz(): void {
  questionForm.open = false
  questionForm.question = null
  questionForm.error = null
  settingsForm.quiz = null
  settingsForm.error = null
  settingsForm.open = true
}

function openQuizSettings(): void {
  questionForm.open = false
  questionForm.question = null
  questionForm.error = null
  settingsForm.quiz = quiz.value
  settingsForm.error = null
  settingsForm.open = true
}

function openNewQuestion(): void {
  settingsForm.open = false
  settingsForm.quiz = null
  questionForm.question = null
  questionForm.error = null
  questionForm.open = true
}

function openEditQuestion(question: AuthoredQuestion): void {
  settingsForm.open = false
  settingsForm.quiz = null
  questionForm.question = question
  questionForm.error = null
  questionForm.open = true
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Save settings, then re-read.
 *
 * A new quiz is opened straight away. An instructor who has just created one wants
 * to add questions to it, and making them find it in a list they cannot see the id
 * of yet is a step with no purpose.
 */
async function saveQuiz(draft: QuizDraft): Promise<void> {
  settingsForm.saving = true
  settingsForm.error = null
  const editing = settingsForm.quiz

  try {
    if (editing) {
      await updateQuiz(editing.id, draft)
      announce(`Saved "${draft.title}".`)
      closeForms()
      await loadQuizzes()
      await loadQuiz(editing.id)
    } else {
      const createdId = await createQuiz(props.courseId, draft)
      announce(`Added quiz "${draft.title}". It stays a draft until you publish it.`)
      closeForms()
      await loadQuizzes()
      await loadQuiz(createdId)
    }
  } catch (error) {
    settingsForm.error = describe(error, 'Could not save the quiz.')
  } finally {
    settingsForm.saving = false
  }
}

async function saveQuestion(draft: QuestionDraft): Promise<void> {
  const current = quiz.value
  if (!current) return

  questionForm.saving = true
  questionForm.error = null
  const editing = questionForm.question

  try {
    if (editing) {
      await updateQuestion(editing.id, draft)
      announce('Question saved.')
    } else {
      await createQuestion(current.id, draft)
      announce('Question added.')
    }
    closeForms()
    await loadQuizzes()
    await loadQuiz(current.id)
  } catch (error) {
    questionForm.error = describe(error, 'Could not save the question.')
  } finally {
    questionForm.saving = false
  }
}

/**
 * Confirm before removing, naming the question.
 *
 * A prompt alone is not enough here. A list of questions reading alike gives no way
 * to check that the right one was picked, and deletion takes the options and the
 * accepted answers with it. Past attempts are not regraded, so their scores stay as
 * recorded - which the confirmation says, because a deleted question would
 * otherwise look like it should have changed a result.
 */
function confirmRemoveQuestion(question: AuthoredQuestion): void {
  const prompt = question.prompt.length > 60 ? `${question.prompt.slice(0, 60)}…` : question.prompt
  const confirmed = window.confirm(
    `Delete the question "${prompt}"? Its options and any accepted answers go with it. Scores already recorded on past attempts are left as they are.`,
  )
  if (!confirmed) return
  void removeQuestion(question)
}

async function removeQuestion(question: AuthoredQuestion): Promise<void> {
  const current = quiz.value
  if (!current) return

  busy.value = true
  try {
    await deleteQuestion(question.id)
    announce('Question deleted.')
    if (questionForm.question?.id === question.id) {
      questionForm.open = false
      questionForm.question = null
    }
    await loadQuizzes()
    await loadQuiz(current.id)
  } catch (error) {
    announce(describe(error, 'Could not delete that question.'), 'error')
  } finally {
    busy.value = false
  }
}

/**
 * Move a question one place up or down.
 *
 * Goes through `reorderQuestions` rather than writing positions per row, because
 * `unique (quiz_id, position)` makes a per-row update impossible: the new position
 * collides with whatever currently holds it. The service already knows that, and
 * duplicating the ordering here would only add a second place to get wrong.
 */
async function moveQuestion(index: number, offset: number): Promise<void> {
  const current = quiz.value
  if (!current) return

  const ordered = [...current.questions]
  const target = index + offset
  if (target < 0 || target >= ordered.length) return

  const [moved] = ordered.splice(index, 1)
  ordered.splice(target, 0, moved)

  busy.value = true
  try {
    await reorderQuestions(
      current.id,
      ordered.map((question) => question.id),
    )
    announce(`Moved question ${index + 1} to position ${target + 1}.`)
    await loadQuiz(current.id)
  } catch (error) {
    announce(describe(error, 'Could not save the new order.'), 'error')
  } finally {
    busy.value = false
  }
}

/**
 * Publish or unpublish.
 *
 * The service's message is surfaced verbatim, on purpose. The publish trigger
 * refuses a quiz that cannot be answered and names the question and the reason -
 * no option marked correct on question four - and the service turns the raw
 * Postgres error into a sentence an author can act on. Replacing either with
 * something generic would throw away the only useful thing on the screen at the
 * exact moment it is needed.
 */
async function togglePublished(): Promise<void> {
  const current = quiz.value
  if (!current) return

  const publishing = current.status !== 'published'
  busy.value = true

  try {
    await setQuizPublished(current.id, publishing)
    announce(
      publishing
        ? 'Published. Students enrolled on this course can sit it now.'
        : 'Unpublished. Students can no longer start it, and the results are kept.',
    )
    await loadQuizzes()
    await loadQuiz(current.id)
  } catch (error) {
    announce(describe(error, 'Could not change the status of this quiz.'), 'error')
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function load(): Promise<void> {
  selectedId.value = null
  quiz.value = null
  quizError.value = ''
  attemptsByQuiz.value = {}
  attemptsErrorByQuiz.value = {}
  loadingAttempts.value = []
  banner.message = ''
  closeForms()

  await loadQuizzes()

  const wanted = props.initialQuizId
  if (wanted && quizzes.value.some((summary) => summary.id === wanted)) {
    await loadQuiz(wanted)
  }

  // Attempt counts for the list, read per quiz because the service has no aggregate
  // for them. A course carries a handful of quizzes and the result is cached, so
  // selecting one afterwards costs nothing. Deliberately not awaited: a slow count
  // must not hold up the list an instructor came for.
  void Promise.all(quizzes.value.map((summary) => loadAttempts(summary.id)))
}

watch(
  () => `${props.courseId}:${props.initialQuizId ?? ''}`,
  () => {
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- The outcome of the last action. One banner, so the screen has a single
         place that says what just happened, rather than a toast already gone. -->
    <Alert
      v-if="banner.message"
      :variant="banner.variant"
      :title="banner.variant === 'error' ? 'That did not work' : 'Done'"
      :message="banner.message"
    />

    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <!-- Which quiz -->
      <LoadingState v-if="isLoadingList" label="Loading quizzes" />

      <ErrorState
        v-else-if="listError"
        title="Could not load the quizzes"
        :message="listError"
        @retry="loadQuizzes"
      />

      <section
        v-else
        class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        aria-labelledby="quiz-list-heading"
      >
        <div
          class="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"
        >
          <h2 id="quiz-list-heading" class="text-theme-sm text-gray-900 dark:text-white/90">
            Quizzes
          </h2>
          <Button size="sm" @click="openNewQuiz">
            <Plus class="size-4" aria-hidden="true" />
            New quiz
          </Button>
        </div>

        <p
          v-if="quizRows.length === 0"
          class="m-5 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          This course has no quizzes yet. Make one, then add questions to it.
        </p>

        <ul v-else class="divide-y divide-gray-200 dark:divide-gray-800">
          <li v-for="row in quizRows" :key="row.summary.id">
            <button
              type="button"
              class="block w-full px-5 py-4 text-start transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              :class="selectedId === row.summary.id ? 'bg-gray-50 dark:bg-white/[0.06]' : ''"
              :aria-current="selectedId === row.summary.id ? 'true' : undefined"
              @click="select(row.summary.id)"
            >
              <span class="flex items-start justify-between gap-3">
                <span
                  class="min-w-0 flex-1 text-theme-sm font-medium text-gray-900 dark:text-white/90"
                >
                  {{ row.summary.title }}
                </span>
                <span
                  class="shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize"
                  :class="statusBadge(row.summary.status)"
                >
                  {{ row.summary.status }}
                </span>
              </span>

              <span class="mt-1 block text-sm text-gray-500 dark:text-gray-400">
                {{ row.summary.questionCount }}
                {{ row.summary.questionCount === 1 ? 'question' : 'questions' }}
                <span aria-hidden="true">·</span>
                {{ row.summary.totalPoints }}
                {{ row.summary.totalPoints === 1 ? 'point' : 'points' }}
                <span aria-hidden="true">·</span>
                {{ attemptLabel(row.attempts) }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <!-- The selected quiz -->
      <div class="flex flex-col gap-6">
        <EmptyState
          v-if="!selectedId"
          title="Choose a quiz"
          description="Pick a quiz to add questions to it, set how it is graded, and read the results. Or make a new one."
          :icon="ClipboardList"
        />

        <LoadingState v-else-if="isLoadingQuiz" label="Loading quiz" />

        <ErrorState
          v-else-if="quizError"
          title="Could not open that quiz"
          :message="quizError"
          @retry="retryQuiz"
        />

        <template v-else-if="quiz">
          <section
            class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            :aria-labelledby="`quiz-heading-${quiz.id}`"
          >
            <div class="border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-gray-800">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2
                      :id="`quiz-heading-${quiz.id}`"
                      class="text-title-sm text-gray-900 dark:text-white/90"
                    >
                      {{ quiz.title }}
                    </h2>
                    <span
                      class="shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize"
                      :class="statusBadge(quiz.status)"
                    >
                      {{ quiz.status }}
                    </span>
                  </div>

                  <p
                    v-if="quiz.description"
                    class="mt-1.5 text-sm text-gray-500 dark:text-gray-400"
                  >
                    {{ quiz.description }}
                  </p>
                </div>

                <div class="flex shrink-0 flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" @click="openQuizSettings">
                    <Pencil class="size-4" aria-hidden="true" />
                    Edit settings
                  </Button>
                  <Button size="sm" :disabled="busy" @click="togglePublished">
                    <EyeOff v-if="quiz.status === 'published'" class="size-4" aria-hidden="true" />
                    <Eye v-else class="size-4" aria-hidden="true" />
                    {{ quiz.status === 'published' ? 'Unpublish' : 'Publish' }}
                  </Button>
                </div>
              </div>

              <p
                v-if="quiz.instructions"
                class="mt-3 border-s-2 border-hairline ps-3 text-sm text-slate"
              >
                {{ quiz.instructions }}
              </p>

              <dl
                class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500 dark:text-gray-400"
              >
                <div class="flex items-center gap-1.5">
                  <dt>Pass mark</dt>
                  <dd class="font-medium text-gray-900 dark:text-white/90">
                    {{ quiz.passingScore }}%
                  </dd>
                </div>
                <div class="flex items-center gap-1.5">
                  <dt>Attempts</dt>
                  <dd class="font-medium text-gray-900 dark:text-white/90">
                    {{ quiz.attemptsAllowed }}
                  </dd>
                </div>
                <div class="flex items-center gap-1.5">
                  <dt>Time limit</dt>
                  <dd class="font-medium text-gray-900 dark:text-white/90">
                    {{ quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : 'None' }}
                  </dd>
                </div>
                <div class="flex items-center gap-1.5">
                  <dt>Warnings</dt>
                  <dd class="font-medium text-gray-900 dark:text-white/90">
                    {{ quiz.maxWarnings }}
                  </dd>
                </div>
                <div class="flex items-center gap-1.5">
                  <dt>Order</dt>
                  <dd class="font-medium text-gray-900 dark:text-white/90">
                    {{ quiz.shuffleQuestions ? 'Shuffled' : 'As written' }}
                  </dd>
                </div>
                <div class="flex items-center gap-1.5">
                  <dt>After submitting</dt>
                  <dd class="font-medium text-gray-900 dark:text-white/90">
                    {{ quiz.revealAnswers ? 'Answers revealed' : 'Result only' }}
                  </dd>
                </div>
              </dl>
            </div>

            <div class="px-5 py-5 sm:px-6">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h3 class="text-theme-sm text-gray-900 dark:text-white/90">Questions</h3>
                <p
                  v-if="quiz.questions.length > 0"
                  class="text-sm text-gray-500 dark:text-gray-400"
                >
                  {{ quiz.questions.length }}
                  {{ quiz.questions.length === 1 ? 'question' : 'questions' }}, worth
                  {{ totalPoints }} {{ totalPoints === 1 ? 'point' : 'points' }}
                </p>
              </div>

              <div
                v-if="quiz.questions.length === 0"
                class="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700"
              >
                <ListChecks
                  class="mx-auto size-7 text-gray-300 dark:text-gray-600"
                  aria-hidden="true"
                />
                <p class="mt-2 text-sm font-medium text-gray-900 dark:text-white/90">
                  No questions yet
                </p>
                <p class="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  A quiz cannot be published with no questions, and every choice question needs two
                  options with exactly one of them marked correct.
                </p>
              </div>

              <ol v-else class="mt-4 flex flex-col gap-3">
                <li
                  v-for="(question, index) in quiz.questions"
                  :key="question.id"
                  class="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-start dark:border-gray-800"
                >
                  <!-- On a phone the prompt gets the full width and the row of
                       controls sits under it; from sm up the controls sit beside
                       it. Squeezing both onto one line at 390px leaves the
                       question about half the space it needs. -->
                  <div class="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                    >
                      {{ index + 1 }}
                    </span>

                    <div class="min-w-0 flex-1">
                      <p class="line-clamp-2 text-sm font-medium text-gray-900 dark:text-white/90">
                        {{ question.prompt }}
                      </p>

                      <p
                        class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
                      >
                        <span>{{ questionTypeLabels[question.questionType] }}</span>
                        <span>
                          {{ question.points }}
                          {{ question.points === 1 ? 'point' : 'points' }}
                        </span>
                        <span v-if="question.caseSensitive">Case sensitive</span>
                        <span v-if="question.explanation">Has an explanation</span>
                      </p>

                      <ul v-if="question.options.length > 0" class="mt-2.5 flex flex-col gap-1">
                        <li
                          v-for="option in question.options"
                          :key="option.id"
                          class="flex items-start gap-2 text-sm"
                        >
                          <Check
                            v-if="option.isCorrect"
                            class="mt-0.5 size-4 shrink-0 text-success-600 dark:text-success-400"
                          />
                          <X
                            v-else
                            class="mt-0.5 size-4 shrink-0 text-gray-300 dark:text-gray-600"
                          />
                          <span
                            :class="
                              option.isCorrect
                                ? 'font-medium text-gray-900 dark:text-white/90'
                                : 'text-gray-600 dark:text-gray-400'
                            "
                          >
                            {{ option.optionText }}
                          </span>
                        </li>
                      </ul>

                      <ul
                        v-if="question.acceptedAnswers.length > 0"
                        class="mt-2.5 flex flex-col gap-1"
                      >
                        <li
                          v-for="answer in question.acceptedAnswers"
                          :key="answer"
                          class="flex items-start gap-2 text-sm"
                        >
                          <Check
                            class="mt-0.5 size-4 shrink-0 text-success-600 dark:text-success-400"
                          />
                          <span class="font-medium text-gray-900 dark:text-white/90">
                            {{ answer }}
                          </span>
                        </li>
                      </ul>

                      <p
                        v-if="question.explanation"
                        class="mt-2.5 border-s-2 border-hairline ps-3 text-sm text-slate"
                      >
                        {{ question.explanation }}
                      </p>
                    </div>
                  </div>

                  <!-- A full-width row of four buttons on a phone, one row
                       beside the question from sm up. The two labelled buttons
                       grow when their label appears, so they are min-width
                       rather than a fixed square the text would overflow. -->
                  <div class="grid shrink-0 grid-cols-4 gap-1 sm:flex sm:items-center">
                    <button
                      type="button"
                      :aria-label="`Move question ${index + 1} up`"
                      :disabled="index === 0 || busy"
                      class="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
                      @click="moveQuestion(index, -1)"
                    >
                      <ArrowUp class="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      :aria-label="`Move question ${index + 1} down`"
                      :disabled="index === quiz.questions.length - 1 || busy"
                      class="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
                      @click="moveQuestion(index, 1)"
                    >
                      <ArrowDown class="size-4" aria-hidden="true" />
                    </button>
                    <!--
                      Both bound to `busy`, like the reorder arrows above and
                      publish below.

                      Delete was the damaging one: `deleteQuestion` was called
                      with nothing to disable it, so a double-click issued two
                      deletes. The second found nothing to delete and reported a
                      failure for a question that had in fact been removed - an
                      error message describing the opposite of what happened.
                      `busy` is set synchronously at the top of every write
                      handler, so the button is inert before the second click can
                      land.
                    -->
                    <button
                      type="button"
                      :disabled="busy"
                      class="inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white/90 dark:disabled:hover:bg-transparent"
                      @click="openEditQuestion(question)"
                    >
                      <Pencil class="size-4 shrink-0" aria-hidden="true" />
                      <span class="sr-only sm:not-sr-only">Edit</span>
                    </button>
                    <button
                      type="button"
                      :disabled="busy"
                      class="inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-sm text-gray-500 hover:bg-error-50 hover:text-error-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-error-500/10 dark:hover:text-error-400 dark:disabled:hover:bg-transparent"
                      @click="confirmRemoveQuestion(question)"
                    >
                      <Trash2 class="size-4 shrink-0" aria-hidden="true" />
                      <span class="sr-only sm:not-sr-only">Delete</span>
                    </button>
                  </div>
                </li>
              </ol>

              <QuizQuestionForm
                v-if="questionForm.open"
                class="mt-5"
                :quiz-id="quiz.id"
                :question="questionForm.question"
                :saving="questionForm.saving"
                :error="questionForm.error"
                @cancel="closeForms"
                @submit="saveQuestion"
              />

              <button
                type="button"
                class="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500"
                :disabled="busy"
                @click="openNewQuestion"
              >
                <Plus class="size-4" aria-hidden="true" />
                Add a question
              </button>
            </div>
          </section>

          <LoadingState v-if="isLoadingSelectedAttempts" label="Loading results" />

          <ErrorState
            v-else-if="selectedAttemptsError"
            title="Could not load the results"
            :message="selectedAttemptsError"
            @retry="refreshAttempts"
          />

          <section
            v-else
            class="rounded-lg border border-gray-200 bg-white px-5 py-5 sm:px-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div class="flex justify-end">
              <button
                type="button"
                class="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                @click="refreshAttempts"
              >
                <RotateCcw class="size-4" aria-hidden="true" />
                Refresh results
              </button>
            </div>

            <QuizAttemptsPanel :quiz-id="quiz.id" :attempts="selectedAttempts" />
          </section>
        </template>

        <!--
          The create/edit form, deliberately outside the `v-else-if="quiz"` branch
          above.

          It was inside it, which meant it only rendered when a quiz was already
          selected - so "New quiz" set `settingsForm.open = true` and nothing
          appeared. Found by clicking the button on a course with no quizzes yet,
          which is the exact state a new course is in.
        -->
        <QuizSettingsForm
          v-if="settingsForm.open"
          class="mt-5"
          :course-id="courseId"
          :quiz="settingsForm.quiz"
          :saving="settingsForm.saving"
          :error="settingsForm.error"
          @cancel="closeForms"
          @submit="saveQuiz"
        />
      </div>
    </div>
  </div>
</template>

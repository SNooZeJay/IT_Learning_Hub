<template>
  <div>
    <PageHeader
      title="Grading"
      subtitle="Assignment submissions from your courses, oldest first."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Grading' }]"
    />

    <!-- Queue controls. -->
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div class="relative sm:max-w-xs sm:flex-1">
        <Search
          class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-gray-400"
        />
        <input
          v-model.trim="search"
          type="search"
          placeholder="Search by student, course or assignment"
          :class="searchClass"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative sm:w-56">
          <label for="course-filter" class="sr-only">Filter by course</label>
          <select id="course-filter" v-model="courseFilter" :class="selectClass">
            <option value="">All courses</option>
            <option v-for="course in courseOptions" :key="course" :value="course">
              {{ course }}
            </option>
          </select>
        </div>

        <button
          type="button"
          class="rounded-full px-3.5 py-2 text-xs font-medium transition-colors"
          :class="
            includeGraded
              ? 'bg-brand-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.12]'
          "
          @click="toggleIncludeGraded"
        >
          {{ includeGraded ? 'Including graded' : 'Awaiting grade only' }}
        </button>
      </div>
    </div>

    <LoadingState v-if="isLoading" label="Loading the grading queue" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="queue.length === 0"
      :title="includeGraded ? 'No submissions yet' : 'Nothing waiting to be graded'"
      :description="
        includeGraded
          ? 'Submissions appear here as students hand them in for the assignments on your courses.'
          : 'Every submission for your published assignments has been graded. Switch on “Including graded” to see the record.'
      "
      :icon="ListChecks"
    />

    <EmptyState
      v-else-if="filtered.length === 0"
      title="Nothing matches those filters"
      description="Try a different name, or clear the course filter."
      :icon="Search"
    />

    <template v-else>
      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {{ pendingCount }} awaiting a grade · {{ filtered.length - pendingCount }} already graded
      </p>

      <ul class="space-y-4">
        <li
          v-for="item in filtered"
          :key="item.id"
          class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <!-- Header: who, what, and how long it has been waiting. -->
          <div
            class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
          >
            <div class="min-w-0">
              <h2 class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
                {{ item.assignmentTitle }}
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ item.studentName }}
                <template v-if="item.studentEmail">
                  · <span class="break-all">{{ item.studentEmail }}</span>
                </template>
              </p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ item.courseTitle }} · out of {{ item.maxPoints }} points · submitted
                {{ formatDateTime(item.submittedAt) }}
                <template v-if="isOverdue(item)">
                  · was due {{ formatDateTime(item.dueAt!) }}</template
                >
              </p>
            </div>

            <span
              class="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium"
              :class="
                item.status === 'graded'
                  ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
                  : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
              "
            >
              <CircleCheck v-if="item.status === 'graded'" class="size-3.5" />
              {{ item.status === 'graded' ? 'Graded' : 'Awaiting grade' }}
            </span>
          </div>

          <div class="px-6 py-5">
            <!-- Instructions. Shown because a grade without the brief is a
                 judgement made without the criteria. -->
            <div v-if="item.assignmentInstructions" class="mb-5">
              <h3
                class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                What was asked
              </h3>
              <p
                class="mt-1.5 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm whitespace-pre-line text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
              >
                {{ item.assignmentInstructions }}
              </p>
            </div>

            <!-- The submission itself. -->
            <h3
              class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
            >
              Submission
            </h3>
            <p
              v-if="item.submissionText"
              class="mt-1.5 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm whitespace-pre-line text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
            >
              {{ item.submissionText }}
            </p>
            <!-- A file upload and no text is a real state: the work is in a
                 document, and saying "nothing was submitted" would be a lie. -->
            <p
              v-else-if="item.filePath"
              class="mt-1.5 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
            >
              <Paperclip class="size-4 shrink-0 text-gray-400" />
              <span class="truncate">{{ item.filePath }}</span>
            </p>
            <p
              v-else
              class="mt-1.5 rounded border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
            >
              The submission has neither text nor a file attached.
            </p>

            <!-- Graded: read-only record. -->
            <div
              v-if="item.status === 'graded'"
              class="mt-5 rounded-lg border border-success-200 bg-success-50 p-5 dark:border-success-500/30 dark:bg-success-500/10"
            >
              <div class="flex items-start gap-3">
                <CircleCheck
                  class="mt-0.5 size-5 shrink-0 text-success-600 dark:text-success-400"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-success-800 dark:text-success-300">
                    {{ item.grade }} out of {{ item.maxPoints }}
                    <span class="font-normal">
                      ({{ Math.round(((item.grade ?? 0) / (item.maxPoints || 1)) * 100) }}%)
                    </span>
                  </p>
                  <p
                    v-if="item.feedback"
                    class="mt-2 text-sm whitespace-pre-line text-gray-700 dark:text-gray-300"
                  >
                    {{ item.feedback }}
                  </p>
                  <p v-else class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    No written feedback.
                  </p>
                  <p v-if="item.gradedAt" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Graded {{ formatDateTime(item.gradedAt) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Awaiting grade: the form. -->
            <form v-else class="mt-5" @submit.prevent="submit(item.id)">
              <Alert
                v-if="gradeErrors[item.id]"
                variant="error"
                title="Could not record this grade"
                :message="gradeErrors[item.id]"
                class="mb-4"
              />

              <div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <div>
                  <label
                    :for="`grade-${item.id}`"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Grade
                  </label>
                  <input
                    :id="`grade-${item.id}`"
                    v-model="grades[item.id]"
                    type="number"
                    min="0"
                    :max="item.maxPoints"
                    step="0.5"
                    required
                    :placeholder="`0–${item.maxPoints}`"
                    :class="inputClass"
                  />
                  <!--
                    The range check here is a fast message, not the rule. The
                    database refuses a grade above max_points too, and this view
                    shows whatever it says rather than assuming its own check was
                    the one that mattered.
                  -->
                  <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    0 to {{ item.maxPoints }}
                  </p>
                </div>

                <div>
                  <label
                    :for="`feedback-${item.id}`"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Feedback
                  </label>
                  <textarea
                    :id="`feedback-${item.id}`"
                    v-model="feedbacks[item.id]"
                    rows="4"
                    placeholder="Optional. What worked, and what to do next."
                    class="w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500"
                  ></textarea>
                </div>
              </div>

              <div class="mt-4">
                <button
                  type="submit"
                  class="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-500 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                  :disabled="isSaving === item.id"
                >
                  <LoaderCircle v-if="isSaving === item.id" class="size-4 animate-spin" />
                  Record grade
                </button>
              </div>

              <!--
                Stated rather than left implicit, because it is a real limit an
                instructor will hit: the trigger refuses any change once a
                submission is graded. A student replacing their work reopens it.
              -->
              <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                A grade is kept as a record and cannot be changed afterwards. If the student
                resubmits, it reopens for grading.
              </p>
            </form>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CircleCheck, ListChecks, LoaderCircle, Paperclip, Search } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import { gradeSubmission, listGradingQueue } from '@/services/instructor.service'
import type { GradingQueueItem } from '@/services/instructor.service'
import { formatDateTime } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const toast = useToast()

const queue = ref<GradingQueueItem[]>([])
const search = ref('')
const courseFilter = ref('')
const includeGraded = ref(false)
const isLoading = ref(true)
const errorMessage = ref('')

/** submissionId -> the value in that row's grade input. */
const grades = ref<Record<string, string>>({})
/** submissionId -> feedback draft. */
const feedbacks = ref<Record<string, string>>({})
/** submissionId -> message from the failed attempt. */
const gradeErrors = ref<Record<string, string>>({})
const isSaving = ref<string | null>(null)

const searchClass =
  'w-full rounded border border-gray-300 bg-white py-2.5 ps-9 pe-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const selectClass =
  'w-full rounded border border-gray-300 bg-white py-2.5 px-3 text-sm text-gray-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90'

const inputClass =
  'mt-1.5 w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const filtered = computed(() => {
  const term = search.value.toLowerCase()
  return queue.value.filter((item) => {
    if (courseFilter.value && item.courseTitle !== courseFilter.value) return false
    if (!term) return true
    return (
      item.studentName.toLowerCase().includes(term) ||
      item.studentEmail.toLowerCase().includes(term) ||
      item.assignmentTitle.toLowerCase().includes(term) ||
      item.courseTitle.toLowerCase().includes(term)
    )
  })
})

const courseOptions = computed(() =>
  [...new Set(queue.value.map((item) => item.courseTitle))].sort(),
)

const pendingCount = computed(
  () => filtered.value.filter((item) => item.status === 'submitted').length,
)

function isOverdue(item: GradingQueueItem): boolean {
  return item.status === 'submitted' && item.dueAt !== null && new Date(item.dueAt) < new Date()
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  gradeErrors.value = {}
  try {
    // Every query here is scoped to the signed-in instructor, so the profile has
    // to resolve before it runs.
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so the grading queue cannot be read.'
      return
    }
    queue.value = await listGradingQueue(auth.profile.id, { includeGraded: includeGraded.value })
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the grading queue.'
  } finally {
    isLoading.value = false
  }
}

async function toggleIncludeGraded(): Promise<void> {
  includeGraded.value = !includeGraded.value
  await load()
}

async function submit(submissionId: string): Promise<void> {
  if (!auth.profile) return

  const item = queue.value.find((entry) => entry.id === submissionId)
  if (!item) return

  // A grade above the maximum is refused by a database constraint, so the check
  // here exists to say so in the same sentence rather than to be the rule.
  const grade = Number.parseFloat(grades.value[submissionId] ?? '')
  if (!Number.isFinite(grade)) {
    gradeErrors.value[submissionId] =
      'Enter a number between 0 and the maximum for this assignment.'
    return
  }
  if (grade < 0 || grade > item.maxPoints) {
    gradeErrors.value[submissionId] =
      `A grade cannot be below 0 or above ${item.maxPoints} for this assignment.`
    return
  }

  isSaving.value = submissionId
  gradeErrors.value[submissionId] = ''
  try {
    await gradeSubmission(submissionId, grade, feedbacks.value[submissionId] ?? '', auth.profile.id)
    // Reloaded rather than patched in place: the trigger also writes `graded_at`
    // and `graded_by`, and the row has moved to the graded end of the queue.
    // Showing a value this page invented would be a second source of truth for
    // something the database owns.
    await load()
    toast.success('Grade recorded', 'The submission is now marked as graded.')
  } catch (error) {
    // InstructorError messages come from the trigger and say what to fix -
    // "this submission has already been graded", "grade 120 exceeds the maximum
    // of 100" - so they are shown as written.
    const message = error instanceof Error ? error.message : 'Could not record this grade.'
    gradeErrors.value[submissionId] = message
    toast.error('Could not record this grade', message)
  } finally {
    isSaving.value = null
  }
}

onMounted(load)
</script>

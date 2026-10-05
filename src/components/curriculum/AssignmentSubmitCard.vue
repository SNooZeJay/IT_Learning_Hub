<script setup lang="ts">
/**
 * One assignment, as the student sees it, with their own hand-in against it.
 *
 * Three states, and they read differently on purpose. "Not submitted" and
 * "submitted, awaiting a mark" are the two a student can act on, so each offers
 * the box; "marked" is a record, so the box is gone and the grade and feedback
 * replace it. A student who has been marked and still sees an editable box has
 * been told, by the interface, that they may change a gradeable answer - which is
 * exactly what `protect_graded_submission` refuses.
 *
 * There is no file input. The `assignment-submissions` bucket has one policy and
 * it is administrators only, so a student's upload would be refused by storage
 * before any row was written. `FILE_UPLOAD_UNAVAILABLE` says that in the form
 * rather than the form pretending the option does not exist.
 */
import { ref, watch } from 'vue'
import { CircleCheck, Clock, FileText } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import { FILE_UPLOAD_UNAVAILABLE, type StudentAssignment } from '@/services/learning.service'
import { formatDateTime } from '@/types'

const props = defineProps<{
  assignment: StudentAssignment
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{ submit: [assignmentId: string, submissionText: string] }>()

const text = ref('')
const textError = ref('')

watch(
  () => props.assignment.submission?.submissionText,
  (value) => {
    text.value = value ?? ''
    textError.value = ''
  },
  { immediate: true },
)

function submit(): void {
  if (text.value.trim() === '') {
    textError.value = 'Write your answer before handing this in.'
    return
  }
  textError.value = ''
  // The id travels with the text so one handler serves every card on the page,
  // the same way the outline emits an id rather than an index.
  emit('submit', props.assignment.id, text.value)
}
</script>

<template>
  <li class="rounded-lg border border-gray-200 px-4 py-4 dark:border-gray-800">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
          {{ assignment.title }}
        </h3>
        <p class="mt-0.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {{ assignment.maxPoints }} points ·
          <template v-if="assignment.dueAt"> due {{ formatDateTime(assignment.dueAt) }} </template>
          <template v-else>no deadline</template>
        </p>
      </div>

      <!-- The state, from the database's own `status` column. Derived rather than
           stored, so it cannot disagree with the row: a submission that exists
           with no grade is awaiting a mark, not marked. -->
      <span
        class="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
        :class="
          !assignment.submission
            ? 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
            : assignment.submission.status === 'graded'
              ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
              : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
        "
      >
        <CircleCheck v-if="assignment.submission?.status === 'graded'" class="size-3.5" />
        <Clock v-else-if="assignment.submission" class="size-3.5" />
        <FileText v-else class="size-3.5" />
        {{
          !assignment.submission
            ? 'Not submitted'
            : assignment.submission.status === 'graded'
              ? `Marked ${assignment.submission.grade ?? 0} / ${assignment.maxPoints}`
              : 'Submitted, awaiting a mark'
        }}
      </span>
    </div>

    <p
      v-if="assignment.instructions"
      class="mt-3 border-s-2 border-hairline ps-3 text-sm leading-relaxed text-slate dark:text-gray-300"
    >
      {{ assignment.instructions }}
    </p>

    <!-- Marked. The answer is shown as written, and cannot be edited. -->
    <div v-if="assignment.submission?.status === 'graded'" class="mt-4">
      <p
        v-if="assignment.submission.submissionText"
        class="rounded-md bg-gray-50 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
      >
        {{ assignment.submission.submissionText }}
      </p>

      <p
        v-if="assignment.submission.feedback"
        class="mt-3 text-sm text-gray-700 dark:text-gray-300"
      >
        <span class="font-medium">Feedback</span>
        <span class="mt-0.5 block leading-relaxed">{{ assignment.submission.feedback }}</span>
      </p>
      <p v-else class="mt-3 text-sm text-gray-500 dark:text-gray-400">
        No written feedback on this one.
      </p>

      <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Marked
        {{ assignment.submission.gradedAt ? formatDateTime(assignment.submission.gradedAt) : '' }}.
        A mark is a record: ask your instructor to reopen it if it needs to change.
      </p>
    </div>

    <!-- Not marked: one row while ungraded, so the text can be revised. -->
    <form v-else class="mt-4" novalidate @submit.prevent="submit">
      <label
        :for="`submission-${assignment.id}`"
        class="text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Your answer
      </label>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        <template v-if="assignment.submission">
          Handed in {{ formatDateTime(assignment.submission.submittedAt) }}. Handing in again
          replaces it, right up until it is marked.
        </template>
        <template v-else>Plain text. Leave a blank line between paragraphs.</template>
      </p>
      <textarea
        :id="`submission-${assignment.id}`"
        v-model="text"
        rows="7"
        placeholder="Write your answer here."
        class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        :aria-invalid="Boolean(textError)"
      />

      <p v-if="textError" class="mt-1.5 text-sm text-error-600 dark:text-error-400">
        {{ textError }}
      </p>
      <p v-if="error" class="mt-1.5 text-sm text-error-600 dark:text-error-400">{{ error }}</p>

      <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ FILE_UPLOAD_UNAVAILABLE }}</p>
        <Button type="submit" variant="primary" size="sm" :disabled="saving" class="shrink-0">
          {{ assignment.submission ? 'Replace my hand-in' : 'Hand in' }}
        </Button>
      </div>
    </form>
  </li>
</template>

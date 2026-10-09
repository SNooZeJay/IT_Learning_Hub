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
 * A hand-in is text, a file, or both. That matches `submission_has_content`
 * (`submission_text is not null or file_path is not null`), so neither box has to
 * be filled and neither is the "real" answer. The file is chosen here and uploaded
 * by the page, which is the layer that already owns the write - this component
 * never touches storage, so a failed upload cannot leave it looking submitted.
 */
import { ref, watch } from 'vue'
import { CircleCheck, Clock, FileText, Paperclip, X } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import {
  SUBMISSION_FILE_MAX_BYTES,
  describeSubmissionFile,
  type StudentAssignment,
} from '@/services/learning.service'
import { formatDateTime } from '@/types'

const props = defineProps<{
  assignment: StudentAssignment
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  submit: [assignmentId: string, submissionText: string, file: File | null]
}>()

const text = ref('')
const textError = ref('')
const file = ref<File | null>(null)
const fileError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.assignment.submission?.submissionText,
  (value) => {
    text.value = value ?? ''
    textError.value = ''
  },
  { immediate: true },
)

/** The file name as it should read to a human, from the stored key when there is one. */
function fileNameFrom(path: string | null | undefined): string {
  if (!path) return ''
  const last = path.split('/').pop() ?? path
  // Keys are `<uuid>-<name>`, and the uuid is noise to the person who attached it.
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

const storedFileName = () => fileNameFrom(props.assignment.submission?.filePath)

function onFileChosen(event: Event): void {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0] ?? null
  fileError.value = ''

  if (!chosen) {
    file.value = null
    return
  }

  const problem = describeSubmissionFile(chosen)
  if (problem) {
    file.value = null
    fileError.value = problem
    // Cleared so re-picking the same file fires `change` again. Without this a
    // student who picks a 40 MB file, reads the error and picks the right one sees
    // nothing happen.
    input.value = ''
    return
  }

  file.value = chosen
}

function clearFile(): void {
  file.value = null
  fileError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function submit(): void {
  const hasFile = file.value !== null
  if (text.value.trim() === '' && !hasFile) {
    textError.value = 'Write an answer or attach a file before handing this in.'
    return
  }
  textError.value = ''
  // The id travels with the text so one handler serves every card on the page,
  // the same way the outline emits an id rather than an index.
  emit('submit', props.assignment.id, text.value, file.value)
}
</script>

<template>
  <li class="rounded-lg border border-gray-200 px-4 py-4 dark:border-gray-800">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
          {{ assignment.title }}
        </h3>
        <p class="mt-0.5 text-xs text-slate tabular-nums">
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
        v-if="assignment.submission.filePath"
        class="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"
      >
        <Paperclip class="size-4 shrink-0" aria-hidden="true" />
        {{ storedFileName() }}
      </p>

      <p
        v-if="assignment.submission.feedback"
        class="mt-3 text-sm text-gray-700 dark:text-gray-300"
      >
        <span class="font-medium">Feedback</span>
        <span class="mt-0.5 block leading-relaxed">{{ assignment.submission.feedback }}</span>
      </p>
      <p v-else class="mt-3 section-subheading">No written feedback on this one.</p>

      <p class="mt-3 text-xs text-slate">
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
      <p class="mt-0.5 text-xs text-slate">
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
        placeholder="Write your answer here, or attach a file below."
        class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-slate focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        :aria-invalid="Boolean(textError)"
        :aria-describedby="textError ? `submission-error-${assignment.id}` : undefined"
      />

      <!--
        The attachment. Text and file are both optional and either satisfies
        `submission_has_content`, so the label says "or" rather than implying the
        text box is the primary answer.
      -->
      <div class="mt-3">
        <label
          :for="`submission-file-${assignment.id}`"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Or attach a file
        </label>
        <p class="mt-0.5 text-xs text-slate">
          Up to {{ Math.round(SUBMISSION_FILE_MAX_BYTES / (1024 * 1024)) }} MB. Handing in again
          replaces whatever is attached.
        </p>

        <input
          :id="`submission-file-${assignment.id}`"
          ref="fileInput"
          type="file"
          class="sr-only"
          :aria-describedby="fileError ? `submission-file-error-${assignment.id}` : undefined"
          @change="onFileChosen"
        />

        <!--
          A real button rather than styling the input itself. The input is kept in
          the DOM and visually hidden so the label's `for` still opens the native
          picker, which is what gives keyboard and screen-reader users the file
          dialog they expect.
        -->
        <div class="mt-1.5 flex flex-wrap items-center gap-2">
          <label
            :for="`submission-file-${assignment.id}`"
            class="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <Paperclip class="size-4" aria-hidden="true" />
            {{ file ? 'Choose a different file' : 'Choose a file' }}
          </label>

          <span
            v-if="file"
            class="inline-flex min-w-0 items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"
          >
            <span class="truncate">{{ file.name }}</span>
            <button
              type="button"
              class="flex size-6 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              aria-label="Remove the chosen file"
              @click="clearFile"
            >
              <X class="size-3.5" aria-hidden="true" />
            </button>
          </span>

          <!--
            What is already attached, when a file is stored and none has just been
            chosen. Hidden once a new one is picked, because at that point the stored
            name describes something the student is about to replace.
          -->
          <span
            v-else-if="assignment.submission?.filePath"
            class="inline-flex min-w-0 items-center gap-1.5 section-subheading"
          >
            <Paperclip class="size-4 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ storedFileName() }}</span>
          </span>
        </div>
      </div>

      <p
        v-if="textError"
        :id="`submission-error-${assignment.id}`"
        class="mt-1.5 text-sm text-error-600 dark:text-error-400"
      >
        {{ textError }}
      </p>
      <p
        v-if="fileError"
        :id="`submission-file-error-${assignment.id}`"
        class="mt-1.5 text-sm text-error-600 dark:text-error-400"
      >
        {{ fileError }}
      </p>
      <p v-if="error" class="mt-1.5 text-sm text-error-600 dark:text-error-400">{{ error }}</p>

      <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button type="submit" variant="primary" size="sm" :disabled="saving" class="shrink-0">
          {{ saving ? 'Handing in…' : assignment.submission ? 'Replace my hand-in' : 'Hand in' }}
        </Button>
      </div>
    </form>
  </li>
</template>

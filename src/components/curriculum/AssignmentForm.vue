<script setup lang="ts">
/**
 * Create or edit an assignment, inline.
 *
 * The shape is `ModuleForm` and `LessonForm`: one form for both paths, staged
 * state carried in the emit, and `novalidate` because the checks below are
 * ours and a browser bubble is not a message this app can style or translate.
 *
 * The rules it enforces are the ones the database enforces on `assignments`, and
 * it calls the same `validateAssignmentDraft` the service does rather than
 * restating them. Two copies of a rule is one copy too many: a form that drifts
 * from the constraint stops being a shortcut and becomes a second opinion.
 *
 * `due_at` is a `datetime-local` field, so the value here is local wall-clock
 * with no zone, and it is converted to an instant on the way out. A timestamp
 * typed as local time and stored as local time is an hour wrong twice a year.
 */
import { ref, watch } from 'vue'
import { formSelectClass } from '@/components/ui/controlClasses'
import Button from '@/components/ui/Button.vue'
import {
  DEFAULT_ASSIGNMENT_POINTS,
  validateAssignmentDraft,
  type Assignment,
  type AssignmentStatus,
} from '@/services/instructor.service'

const props = defineProps<{
  /** Null when creating. */
  assignment: Assignment | null
  /** Modules on this course, so an assignment can be filed under one. */
  modules: Array<{ id: string; title: string }>
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [
    draft: {
      title: string
      instructions: string | null
      moduleId: string | null
      dueAt: string | null
      maxPoints: number
      status: AssignmentStatus
    },
  ]
}>()

const title = ref('')
const instructions = ref('')
const moduleId = ref('')
const dueAt = ref('')
const maxPoints = ref<number | null>(DEFAULT_ASSIGNMENT_POINTS)
const status = ref<AssignmentStatus>('draft')
const titleError = ref('')
const pointsError = ref('')
const dueAtError = ref('')

/**
 * An ISO timestamp as the value a `datetime-local` input expects.
 *
 * Read through the local getters rather than `toISOString()`, which would shift
 * the instant: `toISOString` is UTC, and feeding UTC into a local-time input
 * moves the deadline by the viewer's offset. An instructor in Manila typing
 * "5pm" would get a deadline that reads back as 5am.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

watch(
  () => props.assignment,
  (value) => {
    title.value = value?.title ?? ''
    instructions.value = value?.instructions ?? ''
    moduleId.value = value?.moduleId ?? ''
    dueAt.value = toLocalInput(value?.dueAt ?? null)
    maxPoints.value = value?.maxPoints ?? DEFAULT_ASSIGNMENT_POINTS
    // Editing a published assignment defaults to keeping it published. Defaulting
    // an edit to draft would quietly pull live work away from the students doing it.
    status.value = value?.status ?? 'draft'
    titleError.value = ''
    pointsError.value = ''
    dueAtError.value = ''
  },
  { immediate: true },
)

function submit(): void {
  const trimmed = title.value.trim()

  // The input holds a string; `v-model.number` leaves it null when the box is
  // empty, and NaN when it holds something that is not a number. Both are
  // refused by the same rule, so both arrive here as NaN.
  const points = maxPoints.value === null ? Number.NaN : Number(maxPoints.value)

  const check = validateAssignmentDraft({
    title: trimmed,
    maxPoints: points,
    dueAt: dueAt.value.trim() === '' ? null : dueAt.value.trim(),
    status: status.value,
  })

  titleError.value = ''
  pointsError.value = ''
  dueAtError.value = ''

  if (!check.ok) {
    // The service reports which rule failed by what it says; here the message is
    // attached to the field it belongs to, so the instructor sees the offending
    // input rather than a line of text below the form.
    if (/title/i.test(check.reason)) titleError.value = check.reason
    else if (/points/i.test(check.reason)) pointsError.value = check.reason
    else dueAtError.value = check.reason
    return
  }

  emit('submit', {
    title: trimmed,
    instructions: instructions.value.trim() === '' ? null : instructions.value.trim(),
    // An empty option value is the "not filed under a module" choice, and the
    // column is nullable, so it stays null rather than becoming a bad uuid.
    moduleId: moduleId.value === '' ? null : moduleId.value,
    dueAt: dueAt.value.trim() === '' ? null : new Date(dueAt.value.trim()).toISOString(),
    maxPoints: points,
    status: status.value,
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
      {{ assignment ? 'Edit assignment' : 'New assignment' }}
    </h3>
    <p class="mt-1 section-subheading">
      An assignment is one piece of work a student hands in. Published assignments count towards a
      student's course completion, so publishing one starts expecting an answer from everyone
      enrolled.
    </p>

    <div class="mt-4 flex flex-col gap-4">
      <div>
        <label for="assignment-title" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Title
        </label>
        <input
          id="assignment-title"
          v-model="title"
          type="text"
          maxlength="255"
          placeholder="Reflection on the first module"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
          :aria-invalid="Boolean(titleError)"
        />
        <p v-if="titleError" class="mt-1.5 text-sm text-error-600 dark:text-error-400">
          {{ titleError }}
        </p>
      </div>

      <div>
        <label
          for="assignment-instructions"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Instructions
          <span class="font-normal text-gray-400">(optional)</span>
        </label>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          What the student is being asked for. This is the whole brief they read before typing.
        </p>
        <textarea
          id="assignment-instructions"
          v-model="instructions"
          rows="5"
          placeholder="Write 300 words on the one idea from this module you would explain to someone starting out."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div>
        <label for="assignment-module" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Which module
          <span class="font-normal text-gray-400">(optional)</span>
        </label>
        <select id="assignment-module" v-model="moduleId" class="formSelectClass">
          <option value="">The whole course — not tied to one module</option>
          <option v-for="module in modules" :key="module.id" :value="module.id">
            {{ module.title }}
          </option>
        </select>
        <p v-if="modules.length === 0" class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          This course has no modules yet, so the assignment will belong to the course as a whole.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            for="assignment-points"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Points
          </label>
          <div class="mt-1.5 flex items-center gap-2">
            <input
              id="assignment-points"
              v-model.number="maxPoints"
              type="number"
              min="0"
              step="1"
              class="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
              :aria-invalid="Boolean(pointsError)"
            />
            <span class="shrink-0 section-subheading">points</span>
          </div>
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Must be more than zero. A grade above this is refused.
          </p>
          <p v-if="pointsError" class="mt-1 text-sm text-error-600 dark:text-error-400">
            {{ pointsError }}
          </p>
        </div>

        <div>
          <label for="assignment-due" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Deadline
            <span class="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="assignment-due"
            v-model="dueAt"
            type="datetime-local"
            class="formSelectClass"
            :aria-invalid="Boolean(dueAtError)"
          />
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Left blank, the assignment has no deadline. A deadline with no date is not a calendar
            event, so it will not appear on yours.
          </p>
          <p v-if="dueAtError" class="mt-1 text-sm text-error-600 dark:text-error-400">
            {{ dueAtError }}
          </p>
        </div>
      </div>

      <div>
        <label for="assignment-status" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Visibility
        </label>
        <select id="assignment-status" v-model="status" class="formSelectClass">
          <option value="draft">Draft — only you can see this</option>
          <option value="published">Published — students can see and hand this in</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="mt-4 text-sm text-error-600 dark:text-error-400">{{ error }}</p>

    <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" variant="primary" :disabled="saving">
        {{ assignment ? 'Save assignment' : 'Add assignment' }}
      </Button>
    </div>
  </form>
</template>

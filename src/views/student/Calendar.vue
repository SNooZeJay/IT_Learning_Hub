<template>
  <div>
    <PageHeader
      title="Deadlines"
      subtitle="What is due across the courses you are taking."
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Calendar' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your deadlines" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Still to submit"
          :value="String(pendingAssignments.length)"
          :icon="Clock"
          hint="Published assignments with nothing handed in"
        />
        <StatCard
          label="Awaiting marking"
          :value="String(awaitingMarking.length)"
          :icon="ClipboardCheck"
          hint="Handed in, not yet graded"
        />
        <StatCard
          label="Overdue"
          :value="String(overdue.length)"
          :icon="TriangleAlert"
          hint="Due date passed, nothing submitted"
        />
      </div>

      <!--
        A separate list rather than folding files into the dated one. The schema
        has exactly one deadline column — assignments.due_at — and nothing on
        lesson_materials. Putting an upload date next to a real due date would
        imply they are the same kind of thing, and they are not.
      -->
      <section class="mt-6">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 class="text-title-sm text-ink">Assignment due dates</h2>
          <p class="shrink-0 text-sm text-slate">
            {{ deadlines.assignments.length }}
            {{ deadlines.assignments.length === 1 ? 'assignment' : 'assignments' }}
          </p>
        </div>

        <div
          v-if="deadlines.assignments.length"
          class="mt-3 overflow-hidden rounded-lg border border-hairline bg-canvas dark:bg-white/[0.03]"
        >
          <ul class="divide-y divide-hairline">
            <li v-for="item in sortedAssignments" :key="item.assignmentId" class="px-5 py-4">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <!-- Due date as a date block rather than a sentence. Scanning a
                     list of deadlines is a date-reading task, and a bold day
                     number is what the eye goes to. -->
                <div
                  v-if="item.dueAt"
                  class="w-16 shrink-0 rounded-md border px-2 py-1.5 text-center"
                  :class="dueBadgeClass(item)"
                >
                  <p class="text-xs font-medium uppercase">{{ dueMonth(item) }}</p>
                  <p class="text-theme-xl leading-tight">{{ dueDay(item) }}</p>
                </div>
                <div v-else class="w-16 shrink-0 text-center">
                  <p class="text-xs text-slate">No date</p>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <component
                      :is="iconFor(item)"
                      class="size-4 shrink-0"
                      :class="iconClass(item)"
                      aria-hidden="true"
                    />
                    <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
                  </div>
                  <p class="mt-1 text-xs text-slate">
                    {{ item.courseTitle }} · {{ item.maxPoints }} points
                    <template v-if="item.grade !== null">
                      · marked {{ item.grade }}/{{ item.maxPoints }}
                    </template>
                  </p>
                </div>

                <div class="text-end">
                  <p class="text-sm font-medium" :class="statusClass(item)">
                    {{ statusLabel(item) }}
                  </p>
                  <p v-if="item.dueAt" class="mt-0.5 text-xs text-slate">
                    {{ relativeLabel(item) }}
                  </p>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <EmptyState
          v-else
          class="mt-3"
          title="No assignment deadlines"
          description="When an instructor publishes an assignment for a course you are taking, its due date appears here."
          :icon="CalendarX"
        />
      </section>

      <!-- ============================= OVERDUE ============================= -->
      <section v-if="overdue.length" class="mt-8">
        <h2 class="text-title-sm text-ink">Overdue</h2>
        <p class="mt-1 text-sm text-slate">
          The due date has passed and nothing has been handed in. Ask your instructor whether the
          deadline still stands — the schema has no way to record an extension, so this list cannot
          know about one.
        </p>

        <ul class="mt-3 space-y-2">
          <li
            v-for="item in overdue"
            :key="item.assignmentId"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-error-200 bg-error-50 px-5 py-4 dark:border-error-500/30 dark:bg-error-500/10"
          >
            <TriangleAlert
              class="size-5 shrink-0 text-error-600 dark:text-error-400"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
              <p class="mt-0.5 text-xs text-slate">
                {{ item.courseTitle }} · was due {{ formatDate(item.dueAt ?? '') }}
              </p>
            </div>
            <p class="text-xs font-medium text-error-700 dark:text-error-400">
              {{ relativeLabel(item) }}
            </p>
          </li>
        </ul>
      </section>

      <!-- ============================ MATERIALS ============================ -->
      <section class="mt-8">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 class="text-title-sm text-ink">Lesson materials still to work through</h2>
          <p class="shrink-0 text-sm text-slate">
            {{ deadlines.materials.length }}
            {{ deadlines.materials.length === 1 ? 'file' : 'files' }}
          </p>
        </div>

        <!--
          Stated plainly because it is the one thing on this screen that is not a
          deadline. `lesson_materials` has no due_date column, so there is nothing
          to sort by and nothing to count down to.
        -->
        <p class="mt-1 text-sm text-slate">
          Files on lessons you have not finished. These carry no deadline — the date shown is when
          the instructor uploaded them.
        </p>

        <div
          v-if="deadlines.materials.length"
          class="mt-3 overflow-hidden rounded-lg border border-hairline bg-canvas dark:bg-white/[0.03]"
        >
          <ul class="divide-y divide-hairline">
            <li
              v-for="material in deadlines.materials"
              :key="material.materialId"
              class="flex items-center gap-3 px-5 py-4"
            >
              <Paperclip class="size-4 shrink-0 text-slate" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ material.title }}</p>
                <p class="mt-0.5 truncate text-xs text-slate">
                  {{ material.lessonTitle }} · {{ material.courseTitle }}
                  <template v-if="material.fileSize !== null">
                    · {{ formatBytes(material.fileSize) }}
                  </template>
                  · added {{ formatDate(material.uploadedAt) }}
                </p>
              </div>
              <RouterLink
                class="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                :to="`/student/lessons/${material.lessonId}`"
              >
                Open lesson
              </RouterLink>
            </li>
          </ul>
        </div>

        <EmptyState
          v-else
          class="mt-3"
          title="No outstanding materials"
          description="Every file attached to your unfinished lessons has been worked through, or your lessons have no attachments yet."
          :icon="Paperclip"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CalendarX,
  CheckCheck,
  ClipboardCheck,
  Clock,
  FileClock,
  LoaderCircle,
  Paperclip,
  TriangleAlert,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import StatCard from '@/components/common/StatCard.vue'
import { getStudentDeadlines } from '@/services/learning.service'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/types'
import type { CourseDeadline, StudentDeadlines } from '@/services/learning.service'

const auth = useAuthStore()

const deadlines = ref<StudentDeadlines>({ assignments: [], materials: [] })
const isLoading = ref(true)
const errorMessage = ref('')

/** Now, captured once per load so a list cannot disagree with itself mid-render. */
const loadedAt = ref(new Date())

const MS_PER_DAY = 86_400_000

function startOfToday(): Date {
  const now = new Date(loadedAt.value)
  now.setHours(0, 0, 0, 0)
  return now
}

/** Whole days from today to `iso`. Negative once the date has passed. */
function daysUntil(iso: string): number {
  const due = new Date(iso)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - startOfToday().getTime()) / MS_PER_DAY)
}

/** Nothing submitted and the date has passed. Overdue is the honest word. */
function isOverdue(item: CourseDeadline): boolean {
  if (!item.dueAt || item.submitted) return false
  return daysUntil(item.dueAt) < 0
}

const overdue = computed(() => deadlines.value.assignments.filter(isOverdue))

const pendingAssignments = computed(() =>
  deadlines.value.assignments.filter((item) => !item.submitted),
)

const awaitingMarking = computed(() =>
  deadlines.value.assignments.filter((item) => item.submitted && item.grade === null),
)

/**
 * Overdue first, then undated, then soonest.
 *
 * Putting an undated assignment at the end rather than the top is a judgement:
 * it is not urgent, and leading with it would push the deadlines that actually
 * have dates off the screen.
 */
const sortedAssignments = computed(() =>
  [...deadlines.value.assignments].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return a.dueAt.localeCompare(b.dueAt)
  }),
)

function dueMonth(item: CourseDeadline): string {
  return item.dueAt
    ? new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(item.dueAt))
    : ''
}

function dueDay(item: CourseDeadline): string {
  return item.dueAt ? new Date(item.dueAt).getDate().toString() : ''
}

/** "Due in 3 days" / "Due today" / "3 days ago", from the date only. */
function relativeLabel(item: CourseDeadline): string {
  if (!item.dueAt) return ''
  const days = daysUntil(item.dueAt)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days === -1) return '1 day late'
  if (days < 0) return `${Math.abs(days)} days late`
  if (days <= 14) return `Due in ${days} days`
  return `Due ${formatDate(item.dueAt)}`
}

function statusLabel(item: CourseDeadline): string {
  if (item.grade !== null) return 'Marked'
  if (item.submitted) return 'Awaiting marking'
  if (isOverdue(item)) return 'Not submitted'
  if (!item.dueAt) return 'No due date'
  return 'Not submitted'
}

function statusClass(item: CourseDeadline): string {
  if (item.grade !== null) return 'text-success-700 dark:text-success-400'
  if (item.submitted) return 'text-warning-700 dark:text-warning-400'
  if (isOverdue(item)) return 'text-error-700 dark:text-error-400'
  return 'text-slate'
}

function dueBadgeClass(item: CourseDeadline): string {
  if (item.grade !== null) {
    return 'border-success-200 bg-success-50 text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300'
  }
  if (item.submitted) {
    return 'border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300'
  }
  if (isOverdue(item)) {
    return 'border-error-200 bg-error-50 text-error-800 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300'
  }
  return 'border-hairline bg-surface text-ink'
}

function iconFor(item: CourseDeadline) {
  if (item.grade !== null) return CheckCheck
  if (item.submitted) return LoaderCircle
  return isOverdue(item) ? TriangleAlert : FileClock
}

function iconClass(item: CourseDeadline): string {
  if (item.grade !== null) return 'text-success-600 dark:text-success-400'
  if (item.submitted) return 'text-warning-600 dark:text-warning-400'
  if (isOverdue(item)) return 'text-error-600 dark:text-error-400'
  return 'text-slate'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    // Scoped to the signed-in student, so the profile id is the query key. The
    // store may still be resolving it on a cold load.
    await auth.ensureReady()
    const studentId = auth.profile?.id
    if (!studentId) {
      errorMessage.value = 'Your profile has not loaded yet. Give it a moment and try again.'
      return
    }
    deadlines.value = await getStudentDeadlines(studentId)
    loadedAt.value = new Date()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load your deadlines. Try again.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

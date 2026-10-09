<script setup lang="ts">
/**
 * The instructor's calendar.
 *
 * This was already a month grid, but it drew one thing: `assignments.due_at`. A
 * teaching calendar that cannot show a student submitting a quiz, enrolling in a
 * course, or the day a course went live is not a calendar of the teaching, it is a
 * deadlines table with a grid on it.
 *
 * So the grid is now the shared `CalendarShell`, fed by every dated row across the
 * instructor's own courses - enrolment, attempts submitted (including whether an
 * attempt ran out of time or of warnings), course publication, announcements,
 * lessons written and quizzes created. Sources and their limits are in
 * `calendar.service.ts`.
 *
 * The three panels below the grid are kept, because they answer a different
 * question from the calendar: the calendar says *when*, these say *what needs me
 * now*. They load separately so their failure costs one list rather than the page.
 */
import { computed, onMounted, ref } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import Alert from '@/components/ui/Alert.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import CalendarShell from '@/components/calendar/CalendarShell.vue'
import { loadInstructorCalendarEvents, type CalendarEvent } from '@/services/calendar.service'
import {
  listAssignments,
  listInstructorCourses,
  listUpcomingDeadlines,
} from '@/services/instructor.service'
import type { Assignment, Deadline } from '@/services/instructor.service'
import { assignmentStatusLabel, formatDateTime } from '@/types'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const events = ref<CalendarEvent[]>([])
const deadlines = ref<Deadline[]>([])
const undatedAssignments = ref<Assignment[]>([])
const courseTitles = ref(new Map<string, string>())

const isLoading = ref(true)
const errorMessage = ref('')
/** About the panels only, so a failure in one does not replace a working calendar. */
const panelError = ref('')

/** Whole days from today, negative when it has passed. */
function daysUntil(iso: string): number {
  const target = new Date(iso)
  const now = new Date()
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((startTarget - startToday) / 86_400_000)
}

/** "3d" rather than a date: the list is ordered by proximity and the reader is asking "how soon". */
function relativeLabel(iso: string): string {
  const days = daysUntil(iso)
  if (days < 0) return `${Math.abs(days)}d late`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `${days}d`
}

const upcomingList = computed(() =>
  deadlines.value.filter((item) => daysUntil(item.dueAt) >= 0).slice(0, 8),
)

const awaitingList = computed(() =>
  deadlines.value.filter((item) => item.awaitingGrading > 0).slice(0, 6),
)

function courseTitleFor(courseId: string): string {
  return courseTitles.value.get(courseId) ?? 'Untitled course'
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  panelError.value = ''

  try {
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so your calendar cannot be read.'
      return
    }

    // The calendar first, on its own: this is the page. The panels below load
    // separately so their failure costs one list rather than the whole thing.
    events.value = await loadInstructorCalendarEvents()

    try {
      deadlines.value = await listUpcomingDeadlines(auth.profile.id)
    } catch (error) {
      panelError.value =
        error instanceof Error ? error.message : 'The deadline panels could not be loaded.'
    }

    try {
      const assignments = await listAssignments({ instructorId: auth.profile.id })
      undatedAssignments.value = assignments.filter((item) => item.dueAt === null)
    } catch (error) {
      panelError.value =
        error instanceof Error ? error.message : 'The "No deadline set" list could not be loaded.'
    }

    try {
      const courses = await listInstructorCourses(auth.profile.id)
      courseTitles.value = new Map(courses.map((course) => [course.id, course.title]))
    } catch (error) {
      panelError.value =
        error instanceof Error ? error.message : 'The course titles could not be loaded.'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load your calendar.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      title="Calendar"
      subtitle="Everything dated across your courses: student activity, your own publishing, and deadlines."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Calendar' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your calendar" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else>
      <Alert
        v-if="panelError"
        variant="warning"
        title="Some panels could not load"
        :message="panelError"
        class="mt-5"
      />

      <div class="mt-6">
        <CalendarShell :events="events" audience="instructor" />
      </div>

      <!--
        What needs me now. Separate from the calendar on purpose: the calendar says
        when, these say what to do.
      -->
      <div class="mt-8 grid gap-6 lg:grid-cols-3">
        <section
          class="surface-card"
          aria-labelledby="instructor-needs-grading"
        >
          <h2 id="instructor-needs-grading" class="text-theme-sm text-ink">Needs grading</h2>
          <p class="mt-1 text-sm text-slate">Assignments with submissions waiting.</p>

          <p v-if="!awaitingList.length" class="mt-5 text-sm text-slate">
            Nothing is waiting to be graded.
          </p>

          <ul v-else role="list" class="mt-5 flex flex-col gap-3">
            <li
              v-for="item in awaitingList"
              :key="item.assignmentId"
              class="rounded border border-hairline px-4 py-3 dark:border-white/10"
            >
              <p class="text-sm font-medium text-ink">{{ item.assignmentTitle }}</p>
              <p class="mt-1 text-xs text-slate">
                {{ item.courseTitle }} ·
                <span class="font-medium text-warning-700 dark:text-warning-400">
                  {{ item.awaitingGrading }} to grade
                </span>
              </p>
              <router-link
                to="/instructor/grading"
                class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Open the queue
                <ArrowRight class="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </router-link>
            </li>
          </ul>
        </section>

        <section
          class="surface-card"
          aria-labelledby="instructor-soonest"
        >
          <h2 id="instructor-soonest" class="text-theme-sm text-ink">Soonest first</h2>

          <p v-if="upcomingList.length === 0" class="mt-5 text-sm text-slate">
            No future deadlines.
          </p>

          <ul v-else role="list" class="mt-5 flex flex-col gap-3">
            <li
              v-for="item in upcomingList"
              :key="item.assignmentId"
              class="border-b border-hairline pb-3 last:border-b-0 last:pb-0 dark:border-white/10"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="text-sm font-medium text-ink">{{ item.assignmentTitle }}</p>
                <span
                  class="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                  :class="
                    daysUntil(item.dueAt) <= 2
                      ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                      : 'bg-surface text-charcoal dark:bg-white/[0.06] dark:text-gray-300'
                  "
                >
                  {{ relativeLabel(item.dueAt) }}
                </span>
              </div>
              <p class="mt-1 text-xs text-slate">
                {{ item.courseTitle }} · due {{ formatDateTime(item.dueAt) }}
              </p>
            </li>
          </ul>
        </section>

        <!--
          Undated assignments are absent from the grid by design - they have no due
          date - so they are listed rather than left invisible. An assignment with
          no deadline still collects submissions, and this is the only place an
          instructor finds out they never set one.
        -->
        <section
          class="surface-card"
          aria-labelledby="instructor-undated"
        >
          <h2 id="instructor-undated" class="text-theme-sm text-ink">No deadline set</h2>
          <p class="mt-1 text-sm text-slate">Not on the calendar, because they have no due date.</p>

          <p v-if="undatedAssignments.length === 0" class="mt-5 text-sm text-slate">
            Every assignment has a deadline.
          </p>

          <ul v-else role="list" class="mt-5 flex flex-col gap-3">
            <li
              v-for="item in undatedAssignments"
              :key="item.id"
              class="border-b border-hairline pb-3 last:border-b-0 last:pb-0 dark:border-white/10"
            >
              <p class="text-sm font-medium text-ink">{{ item.title }}</p>
              <p class="mt-1 text-xs text-slate">
                {{ courseTitleFor(item.courseId) }} · {{ item.maxPoints }} points ·
                {{ assignmentStatusLabel(item.status) }}
              </p>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

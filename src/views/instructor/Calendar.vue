<template>
  <div>
    <PageHeader
      title="Deadline calendar"
      subtitle="Assignment due dates across your courses."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Calendar' }]"
    />

    <!--
      Both side panels load separately from the grid. The grid answers "what is
      due on which day"; the panels answer "what needs my attention now". They
      are separate queries because they answer different questions, and a failure
      in one should not blank the other.
    -->
    <Alert
      v-if="panelError"
      variant="warning"
      title="Some panels could not load"
      :message="panelError"
      class="mb-5"
    />

    <!--
      Month grid. Built as a plain table rather than a calendar library: what an
      instructor needs here is "which day has how many deadlines, and which are
      late", and every dependency that renders a calendar renders far more than
      that.
    -->
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <div
          class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <!-- Month navigation. `prev` and `next` are UTC-shifted because a
               deadline's date is its calendar day, not an instant: building a
               local midnight from a UTC timestamp can land on the day before
               near midnight, which is how a deadline ends up on the wrong date. -->
          <div
            class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800"
          >
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                aria-label="Previous month"
                @click="shiftMonth(-1)"
              >
                <ChevronLeft class="size-4" />
              </button>
              <h2 class="text-title-sm text-gray-900 dark:text-white/90">{{ monthLabel }}</h2>
              <button
                type="button"
                class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                aria-label="Next month"
                @click="shiftMonth(1)"
              >
                <ChevronRight class="size-4" />
              </button>
            </div>
            <button
              v-if="!isCurrentMonth"
              type="button"
              class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              @click="goToToday"
            >
              Today
            </button>
          </div>

          <LoadingState v-if="isLoading" label="Loading deadlines" />

          <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

          <EmptyState
            v-else-if="deadlines.length === 0 && undatedAssignments.length === 0"
            title="No deadlines to show"
            description="Assignments with a due date appear here. An assignment without a deadline is not on a calendar, so it does not appear."
            :icon="CalendarDays"
          />

          <template v-else-if="deadlines.length === 0">
            <!--
              Every assignment exists but none has a date. That is not the same
              as having nothing: the assignments are real and students can hand
              them in, they just have no deadline. Saying so beats an empty grid.
            -->
            <div class="p-6">
              <p
                class="rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                No assignment has a due date yet. Set one and it will appear here.
              </p>
            </div>
          </template>

          <template v-else>
            <div class="overflow-x-auto">
              <table class="w-full min-w-lg">
                <thead>
                  <tr>
                    <th
                      v-for="day in WEEKDAY_HEADINGS"
                      :key="day"
                      scope="col"
                      class="border-b border-gray-200 px-3 py-3 text-start text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400"
                    >
                      {{ day }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(week, index) in weeks" :key="index">
                    <td
                      v-for="cell in week"
                      :key="cell.key"
                      class="h-24 border-b border-gray-200 p-2 align-top dark:border-gray-800"
                      :class="cell.inMonth ? '' : 'bg-gray-50 dark:bg-white/[0.02]'"
                    >
                      <span
                        class="inline-flex size-6 items-center justify-center rounded-full text-xs font-medium"
                        :class="[
                          cell.isToday
                            ? 'bg-brand-500 text-white'
                            : cell.inMonth
                              ? 'text-gray-700 dark:text-gray-300'
                              : 'text-gray-400 dark:text-gray-500',
                        ]"
                      >
                        {{ cell.day }}
                      </span>

                      <ul v-if="cell.items.length" class="mt-1 space-y-1">
                        <li v-for="item in cell.items" :key="item.assignmentId">
                          <button
                            type="button"
                            class="block w-full rounded px-1.5 py-1 text-start text-xs transition-colors"
                            :class="
                              item.awaitingGrading > 0
                                ? 'bg-warning-50 text-warning-800 hover:bg-warning-100 dark:bg-warning-500/15 dark:text-warning-300 dark:hover:bg-warning-500/25'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.12]'
                            "
                            @click="openDeadline(item)"
                          >
                            <span class="line-clamp-2 font-medium">{{ item.assignmentTitle }}</span>
                          </button>
                        </li>
                      </ul>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!--
              A month with nothing on it says so, rather than showing an empty
              grid that looks like the calendar failed to load.
            -->
            <p
              v-if="deadlinesInMonth === 0"
              class="border-t border-gray-200 px-6 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400"
            >
              Nothing is due in {{ monthLabel }}.
            </p>
          </template>
        </div>
      </div>

      <!-- Upcoming list -->
      <div class="space-y-6">
        <div
          class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Needs grading</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Assignments with submissions waiting.
          </p>

          <p v-if="!awaitingList.length" class="mt-5 text-sm text-gray-500 dark:text-gray-400">
            Nothing is waiting to be graded.
          </p>

          <ul v-else class="mt-5 space-y-3">
            <li
              v-for="item in awaitingList"
              :key="item.assignmentId"
              class="rounded border border-gray-200 px-4 py-3 dark:border-gray-800"
            >
              <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                {{ item.assignmentTitle }}
              </p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ item.courseTitle }} ·
                <span class="font-medium text-warning-700 dark:text-warning-400">
                  {{ item.awaitingGrading }} to grade
                </span>
              </p>
              <router-link
                to="/instructor/grading"
                class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                Open the queue
                <ArrowRight class="size-3.5" />
              </router-link>
            </li>
          </ul>
        </div>

        <div
          class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Soonest first</h2>

          <p v-if="upcomingList.length === 0" class="mt-5 text-sm text-gray-500 dark:text-gray-400">
            No future deadlines.
          </p>

          <ul v-else class="mt-5 space-y-3">
            <li
              v-for="item in upcomingList"
              :key="item.assignmentId"
              class="border-b border-gray-200 pb-3 last:border-0 last:pb-0 dark:border-gray-800"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                  {{ item.assignmentTitle }}
                </p>
                <!--
                  "3d" rather than a full date, because the list is already
                  ordered by proximity and the reader is asking "how soon".
                -->
                <span
                  class="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                  :class="
                    daysUntil(item.dueAt) <= 2
                      ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
                  "
                >
                  {{ relativeLabel(item.dueAt) }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ item.courseTitle }} · due {{ formatDateTime(item.dueAt) }}
              </p>
            </li>
          </ul>
        </div>

        <!--
          Undated assignments. These are absent from the grid by design, so they
          are listed rather than left invisible - an assignment with no deadline
          still exists and still collects submissions, and an instructor who has
          forgotten to set one has no other way to find that out.
        -->
        <div
          class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">No deadline set</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Not on the calendar, because they have no due date.
          </p>

          <p
            v-if="undatedAssignments.length === 0"
            class="mt-5 text-sm text-gray-500 dark:text-gray-400"
          >
            Every assignment has a deadline.
          </p>

          <ul v-else class="mt-5 space-y-3">
            <li
              v-for="item in undatedAssignments"
              :key="item.id"
              class="border-b border-gray-200 pb-3 last:border-0 last:pb-0 dark:border-gray-800"
            >
              <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                {{ item.title }}
              </p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ courseTitleFor(item.courseId) }} · {{ item.maxPoints }} points ·
                {{ item.status }}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Selected deadline -->
    <Modal v-if="selected" @close="selected = null">
      <template #body>
        <div
          class="relative w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-theme-lg dark:bg-gray-900"
          role="dialog"
          aria-modal="true"
        >
          <h3 class="text-title-sm text-gray-900 dark:text-white/90">
            {{ selected.assignmentTitle }}
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ selected.courseTitle }}</p>

          <dl class="mt-5 space-y-2.5 text-sm">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-gray-500 dark:text-gray-400">Due</dt>
              <dd class="font-medium text-gray-900 dark:text-white/90">
                {{ formatDateTime(selected.dueAt) }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-gray-500 dark:text-gray-400">Worth</dt>
              <dd class="font-medium text-gray-900 dark:text-white/90">
                {{ selected.maxPoints }} points
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-gray-500 dark:text-gray-400">Submissions</dt>
              <dd class="font-medium text-gray-900 dark:text-white/90">
                {{ selected.submissions }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-gray-500 dark:text-gray-400">Awaiting a grade</dt>
              <dd class="font-medium text-gray-900 dark:text-white/90">
                {{ selected.awaitingGrading }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-gray-500 dark:text-gray-400">Status</dt>
              <dd class="font-medium text-gray-900 dark:text-white/90">{{ selected.status }}</dd>
            </div>
          </dl>

          <div class="mt-6 flex flex-wrap gap-3">
            <router-link
              to="/instructor/grading"
              class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              @click="selected = null"
            >
              Grade submissions
              <ArrowRight class="size-4" />
            </router-link>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              @click="selected = null"
            >
              Close
            </button>
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import Alert from '@/components/ui/Alert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Modal from '@/components/ui/Modal.vue'
import {
  listAssignments,
  listInstructorCourses,
  listUpcomingDeadlines,
} from '@/services/instructor.service'
import type { Assignment, Deadline } from '@/services/instructor.service'
import { formatDateTime } from '@/types'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const deadlines = ref<Deadline[]>([])
const undatedAssignments = ref<Assignment[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const selected = ref<Deadline | null>(null)

/**
 * A message about the sidebar panels specifically.
 *
 * The grid and the panels are separate reads. One shared `error` string would
 * let a failure in the small undated-assignments list replace a perfectly good
 * calendar with an error page.
 */
const panelError = ref('')

/** courseId -> title, for the undated list, which has no course title of its own. */
const courseTitles = ref(new Map<string, string>())

/**
 * The month on display, held as a year and month number rather than a Date.
 *
 * A `Date` here would be the source of an off-by-one: constructing one from a
 * UTC timestamp and then reading local fields can move a deadline onto the
 * previous day. Keeping the numbers and formatting them explicitly avoids it.
 */
const cursor = ref({ year: new Date().getFullYear(), month: new Date().getMonth() })

const WEEKDAY_HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(
    // Day 1 of the month, in local time, so the label cannot slip a month at a
    // month boundary in some timezone.
    new Date(cursor.value.year, cursor.value.month, 1),
  ),
)

const isCurrentMonth = computed(() => {
  const now = new Date()
  return cursor.value.year === now.getFullYear() && cursor.value.month === now.getMonth()
})

/**
 * The calendar day a deadline falls on, read in UTC.
 *
 * `due_at` is a timestamptz, so the stored instant already encodes the author's
 * local day. Reading the UTC parts of that instant is what makes a deadline set
 * for the 23rd show on the 23rd for every reader, instead of drifting a day
 * earlier or later depending on where they are.
 */
function dayKeyOf(iso: string): string {
  const date = new Date(iso)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

const deadlinesByDay = computed(() => {
  const map = new Map<string, Deadline[]>()
  for (const item of deadlines.value) {
    const key = dayKeyOf(item.dueAt)
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
})

function courseTitleFor(courseId: string): string {
  return courseTitles.value.get(courseId) ?? 'Untitled course'
}

const deadlinesInMonth = computed(
  () =>
    deadlinesByDay.value.get(
      `${cursor.value.year}-${String(cursor.value.month + 1).padStart(2, '0')}`,
    )?.length ?? 0,
)

interface DayCell {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  items: Deadline[]
}

/**
 * Six weeks of cells starting on Monday.
 *
 * Always 42 cells rather than trimming to the month's length, so the table does
 * not change height as the user pages between months. The trailing days belong
 * to the next month and are dimmed, which is how a paper month grid works.
 */
const weeks = computed<DayCell[][]>(() => {
  const first = new Date(cursor.value.year, cursor.value.month, 1)
  // getDay() is Sunday-first; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7
  const todayKey = dayKeyOf(new Date().toISOString())
  const cells: DayCell[] = []

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(cursor.value.year, cursor.value.month, 1 - leading + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`

    cells.push({
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === cursor.value.month,
      isToday: key === todayKey,
      items: deadlinesByDay.value.get(key) ?? [],
    })
  }

  const rows: DayCell[][] = []
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7))
  return rows
})

const now = new Date()

/** Whole days from today to the deadline, negative when it has passed. */
function daysUntil(iso: string): number {
  const target = new Date(iso)
  const startOfTarget = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((startOfTarget - startOfToday) / 86_400_000)
}

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

function shiftMonth(delta: number): void {
  const next = new Date(cursor.value.year, cursor.value.month + delta, 1)
  cursor.value = { year: next.getFullYear(), month: next.getMonth() }
}

function goToToday(): void {
  const today = new Date()
  cursor.value = { year: today.getFullYear(), month: today.getMonth() }
}

function openDeadline(item: Deadline): void {
  selected.value = item
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  panelError.value = ''
  try {
    // Scoped to the signed-in instructor, so the profile has to resolve first.
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so your deadlines cannot be read.'
      return
    }

    // The grid first, on its own: this is the page, and a failure here is a
    // failed page. The sidebar panels then load separately so their failure
    // costs the reader one list rather than the calendar.
    deadlines.value = await listUpcomingDeadlines(auth.profile.id)

    try {
      const assignments = await listAssignments({ instructorId: auth.profile.id })
      undatedAssignments.value = assignments.filter((item) => item.dueAt === null)
    } catch (error) {
      panelError.value =
        error instanceof Error ? error.message : 'The “No deadline set” list could not be loaded.'
    }

    // Course titles, for the undated list. `listInstructorCourses` is the one
    // read that already carries a title per course.
    try {
      const courses = await listInstructorCourses(auth.profile.id)
      courseTitles.value = new Map(courses.map((course) => [course.id, course.title]))
    } catch (error) {
      panelError.value =
        error instanceof Error ? error.message : 'The course titles could not be loaded.'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load your deadlines.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

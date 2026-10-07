<script setup lang="ts">
/**
 * The student's home.
 *
 * This shipped as four hardcoded `StatCard`s - literal `value="0"` and `value="--"`
 * - and two hardcoded empty states, with no service call anywhere in the file. A
 * student with three enrolments, two graded quizzes and a lesson in progress was
 * told they had none of them, and the number "0" looked like a fact rather than an
 * absence of code.
 *
 * Everything here is now read from `dashboard.service`, which was written with two
 * rules that shape the layout:
 *
 * A figure that could not be loaded is `null`, not `0`. Null renders as a dash with
 * the reason beside it, because zero is a fact about a student and null is a fact
 * about the request. Collapsing the two is how a broken dashboard comes to look
 * like a new student.
 *
 * Every card has a reason to exist. "Deadlines this week" was here because
 * TailAdmin's dashboard had a stat card; there is no assignment-deadline concept in
 * this product yet, so it is gone rather than kept at zero.
 */
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRight,
  Award,
  BookOpen,
  CircleCheck,
  CirclePlay,
  FileText,
  ListChecks,
  RefreshCw,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import TrendChart from '@/components/common/TrendChart.vue'
import Button from '@/components/ui/Button.vue'
import { useAuthStore } from '@/stores/auth'
import { loadStudentDashboard, type StudentDashboard } from '@/services/dashboard.service'
import { loadUpcomingDeadlines, type CalendarEvent } from '@/services/calendar.service'
import { EVENT_PRESENTATION } from '@/services/calendar.service'
import { formatDateTime } from '@/types'
import { formatShortDate } from '@/components/calendar/format'

const auth = useAuthStore()

const dashboard = ref<StudentDashboard | null>(null)
/**
 * The nearest dated, unfinished work.
 *
 * Deliberately narrower than the calendar. A deadline is something still owed: a
 * passed quiz and a submitted assignment are not deadlines, and listing them as
 * though they were is how a dashboard ends up telling somebody they are behind when
 * they are not. The Calendar page shows the same events on their dates; this is the
 * short version of it, and neither replaces the other.
 */
const deadlines = ref<CalendarEvent[]>([])
const isLoading = ref(true)
const loadFailed = ref(false)

const firstName = computed(() => auth.profile?.fullName.split(' ')[0] ?? 'there')

/** "0", or "—" when the figure could not be read. Never a fabricated zero. */
function figure(value: number | null): string {
  return value === null ? '—' : String(value)
}

function hint(value: number | null, loaded: string, failed: string): string {
  return value === null ? failed : loaded
}

async function load(): Promise<void> {
  isLoading.value = true
  loadFailed.value = false
  try {
    // loadStudentDashboard absorbs per-figure failures internally and returns null
    // for each one, so this only rejects if the whole thing is unreachable.
    // Two independent reads. A failure in the deadline summary must not cost the
    // whole dashboard, and vice versa.
    const [stats, due] = await Promise.allSettled([
      loadStudentDashboard(),
      loadUpcomingDeadlines(4),
    ])

    if (stats.status === 'fulfilled') dashboard.value = stats.value
    else loadFailed.value = true

    deadlines.value = due.status === 'fulfilled' ? due.value : []
  } catch {
    loadFailed.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

/** A figure is unavailable rather than zero when the service returned null. */
const unavailable = computed(() => dashboard.value?.enrolledCourses === null)

const hasAnyActivity = computed(() => {
  const d = dashboard.value
  if (!d) return false
  return (
    (d.enrolledCourses ?? 0) > 0 ||
    (d.lessonsCompleted ?? 0) > 0 ||
    d.recentGrades.length > 0 ||
    d.upcomingQuizzes.length > 0 ||
    d.continueLearning !== null
  )
})
</script>

<template>
  <div>
    <PageHeader
      :title="`Welcome back, ${firstName}`"
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Dashboard' }]"
    >
      <template #actions>
        <router-link
          to="/student/courses"
          class="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Browse courses
        </router-link>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading your dashboard" />

    <ErrorState
      v-else-if="loadFailed"
      message="Your dashboard could not be loaded. Nothing is wrong with your account - the figures simply could not be read just now."
      @retry="load"
    />

    <template v-else-if="dashboard">
      <!-- A partial failure is stated once, plainly, rather than shown as a grid of
           zeroes the student has to guess at. -->
      <div
        v-if="unavailable"
        class="mb-6 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 dark:border-warning-500/30 dark:bg-warning-500/[0.06]"
      >
        <p class="text-sm text-warning-800 dark:text-warning-200">
          Some figures could not be loaded and are shown as a dash. Try again in a moment.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Enrolled courses"
          :value="figure(dashboard.enrolledCourses)"
          :icon="BookOpen"
          :hint="
            hint(
              dashboard.enrolledCourses,
              dashboard.completedCourses
                ? `${dashboard.completedCourses} completed`
                : 'Currently enrolled',
              'Could not load',
            )
          "
        />
        <StatCard
          label="Lessons completed"
          :value="figure(dashboard.lessonsCompleted)"
          :icon="CircleCheck"
          :hint="hint(dashboard.lessonsCompleted, 'Across all courses', 'Could not load')"
        />
        <StatCard
          label="Average quiz score"
          :value="dashboard.averageQuizScore === null ? '—' : `${dashboard.averageQuizScore}%`"
          :icon="Award"
          :hint="
            hint(dashboard.averageQuizScore, 'Across graded attempts', 'No graded attempts yet')
          "
        />
        <StatCard
          label="Quizzes available"
          :value="figure(dashboard.quizzesAvailable)"
          :icon="ListChecks"
          :hint="hint(dashboard.quizzesAvailable, 'In your courses', 'Could not load')"
        />
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <!-- Continue learning. The single most useful thing on the page: where to
               go next. Everything else on a dashboard is reference. -->
          <div class="surface-card">
            <h2 class="section-heading">Continue learning</h2>

            <div v-if="dashboard.continueLearning" class="mt-5">
              <p class="section-subheading">
                {{ dashboard.continueLearning.courseTitle }}
              </p>

              <p class="mt-1 text-xl font-semibold text-gray-900 dark:text-white/90">
                {{ dashboard.continueLearning.lessonTitle }}
              </p>
              <p v-if="dashboard.continueLearning.moduleTitle" class="mt-1 section-subheading">
                {{ dashboard.continueLearning.moduleTitle }}
              </p>

              <!-- Progress through the course, from the same numbers as the label
                   below it. A bar and a figure that disagree is worse than neither. -->
              <div class="mt-5">
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="section-subheading">
                    {{ dashboard.continueLearning.completedInCourse }} of
                    {{ dashboard.continueLearning.totalLessons }} lessons
                  </span>
                  <span class="font-medium text-gray-900 tabular-nums dark:text-white/90">
                    {{
                      Math.round(
                        (dashboard.continueLearning.completedInCourse /
                          dashboard.continueLearning.totalLessons) *
                          100,
                      )
                    }}%
                  </span>
                </div>
                <div
                  class="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]"
                  role="progressbar"
                  :aria-valuenow="
                    (dashboard.continueLearning.completedInCourse /
                      dashboard.continueLearning.totalLessons) *
                    100
                  "
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`Course progress for ${dashboard.continueLearning.courseTitle}`"
                >
                  <div
                    class="h-full rounded-full bg-brand-600"
                    :style="`width: ${
                      (dashboard.continueLearning.completedInCourse /
                        dashboard.continueLearning.totalLessons) *
                      100
                    }%`"
                  />
                </div>
              </div>

              <router-link
                :to="`/student/lessons/${dashboard.continueLearning.lessonId}`"
                class="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                <CirclePlay class="size-4" aria-hidden="true" />
                Continue this lesson
              </router-link>
            </div>

            <EmptyState
              v-else-if="hasAnyActivity"
              class="mt-4"
              title="Nothing left to continue"
              description="Every lesson in your active courses is complete. Start something new, or review what you have finished."
              :icon="CircleCheck"
            >
              <router-link
                to="/student/courses"
                class="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Find a course
              </router-link>
            </EmptyState>

            <EmptyState
              v-else
              class="mt-4"
              title="Nothing in progress"
              description="Enroll in a course and your next lesson appears here, so you can pick up where you left off."
              :icon="BookOpen"
            >
              <router-link
                to="/student/courses"
                class="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Find a course
              </router-link>
            </EmptyState>
          </div>

          <!-- Recent grades. A student opens this to find out how they did. -->
          <div v-if="dashboard.recentGrades.length > 0" class="mt-6 surface-card">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 class="section-heading">Recent results</h2>
              <router-link
                to="/student/grades"
                class="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                All results
                <ArrowRight class="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </router-link>
            </div>

            <ul role="list" class="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
              <li v-for="grade in dashboard.recentGrades" :key="grade.attemptId">
                <router-link
                  :to="`/student/quizzes/${grade.quizId}`"
                  class="-mx-2 flex items-center gap-4 rounded-md px-2 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.06]"
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-gray-900 dark:text-white/90"
                    >
                      {{ grade.quizTitle }}
                    </span>
                    <span class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {{ grade.courseTitle }} · {{ formatDateTime(grade.submittedAt) }}
                    </span>
                  </span>

                  <!-- The score, and the verdict as a word. Colour alone would fail
                       anyone who cannot tell the two apart. -->
                  <span class="shrink-0 text-end">
                    <span
                      class="block text-sm font-semibold text-gray-900 tabular-nums dark:text-white/90"
                    >
                      {{ grade.percentage }}%
                    </span>
                    <span
                      class="mt-0.5 block text-xs font-medium"
                      :class="
                        grade.passed
                          ? 'text-success-700 dark:text-success-400'
                          : 'text-error-700 dark:text-error-400'
                      "
                    >
                      {{ grade.passed ? 'Passed' : 'Not passed' }}
                    </span>
                  </span>
                </router-link>
              </li>
            </ul>
          </div>

          <div class="mt-6">
            <TrendChart metric="student_activity" />
          </div>
        </div>

        <div>
          <!-- Quizzes with something still to do. Passed quizzes and exhausted
               quizzes are deliberately absent: both are dead ends, and offering
               them sends a student to a screen that tells them they cannot start. -->
          <div class="surface-card">
            <h2 class="section-heading">Quizzes to do</h2>
            <p class="mt-1 section-subheading">{{ dashboard.upcomingQuizzes.length }} waiting</p>

            <div v-if="dashboard.upcomingQuizzes.length > 0" class="mt-5">
              <ul role="list" class="flex flex-col gap-3">
                <li v-for="quiz in dashboard.upcomingQuizzes" :key="quiz.quizId">
                  <router-link
                    :to="`/student/quizzes/${quiz.quizId}`"
                    class="surface-card-interactive block p-4"
                  >
                    <span class="flex items-start gap-3">
                      <span class="icon-chip">
                        <FileText class="size-4" aria-hidden="true" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium text-gray-900 dark:text-white/90">
                          {{ quiz.title }}
                        </span>
                        <span
                          class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400"
                        >
                          {{ quiz.courseTitle }}
                        </span>
                        <span
                          class="mt-1.5 block text-xs tabular-nums"
                          :class="
                            quiz.hasOpenAttempt
                              ? 'font-medium text-brand-600 dark:text-brand-400'
                              : 'text-gray-500 dark:text-gray-400'
                          "
                        >
                          <template v-if="quiz.hasOpenAttempt">
                            Resume · attempt {{ quiz.attemptsUsed + 1 }} unfinished
                          </template>
                          <template v-else>
                            {{ quiz.questionCount }}
                            {{ quiz.questionCount === 1 ? 'question' : 'questions' }} ·
                            {{ quiz.attemptsAllowed - quiz.attemptsUsed }} of
                            {{ quiz.attemptsAllowed }} attempts left
                          </template>
                        </span>
                      </span>
                    </span>
                  </router-link>
                </li>
              </ul>
            </div>

            <EmptyState
              v-else
              class="mt-4"
              title="Nothing outstanding"
              description="You have every published quiz in your courses passed, or there are none published yet."
              :icon="ListChecks"
            />
          </div>

          <!-- Only rendered when there is something to say. A permanent card of
               zeroes is worse than no card. -->
          <div
            v-if="dashboard.unreadNotifications && dashboard.unreadNotifications > 0"
            class="mt-6 surface-card"
          >
            <h2 class="section-heading">Notifications</h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              You have
              <strong class="font-semibold">{{ dashboard.unreadNotifications }}</strong>
              unread
              {{ dashboard.unreadNotifications === 1 ? 'notification' : 'notifications' }}.
            </p>
            <router-link
              to="/student/notifications"
              class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Read them
              <ArrowRight class="size-3.5 rtl:rotate-180" aria-hidden="true" />
            </router-link>
          </div>

          <!--
            Upcoming deadlines. The compact summary; the Calendar page is where
            these appear on their actual dates. Rendered only when there is
            something due - a permanent panel reading "nothing" is a dead component
            most weeks of term.
          -->
          <div v-if="deadlines.length > 0" class="mt-6 surface-card">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 class="section-heading">Upcoming deadlines</h2>
              <router-link
                to="/student/calendar"
                class="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Calendar
                <ArrowRight class="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </router-link>
            </div>

            <ul role="list" class="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
              <li v-for="item in deadlines" :key="item.id">
                <component
                  :is="item.link ? 'router-link' : 'div'"
                  :to="item.link ?? undefined"
                  class="flex items-center gap-3 py-3.5 transition-colors"
                  :class="
                    item.link
                      ? '-mx-2 rounded-md px-2 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
                      : ''
                  "
                >
                  <!-- A date block rather than a sentence: reading when something is
                       due is a date-reading task, and the day number is what the eye
                       goes to. -->
                  <span
                    class="flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-gray-100 text-center dark:bg-white/[0.06]"
                  >
                    <span
                      class="text-[10px] leading-none font-medium text-gray-500 uppercase dark:text-gray-400"
                    >
                      {{ formatShortDate(item.at).split(' ')[1] }}
                    </span>
                    <span
                      class="text-sm leading-tight font-semibold text-gray-900 tabular-nums dark:text-white/90"
                    >
                      {{ formatShortDate(item.at).split(' ')[0] }}
                    </span>
                  </span>

                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-gray-900 dark:text-white/90"
                    >
                      {{ item.title }}
                    </span>
                    <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {{ EVENT_PRESENTATION[item.kind].label }}
                      <template v-if="item.courseTitle"> · {{ item.courseTitle }}</template>
                    </span>
                  </span>

                  <ArrowRight
                    v-if="item.link"
                    class="size-4 shrink-0 text-gray-400 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </component>
              </li>
            </ul>
          </div>
          <!--
            Certificates appear only once earned. `listMyCertificates` already exists
            in `learning.service`; this is a plain link rather than a second query,
            because a link to the real page beats a summary that can disagree with it.
          -->
          <router-link
            to="/student/grades"
            class="surface-card-interactive mt-6 flex items-center justify-between gap-3 p-5"
          >
            <span class="min-w-0">
              <span class="block text-sm font-medium text-gray-900 dark:text-white/90">
                Grades and certificates
              </span>
              <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                Every score, and any certificate you have earned
              </span>
            </span>
            <ArrowRight class="size-4 shrink-0 text-gray-400 rtl:rotate-180" aria-hidden="true" />
          </router-link>

          <div class="mt-6 text-end">
            <Button variant="outline" size="sm" @click="load">
              <RefreshCw class="size-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

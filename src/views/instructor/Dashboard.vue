<script setup lang="ts">
/**
 * The instructor's home.
 *
 * This shipped as four hardcoded `StatCard`s - literal `value="0"` and `value="--"`,
 * no service call in the file at all - next to two hardcoded empty states. An
 * instructor with four courses and a student who had just submitted a quiz was told
 * they had none of either.
 *
 * What is on it, and why each piece earns its place:
 *
 *   Courses and students    what this person is responsible for.
 *   Quiz activity           the thing that needs a decision, so it leads the list.
 *   Recent enrolments       who arrived, and in what - the shape of the week.
 *   Recent materials        what was published lately.
 *
 * What was removed: "Submissions to grade", because `assignments` is a table with no
 * authoring UI behind it, so the number would always be zero and a permanent zero is
 * worse than no card. It can come back when assignments are built.
 *
 * Every figure is scoped by `is_instructor_of` in Postgres, so these numbers are the
 * instructor's own and cannot be widened from the browser.
 */
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRight,
  BookOpen,
  ChartColumn,
  CircleCheck,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  RefreshCw,
  TriangleAlert,
  Users,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import TrendChart from '@/components/common/TrendChart.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import Button from '@/components/ui/Button.vue'
import { useAuthStore } from '@/stores/auth'
import { loadInstructorDashboard, type InstructorDashboard } from '@/services/dashboard.service'
import { formatDateTime } from '@/types'
import { materialTypeLabel } from '@/services/curriculum.service'

const auth = useAuthStore()

const dashboard = ref<InstructorDashboard | null>(null)
const isLoading = ref(true)
const loadFailed = ref(false)

const firstName = computed(() => auth.profile?.fullName.split(' ')[0] ?? 'there')

function figure(value: number | null): string {
  return value === null ? '—' : String(value)
}

function hint(value: number | null, loaded: string, failed: string): string {
  return value === null ? failed : loaded
}

/**
 * How an attempt ended, in the instructor's words.
 *
 * `ended_via` is the difference between a student who finished and one who ran out
 * of time or of warnings, and an instructor reviewing a quiet class needs to tell
 * those apart - a run of warning-exhausted attempts is a teaching signal, not noise.
 */
function endedLabel(endedVia: string | null): { text: string; warn: boolean } {
  if (endedVia === 'time_expired') return { text: 'Ran out of time', warn: true }
  if (endedVia === 'warnings_exhausted') return { text: 'Ended on warnings', warn: true }
  return { text: 'Submitted', warn: false }
}

async function load(): Promise<void> {
  isLoading.value = true
  loadFailed.value = false
  try {
    dashboard.value = await loadInstructorDashboard()
  } catch {
    loadFailed.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const hasCourses = computed(() => (dashboard.value?.courses ?? 0) > 0)
</script>

<template>
  <div>
    <PageHeader
      :title="`Welcome back, ${firstName}`"
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Dashboard' }]"
    >
      <template #actions>
        <router-link
          to="/instructor/courses/create"
          class="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          New course
        </router-link>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading your dashboard" />

    <ErrorState
      v-else-if="loadFailed"
      message="Your dashboard could not be loaded. Your courses and account are unaffected - the figures simply could not be read just now."
      @retry="load"
    />

    <template v-else-if="dashboard">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Courses"
          :value="figure(dashboard.courses)"
          :icon="Library"
          :hint="
            hint(
              dashboard.courses,
              dashboard.draftCourses
                ? `${dashboard.publishedCourses} published, ${dashboard.draftCourses} draft`
                : 'All published',
              'Could not load',
            )
          "
        />
        <StatCard
          label="Students"
          :value="figure(dashboard.students)"
          :icon="Users"
          :hint="hint(dashboard.students, 'Across your courses', 'Could not load')"
        />
        <StatCard
          label="Quizzes"
          :value="figure(dashboard.quizzes)"
          :icon="ListChecks"
          :hint="
            hint(
              dashboard.quizzes,
              dashboard.quizAttempts ? `${dashboard.quizAttempts} attempts sat` : 'None sat yet',
              'Could not load',
            )
          "
        />
        <StatCard
          label="Average quiz score"
          :value="dashboard.averageQuizScore === null ? '—' : `${dashboard.averageQuizScore}%`"
          :icon="ChartColumn"
          :hint="
            hint(dashboard.averageQuizScore, 'Across graded attempts', 'No graded attempts yet')
          "
        />
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <!-- Quiz activity first: it is the only panel on this page that can
               contain something an instructor needs to act on. -->
          <div class="surface-card-shell">
            <div class="flex flex-wrap items-baseline justify-between gap-3 p-6 pb-4">
              <div>
                <h2 class="section-heading">Recent quiz activity</h2>
                <p class="mt-1 section-subheading">
                  The most recent graded attempts across your courses.
                </p>
              </div>
              <router-link
                to="/instructor/analytics"
                class="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Insights
                <ArrowRight class="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </router-link>
            </div>

            <div v-if="dashboard.recentQuizAttempts.length > 0">
              <!--
                The scroll container stays - below this width the four columns cannot
                compress without wrapping every date - but the floor drops from `min-w-3xl`
                (48rem) to 34rem.

                At 48rem the table was always wider than this two-thirds column, so it was
                permanently half-scrolled and the "Ended" column was cut mid-value with
                nothing to suggest it moved. A control that is always scrolled reads as
                broken; one that scrolls only when it must does not.
              -->
              <div class="overflow-x-auto">
                <table class="w-full min-w-[34rem] border-collapse text-start text-sm">
                  <caption class="sr-only">
                    The most recent graded quiz attempts across your courses, with the score,
                    whether it passed, and how the attempt ended.
                  </caption>
                  <thead>
                    <tr class="border-y border-gray-200 text-start dark:border-gray-800">
                      <th
                        scope="col"
                        class="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Student
                      </th>
                      <th
                        scope="col"
                        class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Quiz
                      </th>
                      <th
                        scope="col"
                        class="px-4 py-3 text-end text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Score
                      </th>
                      <th
                        scope="col"
                        class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Ended
                      </th>
                      <th
                        scope="col"
                        class="px-6 py-3 text-end text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                    <tr
                      v-for="attempt in dashboard.recentQuizAttempts"
                      :key="`${attempt.studentId ?? attempt.studentName}-${attempt.submittedAt}`"
                    >
                      <td class="px-6 py-3.5">
                        <span class="block font-medium text-gray-900 dark:text-white/90">
                          {{ attempt.studentName ?? 'Unknown student' }}
                        </span>
                      </td>
                      <td class="px-4 py-3.5">
                        <span class="block text-gray-700 dark:text-gray-200">
                          {{ attempt.quizTitle }}
                        </span>
                        <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {{ attempt.courseTitle }}
                        </span>
                      </td>
                      <td class="px-4 py-3.5 text-end">
                        <span
                          class="block font-semibold tabular-nums"
                          :class="
                            attempt.passed === true
                              ? 'text-success-700 dark:text-success-400'
                              : attempt.passed === false
                                ? 'text-error-700 dark:text-error-400'
                                : 'text-gray-500 dark:text-gray-400'
                          "
                        >
                          <template v-if="attempt.percentage !== null">
                            {{ attempt.percentage }}%
                            <span class="ms-1 text-xs font-normal">
                              {{ attempt.passed ? 'pass' : 'fail' }}
                            </span>
                          </template>
                          <template v-else>—</template>
                        </span>
                      </td>
                      <td class="px-4 py-3.5">
                        <span
                          class="inline-flex items-center gap-1.5 text-xs"
                          :class="
                            endedLabel(attempt.endedVia).warn
                              ? 'text-warning-700 dark:text-warning-400'
                              : 'text-gray-500 dark:text-gray-400'
                          "
                        >
                          <TriangleAlert
                            v-if="endedLabel(attempt.endedVia).warn"
                            class="size-3.5"
                            aria-hidden="true"
                          />
                          {{ endedLabel(attempt.endedVia).text }}
                        </span>
                      </td>
                      <td
                        class="px-6 py-3.5 text-end text-xs whitespace-nowrap text-gray-500 tabular-nums dark:text-gray-400"
                      >
                        {{ formatDateTime(attempt.submittedAt) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else class="px-6 pb-6">
              <EmptyState
                title="No attempts yet"
                description="Once a student sits one of your quizzes, the attempt and its score appear here."
                :icon="ListChecks"
              />
            </div>
          </div>

          <!-- Recently published material. The question an instructor actually asks
               is "what have I put up lately". -->
          <div v-if="dashboard.recentMaterials.length > 0" class="mt-6 surface-card">
            <h2 class="section-heading">Recently added materials</h2>

            <ul role="list" class="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
              <li
                v-for="material in dashboard.recentMaterials"
                :key="material.materialTitle + material.createdAt"
              >
                <div class="flex items-start gap-3 py-3.5">
                  <span class="icon-chip">
                    <FileText class="size-4" aria-hidden="true" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-gray-900 dark:text-white/90"
                    >
                      {{ material.materialTitle }}
                    </span>
                    <span class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {{ materialTypeLabel(material.materialType) }} · {{ material.courseTitle }} ·
                      {{ formatDateTime(material.createdAt) }}
                    </span>
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <!-- Who arrived lately. The shape of the week, without opening a report. -->
          <div class="surface-card">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 class="section-heading">Recent enrollments</h2>
              <router-link
                to="/instructor/students"
                class="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Students
                <ArrowRight class="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </router-link>
            </div>

            <ul
              v-if="dashboard.recentEnrolments.length > 0"
              role="list"
              class="mt-4 divide-y divide-gray-200 dark:divide-gray-800"
            >
              <li
                v-for="entry in dashboard.recentEnrolments"
                :key="entry.enrolledAt + entry.courseTitle"
              >
                <div class="flex items-start gap-3 py-3.5">
                  <!--
                    The shared avatar rather than a fourth copy of the initials
                    expression. It was `rounded-full` in grey - a pill, on a person -
                    and it recomputed initials inline, so this person could be a
                    different colour here than in the header for the same account.
                  -->
                  <UserAvatar :name="entry.studentName ?? ''" size="sm" />
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-gray-900 dark:text-white/90"
                    >
                      {{ entry.studentName ?? 'Unknown student' }}
                    </span>
                    <span class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {{ entry.courseTitle }}
                    </span>
                    <span
                      class="mt-1 inline-flex items-center gap-1.5 text-xs"
                      :class="
                        entry.status === 'active'
                          ? 'text-success-700 dark:text-success-400'
                          : entry.status === 'pending'
                            ? 'text-warning-700 dark:text-warning-400'
                            : 'text-gray-500 dark:text-gray-400'
                      "
                    >
                      <!-- A pending enrolment is a payment in flight. Saying so is
                           more useful than the word "pending". -->
                      <template v-if="entry.status === 'active'">Active</template>
                      <template v-else-if="entry.status === 'pending'">Awaiting payment</template>
                      <template v-else-if="entry.status === 'completed'">Completed</template>
                      <template v-else>{{ entry.status }}</template>
                    </span>
                  </span>
                </div>
              </li>
            </ul>

            <EmptyState
              v-else
              class="mt-4"
              title="No enrollments yet"
              description="When a student joins one of your courses, they appear here."
              :icon="GraduationCap"
            />
          </div>

          <div class="mt-6">
            <TrendChart metric="instructor_activity" />
          </div>

          <!-- Content counts. Only shown when there is something to count. -->
          <div v-if="hasCourses && (dashboard.materials ?? 0) > 0" class="mt-6 surface-card">
            <h2 class="section-heading">Your content</h2>

            <dl class="mt-4 space-y-3">
              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <BookOpen class="size-4 text-gray-400" aria-hidden="true" />
                  Materials
                </dt>
                <dd class="text-sm font-semibold text-gray-900 tabular-nums dark:text-white/90">
                  {{ figure(dashboard.materials) }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <CircleCheck class="size-4 text-gray-400" aria-hidden="true" />
                  Published courses
                </dt>
                <dd class="text-sm font-semibold text-gray-900 tabular-nums dark:text-white/90">
                  {{ figure(dashboard.publishedCourses) }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- The call to action only exists for an instructor with nothing yet. Once
               they have a course it would be nagging. -->
          <div
            v-if="!hasCourses"
            class="mt-6 rounded-lg border border-dashed border-gray-300 p-6 dark:border-gray-700"
          >
            <EmptyState
              title="No courses yet"
              description="Create a course, add modules and lessons, then publish it. Quizzes and materials hang off that structure."
              :icon="Library"
            >
              <router-link
                to="/instructor/courses/create"
                class="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Create your first course
              </router-link>
            </EmptyState>
          </div>

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

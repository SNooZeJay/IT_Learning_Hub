<template>
  <div>
    <PageHeader
      title="Course insights"
      subtitle="Enrolments, completions and quiz performance across your courses."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Insights' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your insights" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="stats.courses.length === 0"
      title="Nothing to measure yet"
      description="Create a course first. Enrolment and completion figures appear once a course exists, and quiz scores once students sit one."
      :icon="ChartColumn"
    />

    <template v-else>
      <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Courses"
          :value="String(stats.totals.courses)"
          :icon="Library"
          hint="Assigned to you"
        />
        <StatCard
          label="Students"
          :value="String(stats.totals.distinctStudents)"
          :icon="Users"
          hint="Distinct, with a live place"
        />
        <StatCard
          label="Completion rate"
          :value="`${stats.totals.completionRate}%`"
          :icon="CircleCheckBig"
          :hint="
            stats.totals.enrolments === 0
              ? 'No enrolments yet'
              : `${stats.totals.completions} of ${stats.totals.enrolments} finished`
          "
        />
        <StatCard
          label="Average quiz score"
          :value="
            stats.totals.averageQuizScore === null ? '—' : `${stats.totals.averageQuizScore}%`
          "
          :icon="ChartColumn"
          :hint="
            stats.totals.attempts === 0
              ? 'No submitted attempts yet'
              : `Across ${stats.totals.attempts} attempt${stats.totals.attempts === 1 ? '' : 's'}`
          "
        />
      </dl>

      <!-- Enrolments per course. Bar rather than pie: the question is "which
           course is biggest", and a pie makes that harder to read than its own
           legend suggests. -->
      <div
        class="mt-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <h2 class="text-title-sm text-gray-900 dark:text-white/90">Enrolments per course</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Live places, excluding dropped enrolments.
        </p>

        <!-- isMounted, per AGENTS.md: ApexCharts reads the DOM on init. -->
        <div v-if="isMounted && hasEnrolments" class="mt-6">
          <VueApexCharts
            type="bar"
            height="280"
            :options="enrolmentOptions"
            :series="enrolmentSeries"
          />
        </div>
        <p
          v-else-if="isMounted"
          class="mt-6 rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          No enrolments across your courses yet.
        </p>
      </div>

      <!-- Completion rate and average quiz score, side by side. -->
      <div
        class="mt-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <h2 class="text-title-sm text-gray-900 dark:text-white/90">Completion and quiz scores</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          A course with no quiz attempts has no score to plot, and is left out of the series rather
          than shown as a zero.
        </p>

        <div v-if="isMounted && hasScores" class="mt-6">
          <VueApexCharts type="bar" height="280" :options="scoreOptions" :series="scoreSeries" />
        </div>
        <p
          v-else-if="isMounted"
          class="mt-6 rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          No submitted quiz attempts yet. Scores appear once a student finishes a quiz.
        </p>
      </div>

      <!-- The figures themselves. The charts answer "which course"; this answers
           "by how much", which a bar height alone does not. -->
      <div
        class="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <table class="w-full min-w-3xl text-start">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-800">
              <th
                v-for="heading in HEADINGS"
                :key="heading"
                scope="col"
                class="px-6 py-3 text-start text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                {{ heading }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr
              v-for="course in stats.courses"
              :key="course.courseId"
              class="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            >
              <td class="px-6 py-4">
                <router-link
                  :to="`/instructor/courses/${course.courseId}`"
                  class="text-sm font-medium text-gray-900 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                >
                  {{ course.courseTitle }}
                </router-link>
                <p class="mt-0.5 text-xs text-gray-500 capitalize dark:text-gray-400">
                  {{ course.status }}
                </p>
              </td>
              <td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                {{ course.enrolments }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                {{ course.completions }}
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div
                    class="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]"
                    role="img"
                    :aria-label="`${course.courseTitle} is ${course.completionRate}% complete`"
                  >
                    <div
                      class="h-full rounded-full bg-brand-500"
                      :style="{
                        width: `${Math.max(course.completionRate, course.completions > 0 ? 2 : 0)}%`,
                      }"
                    />
                  </div>
                  <span
                    class="w-10 shrink-0 text-end text-sm font-medium text-gray-900 dark:text-white/90"
                  >
                    {{ course.completionRate }}%
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                <!-- Null means no attempts. "0%" would claim a student scored
                     nothing, which is a different statement. -->
                <span v-if="course.averageQuizScore === null" class="text-gray-400">—</span>
                <span v-else>{{ course.averageQuizScore }}%</span>
                <p v-if="course.attempts > 0" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ course.attempts }} attempt{{ course.attempts === 1 ? '' : 's' }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
        Only courses assigned to you are included. Attempt averages use submitted attempts only; an
        attempt in progress has no score yet and would otherwise count as a zero.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import type { ApexOptions } from 'apexcharts'
import type { ApexFormatterOpts } from 'apexcharts'
import { ChartColumn, CircleCheckBig, Library, Users } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { getInstructorInsights } from '@/services/instructor.service'
import type { InstructorInsights } from '@/services/instructor.service'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

/**
 * Starts as a zeroed figure rather than null.
 *
 * A null here would mean every binding in the template needs a guard, and a
 * guard on a headline number is easy to leave out - which is how a page ends up
 * rendering "0 courses" before its first load finishes. The zeroed default is
 * never rendered on its own: the loading and error states sit above it in the
 * `v-if` chain, and an instructor with no courses gets the empty state below.
 */
const EMPTY_INSIGHTS: InstructorInsights = {
  courses: [],
  totals: {
    courses: 0,
    distinctStudents: 0,
    enrolments: 0,
    completions: 0,
    completionRate: 0,
    attempts: 0,
    averageQuizScore: null,
  },
}

const stats = ref<InstructorInsights>(EMPTY_INSIGHTS)
const isLoading = ref(true)
const errorMessage = ref('')

/**
 * ApexCharts reads the DOM as it initialises, so it is only mounted after the
 * component is. Per AGENTS.md: guard with `v-if="isMounted"` set in onMounted.
 */
const isMounted = ref(false)

const HEADINGS = ['Course', 'Enrolments', 'Completed', 'Completion rate', 'Avg quiz score']

const FONT_FAMILY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

const courses = computed(() => stats.value.courses)

const hasEnrolments = computed(() => courses.value.some((course) => course.enrolments > 0))

const hasScores = computed(() => courses.value.some((course) => course.averageQuizScore !== null))

/** Long titles are truncated rather than rotated; the table below has the full name. */
function axisLabel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}…` : value
}

const enrolmentSeries = computed(() => [
  {
    name: 'Enrolments',
    data: courses.value.map((course) => course.enrolments),
  },
])

const enrolmentOptions = computed<ApexOptions>(() => ({
  chart: { fontFamily: FONT_FAMILY, type: 'bar', toolbar: { show: false } },
  colors: ['#5645d4'],
  plotOptions: {
    bar: { horizontal: false, columnWidth: '45%', borderRadius: 0, borderRadiusApplication: 'end' },
  },
  dataLabels: { enabled: false },
  stroke: { show: true, width: 4, colors: ['transparent'] },
  xaxis: {
    categories: courses.value.map((course) => axisLabel(course.courseTitle)),
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  legend: { show: false },
  yaxis: { labels: { show: true } },
  grid: { yaxis: { lines: { show: true } } },
  fill: { opacity: 1 },
  tooltip: {
    y: {
      // The truncated axis label is a display choice; the tooltip shows the
      // real course name, because a name you cannot read is not a name. `opts`
      // is optional in Apex's own type, hence the guard rather than a
      // non-null assertion.
      formatter: (_val: number, opts?: ApexFormatterOpts) => {
        const course = opts ? courses.value[opts.dataPointIndex] : undefined
        return course?.courseTitle ?? ''
      },
    },
  },
}))

const scoreSeries = computed(() => [
  {
    name: 'Completion rate',
    data: courses.value.map((course) => course.completionRate),
  },
  {
    name: 'Average quiz score',
    // Null stays null rather than becoming 0: a course with no attempts has no
    // score, and plotting it at zero would draw it as failing every student.
    data: courses.value.map((course) => course.averageQuizScore),
  },
])

const scoreOptions = computed<ApexOptions>(() => ({
  chart: { fontFamily: FONT_FAMILY, type: 'bar', toolbar: { show: false } },
  colors: ['#5645d4', '#1aae39'],
  plotOptions: {
    bar: { horizontal: false, columnWidth: '38%', borderRadius: 0, borderRadiusApplication: 'end' },
  },
  dataLabels: { enabled: false },
  stroke: { show: true, width: 4, colors: ['transparent'] },
  xaxis: {
    categories: courses.value.map((course) => axisLabel(course.courseTitle)),
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  legend: {
    show: true,
    position: 'top',
    horizontalAlign: 'left',
    fontFamily: FONT_FAMILY,
    markers: { size: 6 },
  },
  yaxis: {
    // Both series are percentages, so one shared 0-100 axis. Anything else would
    // let two different scales sit on one plot and read as comparable.
    max: 100,
    labels: {
      show: true,
      formatter: (value: number) => `${Math.round(value)}%`,
    },
  },
  grid: { yaxis: { lines: { show: true } } },
  fill: { opacity: 1 },
  tooltip: {
    y: { formatter: (value: number | null) => (value === null ? 'No attempts' : `${value}%`) },
  },
}))

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  // Reset on entry, not only on success. A retry that fails would otherwise
  // leave the previous load's figures on screen under an error message, which
  // reads as "these are the numbers, and something else is wrong".
  stats.value = EMPTY_INSIGHTS
  try {
    // Scoped to the signed-in instructor, so the profile has to resolve first.
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so your insights cannot be read.'
      return
    }
    stats.value = await getInstructorInsights(auth.profile.id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load your insights.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  // Set before the fetch so a fast response still finds a mounted chart, and
  // set unconditionally: a failure must not leave the page thinking ApexCharts
  // is unavailable.
  isMounted.value = true
  await load()
})
</script>

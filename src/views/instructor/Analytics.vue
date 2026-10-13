<template>
  <div>
    <PageHeader
      title="Course insights"
      subtitle="Enrollments, completions and quiz performance across your courses."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Insights' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your insights" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="stats.courses.length === 0"
      title="Nothing to measure yet"
      description="Create a course first. Enrollment and completion figures appear once a course exists, and quiz scores once students sit one."
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
              ? 'No enrollments yet'
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
      <div class="mt-6 surface-card">
        <h2 class="section-heading">Enrollments per course</h2>
        <p class="mt-1 section-subheading">Live places, excluding dropped enrollments.</p>

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
          No enrollments across your courses yet.
        </p>
      </div>

      <!-- Completion rate and average quiz score, side by side. -->
      <div class="mt-6 surface-card">
        <h2 class="section-heading">Completion and quiz scores</h2>
        <p class="mt-1 section-subheading">
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
      <div class="mt-6 overflow-x-auto surface-card-shell">
        <Table class="w-full min-w-3xl text-start">
          <TableCaption class="sr-only">
            Per-course enrollments, completions and average quiz scores
          </TableCaption>
          <TableHeader>
            <TableRow class="border-b border-gray-200 dark:border-gray-800 hover:bg-transparent">
              <TableHead
                v-for="heading in HEADINGS"
                :key="heading"
                scope="col"
                class="px-6 py-3 text-start text-xs font-medium tracking-wide text-slate uppercase"
              >
                {{ heading }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody class="divide-y divide-gray-200 dark:divide-gray-800">
            <TableRow
              v-for="course in stats.courses"
              :key="course.courseId"
              class="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            >
              <TableCell class="px-6 py-4">
                <router-link
                  :to="`/instructor/courses/${course.courseId}`"
                  class="inline-block py-1 text-sm font-medium text-gray-900 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                >
                  {{ course.courseTitle }}
                </router-link>
                <p class="mt-0.5 text-xs text-slate">
                  {{ courseStatusLabel(course.status) }}
                </p>
              </TableCell>
              <TableCell class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                {{ course.enrolments }}
              </TableCell>
              <TableCell class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                {{ course.completions }}
              </TableCell>
              <TableCell class="px-6 py-4">
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
              </TableCell>
              <TableCell class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                <!-- Null means no attempts. "0%" would claim a student scored
                     nothing, which is a different statement. -->
                <!--
                  `text-slate`, not `text-gray-400`.

                  `gray-400` is #a4a097 and measures 2.61:1 on the card - this is the
                  cell saying "no attempts recorded", which is information somebody is
                  reading, not decoration. `slate` is 7.2:1 on white and carries its own
                  dark value, so the explicit dark pair is not needed.
                -->
                <span v-if="course.averageQuizScore === null" class="text-slate">—</span>
                <span v-else>{{ course.averageQuizScore }}%</span>
                <p v-if="course.attempts > 0" class="text-xs text-slate">
                  {{ course.attempts }} attempt{{ course.attempts === 1 ? '' : 's' }}
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!--
        `slate`, not `gray-500`.

        The TailAdmin-era greys measure 4.17:1 on this surface at 12px, which is the exact
        number `controlClasses.ts` already records as the reason those greys were
        abandoned everywhere else. This paragraph is the last place still on them.
        `slate` is 6.8:1 and flips with the theme on its own, so no `dark:` pair is
        needed.
      -->
      <p class="mt-4 text-xs text-slate">
        Only courses assigned to you are included. Attempt averages use submitted attempts only; an
        attempt in progress has no score yet and would otherwise count as a zero.
      </p>

      <!--
        Recent student results: who sat what, and how it went.

        The charts above answer "which course" and the per-course table answers
        "by how much". Neither answers "who" - and "who is falling behind" is
        the question an instructor opens this page to ask. Ten newest outcomes
        across your courses: submitted quiz attempts and graded assignments,
        each with the student, the course, the score and the date. Nothing here
        is computed or estimated; every row is a row somewhere, read straight.
      -->
      <div class="mt-6 surface-card-shell">
        <h2 class="section-heading">Recent student results</h2>
        <p class="mt-1 section-subheading">
          Submitted quizzes and graded assignments across your courses, newest first.
        </p>

        <p v-if="resultsError" class="mt-4 text-sm text-error-600 dark:text-error-400">
          {{ resultsError }}
        </p>

        <p v-else-if="results.length === 0" class="mt-4 section-subheading">
          No results yet. Rows appear here the moment a student submits a quiz or you grade an
          assignment.
        </p>

        <div v-else class="mt-4 overflow-x-auto custom-scrollbar">
          <Table class="min-w-full text-start text-sm">
            <TableCaption class="sr-only">
              Recent quiz and assignment results across your courses
            </TableCaption>
            <TableHeader>
              <TableRow class="border-b border-gray-200 hover:bg-transparent dark:border-gray-800">
                <TableHead scope="col" class="px-5 py-3 font-medium">Student</TableHead>
                <TableHead scope="col" class="px-5 py-3 font-medium">Item</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium">Score</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium">Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody class="divide-y divide-gray-200 dark:divide-gray-800">
              <TableRow
                v-for="row in results"
                :key="`${row.kind}-${row.id}`"
                class="transition-colors motion-reduce:transition-none hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <TableCell class="px-5 py-4">
                  <p class="font-medium text-ink">{{ row.studentName }}</p>
                  <p class="text-slate">{{ row.courseTitle }}</p>
                </TableCell>
                <TableCell class="px-5 py-4">
                  <p class="text-ink">{{ row.itemTitle }}</p>
                  <p class="text-xs text-slate">
                    {{ row.kind === 'quiz' ? 'Quiz' : 'Assignment' }}
                  </p>
                </TableCell>
                <TableCell class="px-5 py-4 text-end">
                  <Badge
                    :class="
                      row.passed === true
                        ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400'
                        : row.passed === false
                          ? 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400'
                          : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
                    "
                  >
                    {{ row.scoreText }}
                  </Badge>
                </TableCell>
                <TableCell class="px-5 py-4 text-end text-slate">
                  {{ formatDateTime(row.submittedAt) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
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
import { BRAND_500 } from '@/components/common/chartTokens'
import { useTheme } from '@/composables/useTheme'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/public/ui/table'
import { getInstructorInsights, listInstructorRecentResults } from '@/services/instructor.service'
import type { InstructorInsights, InstructorResultRow } from '@/services/instructor.service'
import { Badge } from '@/components/public/ui/badge'
import { courseStatusLabel, formatDateTime } from '@/types'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

/** The RESOLVED theme, so "system" still produces a dark chart on a dark OS. */
const { theme } = useTheme()

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
const results = ref<InstructorResultRow[]>([])
const resultsError = ref('')
const isLoading = ref(true)
const errorMessage = ref('')

/**
 * ApexCharts reads the DOM as it initialises, so it is only mounted after the
 * component is. Per AGENTS.md: guard with `v-if="isMounted"` set in onMounted.
 */
const isMounted = ref(false)

const HEADINGS = ['Course', 'Enrollments', 'Completed', 'Completion rate', 'Avg quiz score']

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
    name: 'Enrollments',
    data: courses.value.map((course) => course.enrolments),
  },
])

const enrolmentOptions = computed<ApexOptions>(() => ({
  chart: {
    fontFamily: FONT_FAMILY,
    type: 'bar',
    toolbar: { show: false },
    key: theme.value,
    width: '100%',
    redrawOnResize: true,
    redrawOnParentResize: true,
  },
  theme: { mode: theme.value },
  colors: [BRAND_500],
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
  chart: {
    fontFamily: FONT_FAMILY,
    type: 'bar',
    toolbar: { show: false },
    key: theme.value,
    width: '100%',
    redrawOnResize: true,
    redrawOnParentResize: true,
  },
  theme: { mode: theme.value },
  colors: [BRAND_500, '#1aae39'],
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
  results.value = []
  resultsError.value = ''
  try {
    // Scoped to the signed-in instructor, so the profile has to resolve first.
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so your insights cannot be read.'
      return
    }
    stats.value = await getInstructorInsights(auth.profile.id)
    // Loaded beside the aggregates, not inside them: a failure here must not
    // take down the charts. But it must not read as "no results" either - an
    // empty card would claim nobody sat anything, which a failed read cannot
    // know. So the failure gets its own sentence under the heading.
    resultsError.value = ''
    try {
      results.value = await listInstructorRecentResults(auth.profile.id)
    } catch (error) {
      results.value = []
      resultsError.value = error instanceof Error ? error.message : 'Could not load recent results.'
    }
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

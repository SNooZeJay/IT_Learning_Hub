<template>
  <div>
    <PageHeader
      title="Platform analytics"
      subtitle="Who is here, what has shipped, what it earned and how far people got."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Analytics' }]"
    />

    <LoadingState v-if="isLoading" label="Loading platform analytics" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load platform analytics"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else-if="analytics">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          :value="String(roleCount('student'))"
          :icon="GraduationCap"
          :hint="`${roleCount('instructor')} instructors, ${roleCount('admin')} admins`"
        />
        <StatCard
          label="Revenue collected"
          :value="formatPeso(analytics.revenue.paidCentavos)"
          :icon="Wallet"
          :hint="`${analytics.revenue.paidCount} settled, ${formatPeso(analytics.revenue.refundedCentavos)} refunded`"
        />
        <StatCard
          label="Enrollments"
          :value="String(analytics.enrollment.total)"
          :icon="BookOpen"
          :hint="`${analytics.enrollment.active} active, ${analytics.enrollment.completed} completed`"
        />
        <StatCard
          label="Completion rate"
          :value="`${analytics.enrollment.completionRate}%`"
          :icon="CircleCheck"
          hint="Completed ÷ (active + completed)"
        />
      </div>

      <!--
        Every panel is paired with the sentence that defines it. A donut of three
        slices invites a reading the numbers do not support on their own, and the
        caption is where that reading gets closed off.
      -->
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="section-heading">People by role</h2>
          <p class="mt-1 text-sm text-slate">
            Every account on the platform, by the role it holds.
          </p>
          <div class="mt-6">
            <EmptyState
      bare
      v-if="!isMounted || analytics.usersByRole.every((slice) => slice.count === 0)"
              title="No accounts yet"
              description="The split by role appears as soon as somebody registers."
              :icon="Users"
            />
            <VueApexCharts
              v-else
              type="donut"
              height="280"
              :options="roleChartOptions"
              :series="roleChartSeries"
            />
          </div>
        </section>

        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="section-heading">Courses by status</h2>
          <p class="mt-1 text-sm text-slate">
            Drafts and archived courses are invisible to students but still counted here.
          </p>
          <div class="mt-6">
            <EmptyState
      bare
      v-if="!isMounted || analytics.coursesByStatus.every((slice) => slice.count === 0)"
              title="No courses yet"
              description="The split by status appears once an instructor has drafted something."
              :icon="Library"
            />
            <VueApexCharts
              v-else
              type="donut"
              height="280"
              :options="courseChartOptions"
              :series="courseChartSeries"
            />
          </div>
        </section>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="section-heading">Money in, by month</h2>
          <p class="mt-1 text-sm text-slate">
            Settled payments only, dated by the moment the money arrived rather than by when the
            checkout began.
          </p>
          <div class="mt-6">
            <EmptyState
      bare
      v-if="!isMounted || !analytics.revenueByMonth.some((month) => month.centavos > 0)"
              title="No money collected in these six months"
              description="Free enrollments never create a payment, so this panel stays empty until a paid course is checked out."
              :icon="Wallet"
            />
            <VueApexCharts
              v-else
              type="bar"
              height="280"
              :options="revenueChartOptions"
              :series="revenueChartSeries"
            />
          </div>
        </section>

        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="section-heading">New enrollments, by month</h2>
          <p class="mt-1 text-sm text-slate">
            Counted on the day the enrollment row was written, whichever status it settled into.
          </p>
          <div class="mt-6">
            <EmptyState
      bare
      v-if="!isMounted || !analytics.enrollmentsByMonth.some((month) => month.count > 0)"
              title="No enrollments in these six months"
              description="This panel fills in as students open courses. It counts every status, including pending and dropped."
              :icon="ChartColumn"
            />
            <VueApexCharts
              v-else
              type="area"
              height="280"
              :options="enrolmentChartOptions"
              :series="enrolmentChartSeries"
            />
          </div>
        </section>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="section-heading">Enrollments by status</h2>
          <p class="mt-1 text-sm text-slate">
            Completed is the only status that means somebody finished. Dropped is somebody who left.
          </p>
          <div class="mt-6">
            <EmptyState
      bare
      v-if="!isMounted || analytics.enrollment.total === 0"
              title="No enrollments yet"
              description="Nothing has enrolled in anything, so there is no split to draw."
              :icon="BookOpen"
            />
            <VueApexCharts
              v-else
              type="bar"
              height="280"
              :options="enrolmentStatusChartOptions"
              :series="enrolmentStatusChartSeries"
            />
          </div>
        </section>

        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="section-heading">Payments by status</h2>
          <p class="mt-1 text-sm text-slate">
            Only settled payments count as revenue. The rest are attempts that never became money.
          </p>
          <div class="mt-6">
            <EmptyState
      bare
      v-if="!isMounted || analytics.paymentsByStatus.every((slice) => slice.count === 0)"
              title="No payments raised"
              description="Payments appear when a paid course is checked out."
              :icon="Wallet"
            />
            <VueApexCharts
              v-else
              type="bar"
              height="280"
              :options="paymentStatusChartOptions"
              :series="paymentStatusChartSeries"
            />
          </div>
        </section>
      </div>

      <section class="mt-6 rounded-lg border border-hairline bg-canvas p-6">
        <h2 class="section-heading">How assessment is going</h2>
        <p class="mt-1 text-sm text-slate">
          Every score is an average of graded attempts, so an unfinished attempt does not drag the
          number down.
        </p>

        <dl class="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          <div
            v-for="stat in [
              { label: 'Quizzes', value: String(analytics.quizzes.quizCount) },
              { label: 'Submitted attempts', value: String(analytics.quizzes.submittedAttempts) },
              { label: 'In progress', value: String(analytics.quizzes.attemptsInProgress) },
              {
                label: 'Average score',
                value:
                  analytics.quizzes.averagePercentage === null
                    ? 'No graded attempts'
                    : `${analytics.quizzes.averagePercentage}%`,
              },
              {
                label: 'Pass rate',
                value:
                  analytics.quizzes.passRate === null
                    ? 'No graded attempts'
                    : `${analytics.quizzes.passRate}%`,
              },
            ]"
            :key="stat.label"
          >
            <dt class="text-xs tracking-wide text-slate uppercase">{{ stat.label }}</dt>
            <dd class="mt-1 text-xl font-semibold text-ink tabular-nums">{{ stat.value }}</dd>
          </div>
        </dl>

        <p v-if="analytics.quizzes.averagePercentage === null" class="mt-5 text-sm text-slate">
          No quiz has been submitted yet. The average and pass rate stay blank rather than showing a
          zero, because zero would read as “everyone scored nothing”.
        </p>
      </section>

      <!--
        The series are capped at six months by design, and this says so where the
        number is rather than leaving a reader to assume the window is unbounded.
      -->
      <p class="mt-6 text-sm text-slate">
        The two monthly panels show the last six calendar months. Older activity still counts in
        every total above — only the shape over time is shortened.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import type { ApexOptions } from 'apexcharts'
import {
  BookOpen,
  ChartColumn,
  CircleCheck,
  GraduationCap,
  Library,
  Users,
  Wallet,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import { BRAND_500, CATEGORICAL_PALETTE } from '@/components/common/chartTokens'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTheme } from '@/composables/useTheme'
import { getPlatformAnalytics } from '@/services/admin.service'
import { formatPeso } from '@/types'
import type { PlatformAnalytics } from '@/services/admin.service'

const analytics = ref<PlatformAnalytics | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

/**
 * The resolved theme, for the six charts on this screen.
 *
 * Apex draws its axis labels, gridlines, legend and tooltip from `theme.mode` at render
 * time, and none of these six option objects set it - so they kept light-mode colours
 * under a dark page. Measured in dark mode before this was bound: every axis month,
 * every legend entry and the donut centre totals at 1.15:1, black text on a near-black
 * surface. For an administrator using dark mode the screen was unreadable, and it looked
 * correct in light, which is how it survived.
 *
 * `TrendChart.vue` already binds this and records why it reads the *resolved* theme
 * rather than the stored preference: somebody who chose "system" must still get a dark
 * chart when the operating system is dark.
 */
const { theme } = useTheme()

/**
 * ApexCharts touches `window` while it measures its container, so it is only
 * mounted in the browser. Set only after the data arrives, so the chart is not
 * drawn once empty and then redrawn - which reads as a flicker on a slow load.
 */
const isMounted = ref(false)

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

/** Brand, success, warning, error, then the neutral steps for the long tails. */
const PALETTE = CATEGORICAL_PALETTE

const analyticsData = computed(() => analytics.value)

function roleCount(role: string): number {
  return analyticsData.value?.usersByRole.find((slice) => slice.key === role)?.count ?? 0
}

const roleChartSeries = computed(() =>
  (analyticsData.value?.usersByRole ?? []).map((slice) => slice.count),
)

const roleChartOptions = computed<ApexOptions>(() => ({
  labels: (analyticsData.value?.usersByRole ?? []).map((slice) => slice.label),
  colors: PALETTE,
  theme: { mode: theme.value },
  chart: {
    fontFamily: FONT,
    // Re-render on a theme change rather than leaving the previous palette on screen.
    key: theme.value,
    redrawOnParentResize: true,
    width: '100%',
    redrawOnResize: true,
    type: 'donut',
  },
  stroke: { width: 0 },
  legend: { position: 'bottom', fontFamily: FONT, markers: { size: 6 } },
  dataLabels: { enabled: false },
  plotOptions: {
    pie: {
      donut: {
        // Square-ish inner radius, matching the flat Carbon treatment used by the
        // bar charts. A 3D or heavily shadowed pie would read as decoration.
        size: '68%',
        labels: {
          show: true,
          name: { fontFamily: FONT, fontSize: '14px' },
          value: {
            fontFamily: FONT,
            fontSize: '20px',
            fontWeight: 600,
            formatter: (value: string) => String(Math.round(Number(value))),
          },
          total: {
            show: true,
            label: 'Accounts',
            fontFamily: FONT,
            // 12px, the documented caption step. This was 13px, which sits between two
            // steps on the ramp and therefore matches neither - the value above it is
            // 20px at 600 and the name label is 14px, so a third size belonging to
            // nothing is what made the centre of these two donuts read as unstyled.
            fontSize: '12px',
            formatter: (w: { globals: { seriesTotals: number[] } }) =>
              String(w.globals.seriesTotals.reduce((sum, total) => sum + total, 0)),
          },
        },
      },
    },
  },
  tooltip: { y: { formatter: (value: number) => `${value} accounts` } },
}))

const courseChartSeries = computed(() =>
  (analyticsData.value?.coursesByStatus ?? []).map((slice) => slice.count),
)

const courseChartOptions = computed<ApexOptions>(() => ({
  labels: (analyticsData.value?.coursesByStatus ?? []).map((slice) => slice.label),
  colors: PALETTE,
  theme: { mode: theme.value },
  chart: {
    fontFamily: FONT,
    // Re-render on a theme change rather than leaving the previous palette on screen.
    key: theme.value,
    redrawOnParentResize: true,
    width: '100%',
    redrawOnResize: true,
    type: 'donut',
  },
  stroke: { width: 0 },
  legend: { position: 'bottom', fontFamily: FONT, markers: { size: 6 } },
  dataLabels: { enabled: false },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { fontFamily: FONT, fontSize: '14px' },
          value: {
            fontFamily: FONT,
            fontSize: '20px',
            fontWeight: 600,
            formatter: (value: string) => String(Math.round(Number(value))),
          },
          total: {
            show: true,
            label: 'Courses',
            fontFamily: FONT,
            // 12px, the documented caption step - see the note on the accounts chart.
            fontSize: '12px',
            formatter: (w: { globals: { seriesTotals: number[] } }) =>
              String(w.globals.seriesTotals.reduce((sum, total) => sum + total, 0)),
          },
        },
      },
    },
  },
  tooltip: { y: { formatter: (value: number) => `${value} courses` } },
}))

const revenueChartSeries = computed(() => [
  {
    name: 'Collected',
    // ApexCharts formats a plain number well, so the series carries pesos rather
    // than centavos and the tooltip converts back. Keeping centavos in the series
    // would print a number no reader recognises.
    data: (analyticsData.value?.revenueByMonth ?? []).map((month) => month.centavos / 100),
  },
])

const revenueChartOptions = computed<ApexOptions>(() => ({
  colors: [BRAND_500],
  theme: { mode: theme.value },
  chart: {
    fontFamily: FONT,
    key: theme.value,
    redrawOnParentResize: true,
    width: '100%',
    redrawOnResize: true,
    type: 'bar',
    toolbar: { show: false },
  },
  plotOptions: { bar: { horizontal: false, columnWidth: '45%', borderRadius: 0 } },
  dataLabels: { enabled: false },
  stroke: { show: true, width: 3, colors: ['transparent'] },
  xaxis: {
    categories: (analyticsData.value?.revenueByMonth ?? []).map((month) => month.label),
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: { labels: { formatter: (value: number) => formatPeso(Math.round(value * 100)) } },
  grid: { yaxis: { lines: { show: true } } },
  fill: { opacity: 1 },
  tooltip: {
    y: { formatter: (value: number) => formatPeso(Math.round(value * 100)) },
  },
}))

const enrolmentChartSeries = computed(() => [
  {
    name: 'New enrollments',
    data: (analyticsData.value?.enrollmentsByMonth ?? []).map((m) => m.count),
  },
])

const enrolmentChartOptions = computed<ApexOptions>(() => ({
  colors: [BRAND_500],
  theme: { mode: theme.value },
  chart: {
    fontFamily: FONT,
    key: theme.value,
    redrawOnParentResize: true,
    width: '100%',
    redrawOnResize: true,
    type: 'area',
    toolbar: { show: false },
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'straight', width: 3 },
  fill: { type: 'solid', opacity: 0.12 },
  markers: { size: 0 },
  xaxis: {
    categories: (analyticsData.value?.enrollmentsByMonth ?? []).map((month) => month.label),
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: { labels: { formatter: (value: number) => String(Math.round(value)) } },
  grid: { yaxis: { lines: { show: true } } },
  tooltip: { y: { formatter: (value: number) => `${value} enrollments` } },
}))

const enrolmentStatusChartSeries = computed(() => [
  {
    name: 'Enrollments',
    data: (analyticsData.value?.enrollmentsByStatus ?? []).map((slice) => slice.count),
  },
])

const enrolmentStatusChartOptions = computed<ApexOptions>(() => ({
  colors: [BRAND_500],
  theme: { mode: theme.value },
  chart: {
    fontFamily: FONT,
    key: theme.value,
    redrawOnParentResize: true,
    width: '100%',
    redrawOnResize: true,
    type: 'bar',
    toolbar: { show: false },
  },
  plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 0 } },
  dataLabels: { enabled: false },
  xaxis: {
    categories: (analyticsData.value?.enrollmentsByStatus ?? []).map((slice) => slice.label),
    labels: { formatter: (value: number) => String(Math.round(value)) },
  },
  yaxis: { labels: { maxWidth: 110 } },
  grid: { xaxis: { lines: { show: true } } },
  tooltip: { y: { formatter: (value: number) => `${value} enrollments` } },
}))

const paymentStatusChartSeries = computed(() => [
  {
    name: 'Payments',
    data: (analyticsData.value?.paymentsByStatus ?? []).map((slice) => slice.count),
  },
])

const paymentStatusChartOptions = computed<ApexOptions>(() => ({
  colors: [BRAND_500],
  theme: { mode: theme.value },
  chart: {
    fontFamily: FONT,
    key: theme.value,
    redrawOnParentResize: true,
    width: '100%',
    redrawOnResize: true,
    type: 'bar',
    toolbar: { show: false },
  },
  plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 0 } },
  dataLabels: { enabled: false },
  xaxis: {
    categories: (analyticsData.value?.paymentsByStatus ?? []).map((slice) => slice.label),
    labels: { formatter: (value: number) => String(Math.round(value)) },
  },
  yaxis: { labels: { maxWidth: 110 } },
  grid: { xaxis: { lines: { show: true } } },
  tooltip: { y: { formatter: (value: number) => `${value} payments` } },
}))

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    analytics.value = await getPlatformAnalytics()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load platform analytics.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await load()
  isMounted.value = true
})
</script>

<template>
  <div class="surface-card">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="section-heading">{{ copy.title }}</h2>
    </div>
    <p class="mt-1 section-subheading">{{ copy.subtitle }}</p>

    <div class="mt-6">
      <EmptyState
        v-if="state === 'empty'"
        :title="copy.emptyTitle"
        :description="copy.emptyDescription"
        :icon="ChartColumn"
      />
      <ErrorState
        v-else-if="state === 'error'"
        title="The trend could not be read"
        :message="message ?? 'This series could not be loaded. Try again in a moment.'"
        @retry="load"
      />
      <VueApexCharts
        v-else-if="isMounted"
        type="area"
        height="280"
        :options="options"
        :series="series"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChartColumn } from 'lucide-vue-next'
import type { ApexOptions } from 'apexcharts'
import VueApexCharts from 'vue3-apexcharts'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { useTheme } from '@/composables/useTheme'
import { loadTrend, TREND_COPY, type TrendMetric, type TrendPoint } from '@/services/trend.service'

/**
 * The monthly trend, identical in behaviour across all three dashboards.
 *
 * One component rather than three charts written per view: the whole point of the exercise
 * was that the design system is shared and only the content differs, and the metric and
 * its copy are passed in as data. Anything that has to look different per role belongs in
 * `trend.service.ts`, not in a forked copy of this file.
 *
 * Apex is browser-only, so rendering is gated on `isMounted` — the same guard every other
 * chart in the app uses.
 */
const props = defineProps<{ metric: TrendMetric }>()

/**
 * Apex draws its axis labels, gridlines and tooltip from one theme setting at render
 * time. Without `theme.mode` bound to the resolved theme, the plot keeps light-mode
 * colours under a dark page - which is how the analytics charts behave today. Reading
 * the provider's *resolved* theme rather than the stored preference is the point: a
 * visitor who chose "system" must still get a dark chart when the OS is dark.
 */
const { theme } = useTheme()

const points = ref<TrendPoint[]>([])
const message = ref<string | null>(null)
const isMounted = ref(false)
const isLoading = ref(true)

const copy = computed(() => TREND_COPY[props.metric])

/** Six buckets of zeroes is not a trend; a series with nothing in it shows the empty state. */
const hasValues = computed(() => points.value.some((point) => point.value > 0))

const state = computed<'loading' | 'empty' | 'error' | 'ready'>(() => {
  if (isLoading.value) return 'loading'
  if (message.value) return 'error'
  if (!hasValues.value) return 'empty'
  return 'ready'
})

async function load(): Promise<void> {
  isLoading.value = true
  message.value = null
  try {
    points.value = await loadTrend(props.metric)
  } catch (error) {
    points.value = []
    message.value = error instanceof Error ? error.message : null
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  isMounted.value = true
  void load()
})

// A role change reuses this component instance (same slot in each dashboard view), so the
// series has to be re-read rather than left showing the previous role's data.
watch(
  () => props.metric,
  () => void load(),
)

const series = computed(() => [
  {
    name: copy.value.title,
    data: points.value.map((point) => point.value),
  },
])

const options = computed<ApexOptions>(() => ({
  colors: ['#5645d4'],
  theme: { mode: theme.value },
  chart: {
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    type: 'area',
    toolbar: { show: false },
    // Keyed on the resolved theme so a toggle re-renders rather than leaving the
    // previous palette on screen.
    key: theme.value,
    // Redraw rather than resize-only, so a parent grid that has already changed width
    // does not leave the plot squeezed into the old box.
    redrawOnParentResize: true,
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'straight', width: 3 },
  fill: { type: 'solid', opacity: 0.12 },
  markers: { size: 0 },
  xaxis: {
    categories: points.value.map((point) => point.label),
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { rotate: 0, hideOverlappingLabels: false },
  },
  yaxis: {
    labels: {
      formatter: (value: number) => String(Math.round(value)),
      // Force the axis to include zero, or a series of 2,3,1 renders as a cliff that
      // looks like a collapse.
      min: 0,
    },
  },
  grid: { yaxis: { lines: { show: true } } },
  tooltip: {
    y: {
      formatter: (value: number) => `${value} ${copy.value.unit}${value === 1 ? '' : 's'}`,
    },
  },
}))
</script>

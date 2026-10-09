<template>
  <div class="surface-card">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="section-heading">{{ copy.title }}</h2>
    </div>
    <p class="mt-1 section-subheading">{{ copy.subtitle }}</p>

    <div class="mt-6 min-w-0">
      <!--
        The loading branch.

        `state` computes `'loading'` and the template never branched on it, so the
        `v-else-if="isMounted"` fell through to the chart on the first paint with an
        empty series: a 280px plot area with no line in it, which then snapped to data
        a moment later. Every other panel on these dashboards shows a skeleton for the
        same reason, so this is the one place a student watched a chart build itself.
      -->
      <LoadingState
        v-if="state === 'loading'"
        label="Loading the trend"
        class="border-0 bg-transparent dark:bg-transparent"
      />
      <EmptyState
        v-else-if="state === 'empty'"
        :title="copy.emptyTitle"
        :description="copy.emptyDescription"
        :icon="ChartColumn"
        bare
      />
      <ErrorState
        v-else-if="state === 'error'"
        title="The trend could not be read"
        :message="message ?? 'This series could not be loaded. Try again in a moment.'"
        bare
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
import LoadingState from '@/components/common/LoadingState.vue'
import { useTheme } from '@/composables/useTheme'
import { loadTrend, TREND_COPY, type TrendMetric, type TrendPoint } from '@/services/trend.service'
import { BRAND_500 } from '@/components/common/chartTokens'

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
  /*
    Brand green, not TailAdmin purple.

    `#5645d4` was TailAdmin's primary. The brand ramp in `main.css` is green
    (`--color-brand-500: #1f6b46`), which is what every button, link and focus ring in
    the app draws with, so a purple series was the only purple object on all three
    dashboards. The value is `brand-500` resolved - Apex needs a literal colour, and
    this is the same hex the token emits.
  */
  colors: [BRAND_500],
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
    // `100%` rather than letting Apex pick a pixel width.
    //
    // Left to itself Apex measures its box once and writes that measurement onto the
    // canvas as `width: <n>px`. The measurement happens on the first frame after mount,
    // which is not always the frame the layout settles on - and a phone that renders the
    // dashboard before its own width is applied got a canvas wider than the screen.
    //
    // Worse, the lock is self-reinforcing. A grid item's automatic minimum size is its
    // content's, so a 529px canvas inside a 358px track *stretches the track to 529*,
    // which is the width Apex then keeps. Neither `redrawOnParentResize` nor a viewport
    // change could undo it, because the parent had already been widened by the canvas.
    // `100%` makes the canvas track its container instead of defining it.
    width: '100%',
    // The window listener that turns the percentage above back into pixels whenever the
    // viewport genuinely changes - a rotation, a resize, a devtools device toggle.
    redrawOnResize: true,
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

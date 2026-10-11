<template>
  <!--
    `bare` drops the card chrome for a skeleton rendered INSIDE another card.

    Same reason as `EmptyState` and `ErrorState`: this is a card that owns a region
    most of the time, and a card-inside-a-card when it stands in for a chart's contents
    or a table's rows. `bare` keeps the skeleton and drops the surface.
  -->
  <div
    class="surface-card"
    :class="bare ? 'border-0 bg-transparent p-0 dark:bg-transparent' : ''"
    role="status"
    aria-live="polite"
  >
    <!--
      The shadcn Skeleton, three of them, in the shape this component always had:
      a short label-width bar and a figure-width bar, so the page does not jump
      when real numbers replace it.

      What left with the old markup: the spinning LoaderCircle and the two
      hand-drawn `animate-pulse` divs in Tailwind greys. A spinner next to a
      skeleton says the same thing twice, and `bg-gray-200` was one of the last
      unprefixed greys on the app surfaces. The Skeleton carries the pulse
      itself, in the accent tint, and `motion-reduce` is honoured by the
      primitive rather than by a per-call-site suffix.
    -->
    <div class="flex flex-col gap-3">
      <Skeleton class="h-3 w-40" />
      <Skeleton class="h-8 w-24" />
      <Skeleton class="h-3 w-56" />
    </div>
    <span class="sr-only">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/public/ui/skeleton'

/**
 * Skeleton placeholder shown while a panel loads.
 *
 * Mirrors StatCard's shape so the page does not jump when real numbers replace
 * it. Announced politely rather than assertively: a loading state is not an
 * error and should not interrupt a screen reader mid-sentence.
 */
withDefaults(defineProps<{ label?: string; bare?: boolean }>(), { label: 'Loading', bare: false })
</script>

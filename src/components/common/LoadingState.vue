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
    <div class="flex items-center gap-3">
      <LoaderCircle
        class="size-5 shrink-0 animate-spin text-brand-600 motion-reduce:animate-none dark:text-brand-400"
        aria-hidden="true"
      />
      <div class="flex-1">
        <div class="h-3 w-40 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-gray-700" />
        <div class="mt-3 h-8 w-24 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-gray-800" />
      </div>
    </div>
    <span class="sr-only">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'

/**
 * Skeleton placeholder shown while a panel loads.
 *
 * Mirrors StatCard's shape so the page does not jump when real numbers replace
 * it. Announced politely rather than assertively: a loading state is not an
 * error and should not interrupt a screen reader mid-sentence.
 */
withDefaults(defineProps<{ label?: string; bare?: boolean }>(), { label: 'Loading', bare: false })
</script>

<template>
  <div class="surface-card" role="status" aria-live="polite">
    <div class="flex items-center gap-3">
      <LoaderCircle class="size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
      <div class="flex-1">
        <div class="h-3 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div class="mt-3 h-8 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
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
withDefaults(defineProps<{ label?: string }>(), { label: 'Loading' })
</script>

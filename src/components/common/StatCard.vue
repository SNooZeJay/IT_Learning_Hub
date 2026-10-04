<template>
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
    <div class="flex items-center gap-3">
      <span
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
      >
        <component :is="icon" class="size-5" />
      </span>
      <div class="min-w-0">
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ label }}</p>
        <p class="truncate text-2xl font-light text-gray-900 dark:text-white/90">
          {{ value }}
        </p>
      </div>
    </div>
    <p v-if="hint" class="mt-3 text-xs text-gray-500 dark:text-gray-400">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

/**
 * A single headline figure for a dashboard.
 *
 * The value is a formatted string rather than a number so the caller decides
 * formatting, and so the component never has to guess between pesos, counts and
 * percentages.
 */
withDefaults(
  defineProps<{
    label: string
    value: string
    icon: Component
    hint?: string
  }>(),
  { hint: '' },
)
</script>
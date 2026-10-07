<template>
  <!--
    One headline figure.

    `surface-card` rather than the class string this used to carry, so the card language
    is one decision in `main.css` instead of twenty-two copies of it across the three
    role dashboards.
  -->
  <div class="surface-card">
    <div class="flex items-center gap-3">
      <span class="icon-chip-lg">
        <component :is="icon" class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="section-subheading">{{ label }}</p>
        <!-- font-semibold, not the font-light this used to carry. A dashboard
             figure at weight 300 is the first thing that reads as unfinished,
             and it is the number a learner came to see. -->
        <p class="truncate text-2xl font-semibold tracking-tight text-gray-900 dark:text-white/90">
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
 *
 * `icon` is typed as `Component` and decorated `aria-hidden` here rather than by each
 * caller: the label is always rendered as text beside it, so an announced icon would
 * be a second, redundant name for the same figure.
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

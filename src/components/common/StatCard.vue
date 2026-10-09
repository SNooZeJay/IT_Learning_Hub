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
        <!--
          font-semibold, not the font-light this used to carry. A dashboard figure at
          weight 300 is the first thing that reads as unfinished, and it is the number a
          learner came to see.

          `text-xl` (20px), not `text-2xl` (24px). This is the one place the type scale
          had to be checked against the page rather than against itself. The page title
          is 28px on a laptop and 22px on a phone, so a 24px figure was the largest text
          on a phone dashboard - four separate figures shouting past the one heading that
          names the page. On a row of four tiles that is four competing focal points and
          no way to know which number the screen is asking you to read first.

          20px keeps the figure the loudest thing inside its own card, which is the job,
          while leaving the page title on top at every width. It also lands on the scale:
          28 page, 18 section, 20 figure, 14 label, 12 hint - each step visible, none
          inverted. e2e/type-regression.spec.ts asserts the page title stays the largest
          text on every dashboard at every width, so this cannot drift back.
        -->
        <p class="truncate text-xl font-semibold tracking-tight text-gray-900 dark:text-white/90">
          {{ value }}
        </p>
      </div>
    </div>
    <p v-if="hint" class="mt-3 text-xs text-slate">{{ hint }}</p>
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

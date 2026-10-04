<template>
  <!--
    A drawn placeholder for a course with no cover art.

    The one piece of illustration on the site, and it is geometry rather than a
    picture: ruled lines whose count is the course's real module count, with a
    heavier rule beneath standing in for the level. Given the same course it
    always draws the same figure, so two cards never look like the same picture
    under a different caption.

    An earlier version encoded lessons as a column of vertical ticks. It read as a
    rendering glitch rather than as information - a course with zero lessons drew
    a single orphan line that looked like a broken cursor - so the lesson count
    moved into the caption where it is already stated in words, and this draws
    only what a glance can usefully compare: how big the outline is, and how hard
    the course is.
  -->
  <svg
    viewBox="0 0 160 90"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Module rules. Tapered so a longer outline reads as a denser block. -->
    <g stroke="currentColor" stroke-linecap="round">
      <template v-for="(row, index) in moduleRows" :key="`m${index}`">
        <line
          :x1="16"
          :x2="16 + row.length"
          :y1="16 + index * 11"
          :y2="16 + index * 11"
          :stroke-width="row.weight * 1.6 + 1.1"
          :opacity="row.opacity"
        />
      </template>
    </g>

    <!--
      The level rule. Length is the level, thickness is weight: the strongest
      single signal on the card, and the one a reader comparing six of them can
      actually use.
    -->
    <line
      x1="16"
      :x2="16 + levelRule.length"
      :y1="80"
      y2="80"
      stroke="currentColor"
      :stroke-width="levelRule.weight"
      stroke-linecap="round"
      opacity="0.95"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * Encodes a course's shape into its placeholder.
 *
 * Module count becomes the number of rules. Level becomes the length and weight
 * of the single rule underneath: beginner short and light, intermediate medium,
 * advanced long and heavy.
 */
import { computed } from 'vue'
import type { CourseLevel } from '@/types'

const props = defineProps<{
  level: CourseLevel
  moduleCount: number
}>()

const LEVEL_RULES: Record<CourseLevel, { length: number; weight: number }> = {
  beginner: { length: 34, weight: 2 },
  intermediate: { length: 62, weight: 3 },
  advanced: { length: 92, weight: 4.5 },
}

const levelRule = computed(() => LEVEL_RULES[props.level] ?? LEVEL_RULES.beginner)

/**
 * Module rows, capped at 6.
 *
 * The cap matters: at 11px spacing, a 10-module course would run past the space
 * above the baseline and get clipped, which reads as a broken image rather than a
 * summary. Six rows is enough to tell a short outline from a long one.
 *
 * Zero modules draws NO row, rather than clamping to one. Clamping made a course
 * with no published outline look like the smallest course that has one, which is
 * the opposite of what the caption underneath then says.
 */
const moduleRows = computed(() => {
  const count = Math.min(Math.max(props.moduleCount, 0), 6)
  const longest = 124
  return Array.from({ length: count }, (_, index) => {
    // Rows descend in both length and weight, so the block tapers downward.
    const falloff = 1 - (index / Math.max(count, 1)) * 0.35
    return {
      length: longest * falloff,
      weight: falloff,
      opacity: 0.55 + falloff * 0.35,
    }
  })
})
</script>

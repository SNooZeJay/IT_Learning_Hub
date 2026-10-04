<template>
  <EmptyState
    :title="title"
    :description="description"
    :icon="Hammer"
  >
    <p class="max-w-md text-xs text-gray-400 dark:text-gray-500">
      This screen is part of the
      <span class="font-medium">IT Learning Hub</span> roadmap but has not been built yet. It is
      here so the navigation, roles and layout are real and testable before the feature arrives.
    </p>
  </EmptyState>
</template>

<script setup lang="ts">
import { Hammer } from 'lucide-vue-next'
import EmptyState from './EmptyState.vue'

/**
 * Placeholder for a screen that has not been built yet.
 *
 * Deliberately says so rather than rendering fake rows or invented numbers.
 * Fabricated figures in a school project are indistinguishable from real ones at
 * a glance, and a placeholder that admits it is a placeholder costs nothing and
 * misleads nobody.
 */
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: 'Not built yet',
    description: 'This part of the LMS is still on the build list.',
  },
)
</script>
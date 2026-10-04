<template>
  <div
    class="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/[0.03]"
    role="status"
  >
    <span
      class="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500"
    >
      <component :is="icon" class="size-6" />
    </span>
    <h3 class="text-base font-medium text-gray-900 dark:text-white/90">{{ title }}</h3>
    <p v-if="description" class="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: Component
  }>(),
  { description: '', icon: () => Inbox },
)
</script>
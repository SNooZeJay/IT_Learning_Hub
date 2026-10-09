<template>
  <!--
    `bare` drops the card chrome for a state rendered INSIDE another card.

    This component owns a bordered surface because it is normally the whole region. On
    the dashboards it is also used under a card heading inside a `surface-card`, and
    there the border-inside-a-border plus 64px of extra padding read as a nested box
    rather than as a state.

    The `action` slot exists because four call sites pass `<template #action>`, which
    this component never declared - so the call to action on the empty states simply
    did not render. An empty state with no way forward is the one kind of empty state
    that cannot teach anybody anything.
  -->
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="bare ? 'px-2 py-8' : 'rounded-lg border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/[0.03]'"
    role="status"
  >
    <span
      class="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500"
    >
      <component :is="icon" class="size-6" aria-hidden="true" />
    </span>
    <h3 class="text-base font-medium text-gray-900 dark:text-white/90">{{ title }}</h3>
    <p v-if="description" class="mt-1 max-w-md section-subheading">
      {{ description }}
    </p>
    <div v-if="$slots.default || $slots.action" class="mt-5">
      <slot />
      <slot name="action" />
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
    /** Drop the border and fill, for a state rendered inside another card. */
    bare?: boolean
  }>(),
  { description: '', icon: () => Inbox, bare: false },
)
</script>

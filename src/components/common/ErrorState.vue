<template>
  <!--
    `bare` drops the card chrome for use INSIDE one.

    The three state components each render their own bordered surface, which is right
    when they own a region of the page. But they are also used inside a `surface-card`
    - an empty "nothing outstanding" state under a card heading, a chart's error state
    inside the chart card - and there that produced a bordered box inside a bordered
    box, with the inner one carrying its own 64px of vertical padding on top of the
    card's 24px. The doubled hairline read as a rendering fault rather than as a
    state.

    `bare` keeps the icon, the copy and the retry control, and drops only the border,
    the fill and the oversized padding, because the enclosing card already supplies all
    three.
  -->
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="
      bare
        ? 'px-2 py-8'
        : 'rounded-lg border border-error-200 bg-white px-6 py-16 dark:border-error-500/20 dark:bg-white/[0.03]'
    "
    role="alert"
  >
    <span
      class="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      <CircleAlert class="size-6" aria-hidden="true" />
    </span>
    <h3 class="text-base font-medium text-gray-900 dark:text-white/90">{{ title }}</h3>
    <p class="mt-1 max-w-md section-subheading">
      {{ message }}
    </p>
    <div class="mt-5">
      <Button variant="outline" size="sm" @click="$emit('retry')">
        <RotateCcw class="size-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleAlert, RotateCcw } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

withDefaults(
  defineProps<{
    title?: string
    /** A message from the service layer, already stripped of SQL and internals. */
    message: string
    /** Drop the border and fill, for a state rendered inside another card. */
    bare?: boolean
  }>(),
  { title: 'Something went wrong', bare: false },
)

defineEmits<{ retry: [] }>()
</script>

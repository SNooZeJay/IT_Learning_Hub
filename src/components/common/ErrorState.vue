<template>
  <div
    class="flex flex-col items-center justify-center rounded-lg border border-error-200 bg-white px-6 py-16 text-center dark:border-error-500/20 dark:bg-white/[0.03]"
    role="alert"
  >
    <span
      class="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      <CircleAlert class="size-6" />
    </span>
    <h3 class="text-base font-medium text-gray-900 dark:text-white/90">{{ title }}</h3>
    <p class="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
      {{ message }}
    </p>
    <div class="mt-5">
      <Button variant="outline" @click="$emit('retry')">
        <RotateCcw class="size-4" />
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
  }>(),
  { title: 'Something went wrong' },
)

defineEmits<{ retry: [] }>()
</script>

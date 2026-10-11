<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <input
    v-model="modelValue"
    data-slot="input"
    :class="
      cn(
        'file:text-lp-foreground placeholder:text-lp-muted-foreground selection:bg-lp-primary selection:text-lp-primary-foreground dark:bg-lp-input/30 border-lp-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-lp-ring focus-visible:ring-lp-ring/50 focus-visible:ring-3',
        'aria-invalid:ring-lp-destructive/20 dark:aria-invalid:ring-lp-destructive/40 aria-invalid:border-lp-destructive',
        props.class,
      )
    "
  />
</template>

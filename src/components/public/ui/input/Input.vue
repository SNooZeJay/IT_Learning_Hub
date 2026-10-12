<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number | null
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

/*
  `modelValue` accepts `null` because `v-model.number` on an emptied numeric
  field yields `null`, and the native control accepted it. The grading and
  course forms bind numbers that start empty; refusing `null` here would force
  every one of them to coalesce before binding.
*/

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <!--
    The public text field.

    These classes are `lpTextInputClass` transposed from
    `src/components/ui/controlClasses.ts`, which is where the auth forms used to
    get them from. Two reasons for moving rather than copying.

    One definition: `lpTextInputClass` existed because twenty-odd near-identical
    literals had drifted apart, and four of them disagreed about something
    visible. A form input sitting in a filter bar is the same defect again, and
    the fix that ended the first one ends the second.

    The focus ring survives the move, and it needed saying. It is written
    `rgba(31,107,70,0.12)`, NOT the underscore-slash spelling. Tailwind reads the `/`
    inside an arbitrary value as the start of an opacity MODIFIER, so the slash
    syntax silently resolves the whole shadow to `rgba(0,0,0,0) 0 0 0 0` - no
    error, no ring, and a text field whose only focus affordance beyond its
    border colour is gone. That was measured, not guessed.

    Deliberately NOT given an entrance animation. A field that flies in is a
    field someone is trying to type into; the card arriving is enough.
  -->
  <input
    v-model="modelValue"
    data-slot="input"
    :class="
      cn(
        'w-full rounded-xl border border-lp-line-strong bg-lp-canvas px-4 py-3 text-sm text-lp-ink placeholder:text-lp-slate transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none focus:border-lp-accent focus:shadow-[0_0_0_3px_rgba(31,107,70,0.12)] disabled:cursor-not-allowed disabled:opacity-60',
        'file:text-lp-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium selection:bg-lp-accent selection:text-lp-ink-inverse',
        'aria-invalid:border-lp-destructive',
        props.class,
      )
    "
  />
</template>

<script setup lang="ts">
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Check } from 'lucide-vue-next'
import { reactiveOmit } from '@vueuse/core'
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<CheckboxRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)

const base = [
  'peer relative border-lp-input data-[state=checked]:bg-lp-primary data-[state=checked]:text-lp-primary-foreground data-[state=checked]:border-lp-primary focus-visible:border-lp-ring focus-visible:ring-lp-ring/50 aria-invalid:ring-lp-destructive/20 dark:aria-invalid:ring-lp-destructive/40 aria-invalid:border-lp-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow motion-reduce:transition-none outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
  /*
    The visible box is 16px because a tick sitting in a line of form copy should
    look that small. The hit area is not 16px.

    This is the split `touch-targets.spec.ts` already holds the carousel dots
    to: the visible thing stays small, the thing you can aim at does not. A
    pseudo-element bleeding 14px past each edge takes the target from 16px to
    the 44px the project fixes everywhere else, without moving a pixel of the
    box the eye sees or the baseline of the text beside it.

    `content-['']` is not optional - an `after:` carrying only `inset` never
    renders, which would leave a 16px target that looks deliberate in the
    source and is unusable on a phone.
  */
  "after:absolute after:inset-[-14px] after:content-['']",
] as const
</script>

<template>
  <CheckboxRoot
    v-slot="slotProps"
    data-slot="checkbox"
    v-bind="forwarded"
    :class="cn(base, props.class)"
  >
    <CheckboxIndicator
      data-slot="checkbox-indicator"
      class="grid place-content-center text-current transition-none"
    >
      <slot v-bind="slotProps">
        <Check class="size-3.5" />
      </slot>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>

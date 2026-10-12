<script setup lang="ts">
import type { AccordionTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { reactiveOmit } from '@vueuse/core'
import { AccordionHeader, AccordionTrigger } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<AccordionTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AccordionHeader class="flex">
    <AccordionTrigger
      data-slot="accordion-trigger"
      v-bind="delegatedProps"
      :class="
        cn(
          'focus-visible:border-lp-ring focus-visible:ring-lp-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-start text-sm font-medium transition-all motion-reduce:transition-none outline-none hover:underline focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
          props.class,
        )
      "
    >
      <slot />
      <slot name="icon">
        <ChevronDown
          class="text-lp-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200 motion-reduce:transition-none"
        />
      </slot>
    </AccordionTrigger>
  </AccordionHeader>
</template>

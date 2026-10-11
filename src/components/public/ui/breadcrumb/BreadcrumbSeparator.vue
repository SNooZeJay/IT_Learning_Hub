<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <!--
    `rtl:rotate-180`: the chevron points down the reading direction, so it
    mirrors when the document does. The hand-rolled breadcrumb this replaces
    carried the same modifier on its own chevron; dropping it would break every
    RTL dashboard header.
  -->
  <li
    data-slot="breadcrumb-separator"
    role="presentation"
    aria-hidden="true"
    :class="cn('[&>svg]:size-3.5 [&>svg]:rtl:rotate-180', props.class)"
  >
    <slot>
      <ChevronRight />
    </slot>
  </li>
</template>

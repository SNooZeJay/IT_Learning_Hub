<script setup lang="ts">
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Label } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <!--
    The public form label.

    The `mb-1.5` is not decoration and not an arbitrary gap - it is the whole
    reason this component reads correctly on a page, and it belongs HERE rather
    than on the caller.

    shadcn's own Label carries no vertical margin, because it is designed to sit
    inside a flex column that supplies the spacing with `gap`. The auth forms
    wrap each field in a plain `<div>`, which is `display: block` with
    `gap: normal` - nothing supplies it. Measured on the built page at 900x900
    before this margin existed:

      login    "Email address"    GAP=0px
      register "Full name"        GAP=0px
      register "Email address"    GAP=0px
      register "Password"         GAP=0px
      register "Confirm password" GAP=0px

    Five labels sitting flush against the top border of their own field, which
    is what "the labels stick to the text fields" describes. Six pixels is
    enough to separate them without turning the stack into a list of floating
    words; the field-to-next-label gap is the form's own `gap-5`, which is
    unchanged.

    Owning the margin here rather than at each call site also means a future
    field that is not in a flex column still gets it, and one that is will not
    double it.
  -->
  <Label
    data-slot="label"
    v-bind="delegatedProps"
    :class="
      cn(
        'mb-1.5 flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>

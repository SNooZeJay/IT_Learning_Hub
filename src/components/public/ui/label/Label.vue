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

    The `mb-2` is not decoration and not an arbitrary gap - it is the whole
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

    Five labels sitting flush against the top border of their own field.

    8px, not 6. The first pass of this used `mb-1.5`, measured at 6px, and it
    still read as crowded on the page. A 46px tall input with a 16px radius
    carries enough visual mass that its top border crowds a label sitting 6px
    above it - the measured number and the perceived spacing are not the same
    quantity, which is why this was settled by looking at the rendered form
    rather than by reading the measurement. A test that only asserted "more than
    zero" would have passed the 6px version and let it ship.

    Within a group 8px, between groups the form's own `gap-5` at 20px. That 2.5:1
    ratio is what keeps each label visually attached to the field it names
    rather than to the field above it.

    Owning the margin here rather than at each call site also means a future
    field that is not in a flex column still gets it, and one that is will not
    double it.
  -->
  <Label
    data-slot="label"
    v-bind="delegatedProps"
    :class="
      cn(
        'mb-3 flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>

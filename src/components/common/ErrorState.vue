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
  <!--
    The shadcn Alert is the surface now. `variant="destructive"` carries the
    error tint through the icon and the description rather than through a
    hand-painted `bg-error-50` box, and the retry button keeps the app's own
    Button - the TailAdmin one every other retry control on these screens uses,
    so a failed panel and a failed page offer the same control.
  -->
  <Alert
    variant="destructive"
    :class="bare ? 'border-0 bg-transparent px-2 py-8 shadow-none' : 'px-6 py-16'"
  >
    <CircleAlert class="size-6" aria-hidden="true" />
    <AlertTitle class="text-base font-medium">{{ title }}</AlertTitle>
    <AlertDescription class="max-w-md">
      {{ message }}
    </AlertDescription>
    <div class="mt-5">
      <Button variant="outline" size="sm" @click="$emit('retry')">
        <RotateCcw class="size-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  </Alert>
</template>

<script setup lang="ts">
import { CircleAlert, RotateCcw } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/public/ui/alert'

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

<template>
  <!--
    The wordmark, for narrow viewports only.

    Above the sidebar breakpoint the rail carries the name, so repeating it in the
    header would say "IT Learning Hub" twice within 300px of each other. It used to be
    `xl:hidden`; it still is, and that part was right.

    The name is the only thing that can go when space is short. A 200px-wide
    "IT Learning Hub" plus a toggle, a search field and five icon controls is how the
    header overflows at 390px, and the brand is the one element here whose absence costs
    a reader nothing - the tab title and the mark carry it.
  -->
  <RouterLink
    to="/"
    class="flex min-w-0 shrink items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 sm:gap-2.5 xl:hidden"
  >
    <BrandMark class="size-7 shrink-0 sm:size-8" />
    <!--
      One element, two jobs, resolved by the class rather than by a second copy.

      It was `hidden ... sm:inline` with `aria-label` on the link. Below `sm` that
      leaves the link with no accessible name at all: the mark is an image or an
      empty span, the wordmark is `display: none`, and the label was therefore
      carrying the whole name. It was added for exactly that reason and removing it
      is how the logo link became "link" to a screen reader below 640px.

      The fix is `sr-only sm:not-sr-only`: below `sm` the text is still in the
      accessibility tree and still the accessible name, but visually hidden. From
      `sm` it becomes visible. `truncate` stays, because the whole reason the
      wordmark gives way at narrow widths is that it must be allowed to, and the full
      name remains the accessible name either way.
    -->
    <span
      class="sr-only truncate text-theme-sm font-semibold text-gray-900 sm:not-sr-only dark:text-white/90"
      >{{ BRAND.name }}</span
    >
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BrandMark from '@/components/common/BrandMark.vue'
import { BRAND } from '@/layouts/navigation'
</script>

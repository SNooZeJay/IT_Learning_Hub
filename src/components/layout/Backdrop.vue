<template>
  <!--
    `max-xl`, matching the sidebar's own drawer breakpoint.

    This was `lg:hidden` (1024px) while the sidebar switches to a drawer at `max-xl`
    (1280px). Between those two widths the drawer was open over the page with no
    backdrop: tapping the content did nothing, and the only way out was the close
    button. One number now decides both, exported from `useSidebar.ts` as
    `SIDEBAR_BREAKPOINT_PX`.
  -->
  <div
    v-if="isMobileOpen"
    class="fixed inset-0 z-9999 bg-gray-900/50 max-xl:block hidden"
    @click="toggleMobileSidebar"
  ></div>
</template>

<script setup lang="ts">
import { useSidebar } from '@/composables/useSidebar'

const { toggleMobileSidebar, isMobileOpen } = useSidebar()
</script>

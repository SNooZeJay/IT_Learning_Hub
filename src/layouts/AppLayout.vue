<template>
  <div class="min-h-screen xl:flex">
    <AppSidebar />
    <Backdrop />
    <!--
      The content column.

      The offset comes from the same two tokens the sidebar sizes itself from
      (`--sidebar-width`, `--sidebar-rail-width`), so the two cannot disagree. They were
      `ms-[290px]` / `ms-[90px]` literals against the sidebar's `w-[290px]` / `w-[90px]`,
      and the agreement between them was a coincidence two files had to maintain.

      Only `isExpanded` drives this now. `isHovered` used to be part of it, which meant
      hovering a collapsed rail pushed every dashboard sideways by the difference between
      the two widths - the whole page moving because a pointer crossed a 72px strip.

      No transition on the margin. The sidebar animates its own width over 200ms, and a
      margin transition on top of that made the content lag behind the rail it was
      clearing, which read as the layout sliding twice.

      `min-w-0` is load-bearing. `flex-1` sets `flex-basis: 0` but leaves
      `min-width: auto`, so a flex item still refuses to shrink below its content's
      minimum width. The admin payments table carried its own `overflow-x-auto`, which
      is the right answer, but the column around it was already 4px wider than the
      space the sidebar left, so the scroller had nothing left to scroll and the whole
      page overflowed instead. Same failure as the instructor dashboard, one level up.
    -->
    <div
      class="min-w-0 flex-1 transition-[margin] duration-200 ease-out"
      :class="isSidebarWide ? 'xl:ms-(--sidebar-width)' : 'xl:ms-(--sidebar-rail-width)'"
    >
      <AppHeader />
      <main class="mx-auto max-w-(--breakpoint-2xl) p-4 pb-20 md:p-6 md:pb-6">
        <!--
          RouterView, not slot. Every dashboard route is a child of this one, so
          the matched child renders here. A slot renders nothing for nested
          routes, which is why the page body came up empty while the sidebar and
          header rendered fine.
        -->
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import Backdrop from '@/components/layout/Backdrop.vue'
import { useSidebar } from '@/composables/useSidebar'

const { isExpanded } = useSidebar()

/**
 * Must match the sidebar's own width calculation exactly.
 *
 * `isMobileOpen` is deliberately absent. Below the xl breakpoint the sidebar is a
 * full-screen overlay and these `xl:` offsets do not apply at all, so including it would
 * change nothing above xl and cannot help below it.
 */
const isSidebarWide = isExpanded
</script>

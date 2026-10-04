<template>
  <div class="min-h-screen xl:flex">
    <AppSidebar />
    <Backdrop />
    <div
      class="flex-1 transition-all duration-300 ease-in-out"
      :class="[isSidebarWide ? 'xl:ms-[290px]' : 'xl:ms-[90px]']"
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

const { isExpanded, isHovered } = useSidebar()

/**
 * Must match the sidebar's own width calculation exactly.
 *
 * AppLayout offsets the content by the sidebar's width, and if the two disagree
 * the content either overlaps the sidebar or leaves a gap beside it.
 *
 * `isMobileOpen` is deliberately absent. Below the xl breakpoint the sidebar is
 * a full-screen overlay and these `xl:` offsets do not apply at all, so
 * including it would change nothing above xl and cannot help below it.
 */
const isSidebarWide = isExpanded || isHovered
</script>
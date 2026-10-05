<template>
  <aside
    :class="[
      'fixed flex flex-col mt-0 top-0 px-5 start-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-99999 border-e border-gray-200',
      {
        'xl:w-[290px]': isExpanded || isMobileOpen || isHovered,
        'xl:w-[90px]': !isExpanded && !isHovered,
        'translate-x-0 w-[290px]': isMobileOpen,
        'max-xl:-translate-x-full max-xl:rtl:translate-x-full': !isMobileOpen,
        'xl:translate-x-0': true,
      },
    ]"
    @mouseenter="!isExpanded && (isHovered = true)"
    @mouseleave="isHovered = false"
  >
    <div
      :class="['pt-8 pb-7 flex', !isExpanded && !isHovered ? 'xl:justify-center' : 'justify-start']"
    >
      <router-link to="/">
        <!--
          The product's own mark rather than the upstream logo.svg and
          logo-dark.svg, which are TailAdmin's trademark. Sized here, as on the
          marketing pages, because BrandMark hands sizing to its caller.
        -->
        <BrandMark class="size-8 shrink-0" />
        <span
          v-if="isExpanded || isHovered || isMobileOpen"
          class="ms-3 truncate text-theme-sm font-medium text-gray-900 dark:text-white/90"
          >{{ BRAND.name }}</span
        >
      </router-link>
    </div>

    <div class="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
      <nav class="mb-6">
        <h2
          :class="[
            'mb-4 text-xs uppercase flex leading-5 text-gray-400',
            !isExpanded && !isHovered ? 'xl:justify-center' : 'justify-start',
          ]"
        >
          <template v-if="isExpanded || isHovered || isMobileOpen">
            {{ sectionLabel }}
          </template>
          <MoreHorizontal v-else />
        </h2>

        <ul class="flex flex-col gap-1">
          <li v-for="item in navItems" :key="item.to">
            <router-link
              :to="item.to"
              :class="[
                'menu-item group',
                {
                  'menu-item-active': isActive(item.to),
                  'menu-item-inactive': !isActive(item.to),
                },
                !isExpanded && !isHovered ? 'xl:justify-center' : 'xl:justify-start',
              ]"
            >
              <span
                :class="[isActive(item.to) ? 'menu-item-icon-active' : 'menu-item-icon-inactive']"
              >
                <component :is="item.icon" />
              </span>
              <span
                v-if="isExpanded || isHovered || isMobileOpen"
                class="menu-item-text truncate"
                >{{ item.label }}</span
              >

              <!--
                The count, when the item asks for one and there is something to count.

                `isKnown` rather than `unreadCount > 0` on its own: the shared count is
                `null` until the header has read the feed, and treating that as zero
                would be right by accident while treating it as "no badge" is right by
                design - the alternative is a badge that flashes before anything has
                been fetched.

                Read from the shared count rather than fetched, so marking a
                notification read in the bell moves this badge too.
              -->
              <span
                v-if="item.badge === 'notifications' && isKnown && (unreadCount ?? 0) > 0"
                class="ms-auto shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums"
                :class="!isExpanded && !isHovered ? 'hidden' : ''"
              >
                {{ unreadCount }}
                <span class="sr-only"> unread notification{{ unreadCount === 1 ? '' : 's' }} </span>
              </span>
            </router-link>
          </li>
        </ul>
      </nav>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { MoreHorizontal } from 'lucide-vue-next'
import BrandMark from '@/components/common/BrandMark.vue'
import { useSidebar } from '@/composables/useSidebar'
import { useAuthStore } from '@/stores/auth'
import { BRAND, navigationFor } from '@/layouts/navigation'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'

const { unreadCount, isKnown } = useUnreadNotifications()

const route = useRoute()
const auth = useAuthStore()
const { isExpanded, isMobileOpen, isHovered } = useSidebar()

/**
 * The sidebar renders whatever the current role's navigation says. There is no
 * per-role sidebar component, so the three roles cannot drift apart.
 */
const navItems = computed(() => navigationFor(auth.role))

const sectionLabel = computed(() => {
  switch (auth.role) {
    case 'admin':
      return 'Administration'
    case 'instructor':
      return 'Teaching'
    case 'student':
      return 'Learning'
    default:
      return 'Menu'
  }
})

/**
 * Exact match for top-level items, prefix match for detail pages, so
 * `/student/courses/abc` keeps "My Courses" highlighted.
 */
const isActive = (path: string) => route.path === path || route.path.startsWith(`${path}/`)
</script>

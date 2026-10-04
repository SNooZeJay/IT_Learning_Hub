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
      :class="[
        'pt-8 pb-7 flex',
        !isExpanded && !isHovered ? 'xl:justify-center' : 'justify-start',
      ]"
    >
      <router-link to="/">
        <img
          v-if="isExpanded || isHovered || isMobileOpen"
          class="dark:hidden"
          src="/images/logo/logo.svg"
          alt="IT Learning Hub"
          width="150"
          height="40"
        />
        <img
          v-if="isExpanded || isHovered || isMobileOpen"
          class="hidden dark:block"
          src="/images/logo/logo-dark.svg"
          alt="IT Learning Hub"
          width="150"
          height="40"
        />
        <img
          v-else
          src="/images/logo/logo-icon.svg"
          alt="IT Learning Hub"
          width="32"
          height="32"
        />
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
                :class="[
                  isActive(item.to) ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                ]"
              >
                <component :is="item.icon" />
              </span>
              <span
                v-if="isExpanded || isHovered || isMobileOpen"
                class="menu-item-text truncate"
                >{{ item.label }}</span
              >
            </router-link>
          </li>
        </ul>
      </nav>

      <SidebarWidget />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { MoreHorizontal } from 'lucide-vue-next'
import { useSidebar } from '@/composables/useSidebar'
import { useAuthStore } from '@/stores/auth'
import { navigationFor } from '@/layouts/navigation'
import SidebarWidget from './SidebarWidget.vue'

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
const isActive = (path: string) =>
  route.path === path || route.path.startsWith(`${path}/`)
</script>
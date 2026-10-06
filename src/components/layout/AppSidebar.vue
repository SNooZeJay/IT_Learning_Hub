<template>
  <!--
    `id="app-sidebar"` is what the header's toggle points `aria-controls` at. It
    existed as a string in AppHeader and as nothing in the document, which is worse
    than not claiming the relationship at all.

    `bg-canvas` rather than the `bg-white dark:bg-gray-900` pair it used to carry:
    the token already resolves to #ffffff in light and #1a1a1a in dark, so the pair
    and the token rendered identically and the token is the one that survives a
    change to the ramp.
  -->
  <aside
    id="app-sidebar"
    :class="[
      'fixed start-0 top-0 z-99999 flex h-screen flex-col border-e border-gray-200 bg-canvas px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:text-gray-900',
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
      <nav class="mb-6" aria-label="Sections">
        <!--
          The group label. `text-slate`, not `text-gray-400`: #a4a097 on white is
          2.6:1 and this is 12px body-sized type, which main.css's own note rules
          out. `text-slate` is 6.8:1 and still lighter than the item labels below
          it, so the hierarchy survives the contrast fix.

          When the rail is collapsed the label is replaced by an ellipsis. A glyph
          standing in for a word carries an accessible name of its own, so the name
          is repeated for anything that is not looking at the screen.
        -->
        <h2
          :class="[
            'mb-4 flex text-xs leading-5 font-medium text-slate uppercase',
            !isExpanded && !isHovered ? 'xl:justify-center' : 'justify-start',
          ]"
        >
          <template v-if="isExpanded || isHovered || isMobileOpen">
            {{ sectionLabel }}
          </template>
          <template v-else>
            <MoreHorizontal class="size-4" aria-hidden="true" />
            <span class="sr-only">{{ sectionLabel }}</span>
          </template>
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
                v-if="badgeCount(item) !== null && badgeKnown(item) && (badgeCount(item) ?? 0) > 0"
                class="ms-auto shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums"
                :class="!isExpanded && !isHovered ? 'hidden' : ''"
              >
                {{ badgeCount(item) }}
                <span class="sr-only">
                  unread {{ item.badge === 'messages' ? 'messages' : 'notification'
                  }}{{ (badgeCount(item) ?? 0) === 1 ? '' : 's' }}
                </span>
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
import { useUnreadMessages } from '@/composables/useUnreadMessages'

const { unreadCount, isKnown } = useUnreadNotifications()
const messages = useUnreadMessages()

/**
 * The count for a nav item, or `null` when it carries no badge.
 *
 * One function rather than a second inline condition, because the sidebar and the
 * header button for the same thing must show the same number. A badge that is
 * rendered from one source here and a different one there is a bug that only shows
 * up when the two disagree, which is to say when somebody uses both.
 */
function badgeCount(item: { badge?: 'notifications' | 'messages' }): number | null {
  if (item.badge === 'messages') return messages.unreadCount.value
  if (item.badge === 'notifications') return unreadCount.value
  return null
}

/**
 * Whether this item's count has actually been read yet.
 *
 * Asked per item rather than once for the sidebar. The template used the notifications
 * singleton's `isKnown` for both badges, so when the notification feed failed to load the
 * Messages badge was suppressed while the header's message button - which reads the same
 * number and asks its own `isKnown` - showed a count. The header and the sidebar disagreed
 * about the same figure, which is the one thing sharing `useUnreadMessages` was for.
 */
function badgeKnown(item: { badge?: 'notifications' | 'messages' }): boolean {
  if (item.badge === 'messages') return messages.isKnown.value
  // Both are refs and both want `.value`. `useUnreadMessages` narrows its `isKnown` to a
  // plain readonly ref; the notifications composable does not, hence the asymmetry.
  return isKnown.value
}

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

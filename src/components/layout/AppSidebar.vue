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
      'fixed start-0 top-0 z-99999 flex h-screen flex-col border-e border-gray-200 bg-canvas text-gray-900 transition-[width] duration-200 ease-out dark:border-gray-800 dark:text-gray-900',
      // Widths come from the two shared tokens, not from literals repeated here.
      // `AppLayout` offsets the content by the same numbers, and the two must not
      // drift - a mismatch either overlaps the sidebar or leaves a gap beside it.
      //
      // The full width is the BASE, not an `xl:` override, and it is unconditional. It
      // previously appeared only while the drawer was open, so a closed drawer below
      // the breakpoint had no width at all and fell back to sizing itself to its
      // content - 208px measured in the browser, not 256 - which then animated to the
      // right width as it slid in.
      'w-(--sidebar-width)',
      // Below the breakpoint the sidebar is an overlay, and 256px is 68% of a 375px
      // screen. That leaves the page behind it reduced to a sliver: enough to see that
      // something changed, not enough to tell what. Capping the drawer at 80vw keeps
      // enough of the page visible to confirm where you have landed.
      //
      // Safe to do only because nothing below `xl` offsets the content by this width:
      // `AppLayout`'s `ms-(--sidebar-width)` is `xl:`-gated precisely because below
      // the breakpoint the sidebar floats over the page rather than beside it. Above
      // `xl` this rule does not apply, so the rail keeps its exact token width and
      // still matches `AppLayout`'s offset to the pixel.
      'max-xl:w-[min(var(--sidebar-width),80vw)]',
      isRailOpen ? '' : 'xl:w-(--sidebar-rail-width)',
      // Below xl the sidebar is an overlay drawer: it slides, and `isMobileOpen` is
      // the only thing that decides whether it is on screen. Above xl the translate
      // does not apply and `isExpanded` decides the width instead - two independent
      // axes for two independent modes, which is what one `isRailOpen` cannot express.
      isMobileOpen
        ? 'translate-x-0 max-xl:rtl:translate-x-0'
        : 'max-xl:-translate-x-full max-xl:rtl:translate-x-full',
    ]"
  >
    <!--
      The brand row.

      `isRailOpen` rather than `isExpanded || isHovered`: there is no hover expansion
      any more, so the rail's visual state is exactly one boolean, and every part of
      this component asks the same question.
    -->
    <div
      :class="[
        'flex items-center gap-3 px-4 pt-6 pb-5',
        isRailOpen ? '' : 'xl:justify-center xl:px-0',
      ]"
    >
      <router-link
        to="/"
        class="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
      >
        <BrandMark class="size-8 shrink-0" />
        <span
          v-if="isRailOpen"
          class="truncate text-theme-sm font-semibold text-gray-900 dark:text-white/90"
          >{{ BRAND.name }}</span
        >
      </router-link>
    </div>

    <div class="no-scrollbar flex flex-col overflow-y-auto px-3">
      <nav aria-label="Sections">
        <!--
          The group label. `text-slate`, not `text-gray-400`: #a4a097 on white is
          2.6:1 and this is 12px body-sized type, which main.css's own note rules
          out. `text-slate` is 6.8:1 and still lighter than the item labels below
          it, so the hierarchy survives the contrast fix.

          Hidden entirely when collapsed rather than replaced by a glyph. A `MoreHorizontal`
          icon standing in for the word "Learning" is decoration that carries no
          information a collapsed rail needs, and the previous version of this
          component rendered one.
        -->
        <h2
          v-if="isRailOpen"
          class="px-3 pt-2 pb-3 text-xs leading-5 font-medium tracking-wide text-slate uppercase"
        >
          {{ sectionLabel }}
        </h2>
        <div
          v-else
          class="mx-3 my-3 border-t border-gray-200 dark:border-gray-800"
          aria-hidden="true"
        />

        <ul class="flex flex-col gap-1">
          <li v-for="item in navItems" :key="item.to">
            <router-link
              :to="item.to"
              :aria-label="isRailOpen ? undefined : item.label"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              :class="[
                'group relative flex h-11 items-center rounded-lg text-theme-sm font-medium transition-colors duration-150',
                // The same geometry in both states: 11px of side padding, so the icon
                // column sits in the same place expanded or collapsed. Centring with
                // `justify-center` on a padded row used to shift the icon off-axis by
                // the padding width, which is why collapsed icons looked off-centre
                // against the expanded ones.
                isRailOpen ? 'gap-3 px-3' : 'justify-center px-0',
                isActive(item.to) ? 'menu-item-active' : 'menu-item-inactive',
              ]"
              @pointerenter="setActiveLabel(item.to)"
              @pointerleave="clearActiveLabel(item.to)"
              @focus="setActiveLabel(item.to)"
              @blur="clearActiveLabel(item.to)"
              @keydown.esc="clearActiveLabel(item.to)"
            >
              <span
                class="flex size-5 shrink-0 items-center justify-center"
                :class="isActive(item.to) ? 'menu-item-icon-active' : 'menu-item-icon-inactive'"
              >
                <component :is="item.icon" />
              </span>

              <!--
                Hidden with `hidden`, not `v-if`. The element stays in the DOM and keeps
                its box, which is what stops the row reflowing as labels appear and
                disappear during a resize or a role change. `overflow-hidden` clips it
                outright rather than leaving a half-word on screen.
              -->
              <span
                class="overflow-hidden text-ellipsis whitespace-nowrap transition-opacity duration-150"
                :class="isRailOpen ? 'opacity-100' : 'pointer-events-none w-0 opacity-0'"
              >
                {{ item.label }}
              </span>

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
                v-if="
                  isRailOpen &&
                  badgeCount(item) !== null &&
                  badgeKnown(item) &&
                  (badgeCount(item) ?? 0) > 0
                "
                class="ms-auto shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums"
              >
                {{ badgeCount(item) }}
                <span class="sr-only">
                  unread {{ item.badge === 'messages' ? 'messages' : 'notification'
                  }}{{ (badgeCount(item) ?? 0) === 1 ? '' : 's' }}
                </span>
              </span>

              <!--
                The collapsed-rail label.

                A component per item rather than one shared instance, because each is
                positioned against its own link. It is absolutely positioned outside the
                rail, so showing it cannot change any width in the layout.
              -->
              <SidebarTooltip v-if="!isRailOpen && activeLabel === item.to" :label="item.label" />
            </router-link>
          </li>
        </ul>
      </nav>
    </div>

    <!--
      The account footer.

      Present in the rail state as an avatar-only target, so a collapsed user is never
      stranded with no way to their profile from the sidebar. It links to the same
      route the header's account menu does.
    -->
    <div class="mt-auto border-t border-gray-200 p-3 dark:border-gray-800">
      <router-link
        to="/settings"
        :aria-label="isRailOpen ? undefined : 'My profile'"
        :class="[
          'group flex h-11 items-center rounded-lg text-theme-sm font-medium transition-colors duration-150',
          isRailOpen ? 'gap-3 px-3' : 'justify-center px-0',
          'menu-item-inactive',
        ]"
      >
        <UserAvatar
          :name="auth.profile?.fullName ?? ''"
          :src="auth.profile?.avatarUrl ?? null"
          size="sm"
        />
        <span v-if="isRailOpen" class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          <span class="block truncate font-medium text-gray-900 dark:text-white/90">{{
            auth.profile?.fullName ?? 'My profile'
          }}</span>
          <span class="block truncate text-xs font-normal text-slate capitalize">{{
            auth.role ?? ''
          }}</span>
        </span>
      </router-link>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from '@/components/common/BrandMark.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import SidebarTooltip from '@/components/layout/SidebarTooltip.vue'
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
const { isExpanded, isMobileOpen } = useSidebar()

/**
 * One boolean decides the whole rail.
 *
 * There is no `isHovered` here, and that is the fix rather than an omission. The old
 * template had `isExpanded || isHovered` in the width classes, the label conditions and
 * the alignment classes - about a dozen places - while `AppLayout` separately computed
 * `isExpanded || isHovered` for the content margin. Hovering therefore grew the rail and
 * pushed the entire page sideways at once.
 *
 * Hover now does one thing: it shows a tooltip that is positioned outside the rail and
 * takes no part in layout.
 */
const isRailOpen = computed(() => isExpanded.value || isMobileOpen.value)

/**
 * Which collapsed item's label is showing.
 *
 * One value rather than a per-item boolean map: at most one tooltip can be visible, so a
 * single `string | null` is both the state and its own guard. A `Map` of handles would
 * have needed a template ref per item and an imperative surface on the tooltip.
 *
 * `pointerleave` is only allowed to clear the item it belongs to. Clearing
 * unconditionally would dismiss a tooltip the pointer has already moved onto, which is
 * the flicker you get from naive `mouseenter`/`mouseleave` pairs.
 */
const activeLabel = ref<string | null>(null)

function setActiveLabel(to: string): void {
  activeLabel.value = to
}

function clearActiveLabel(to: string): void {
  if (activeLabel.value === to) activeLabel.value = null
}

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

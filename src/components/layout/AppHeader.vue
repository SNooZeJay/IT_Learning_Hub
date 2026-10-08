<template>
  <!--
    The application header.

    Sticky, one row, one height. Below the sidebar breakpoint the left cluster (toggle,
    search) and the right cluster (account) share the row; above it they stay on one line
    with the search growing to fill.

    `xl:border-b` rather than a border at every width: the toggle's own row below xl draws
    its own separator, so an unconditional border double-drawn it.

    `z-[1000]`, not `z-99999`. The header used to share the sidebar's z-index exactly,
    and in `AppLayout` the header is rendered *after* the sidebar - so with equal
    z-index the later element won, and the header painted on top of the open drawer. On
    a phone that left the theme toggle, the notification bell and the account menu
    floating above the navigation panel that was meant to be covering the page, with
    the page heading showing through the gap underneath.

    Equal z-index is not a tie to be left to document order; it is a bug waiting for a
    reordering. The header wants to sit above page content - the deepest thing on these
    screens is `z-50`, for the account and notification menus, and those sit inside this
    header's own stacking context anyway - and below the two things that must cover it:
    the backdrop (`z-9999`), which dims the page and dismisses the drawer on tap, and
    the sidebar (`z-99999`). 1000 is exactly the gap between them. Nothing changes on
    desktop, where the sidebar is a fixed column and the content is offset clear of it,
    so the two never overlap.
  -->
  <header
    class="sticky top-0 z-[1000] w-full border-b border-gray-200 bg-canvas/95 backdrop-blur-sm xl:border-b dark:border-gray-800"
  >
    <div class="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 lg:py-3 xl:px-6">
      <!--
        Sidebar toggle.

        An icon-only control, so the accessible name is not optional: without
        `aria-label` a screen reader announces "button" and the expanded state has
        nothing to attach itself to. The label follows the state, because a control
        named "Open the navigation menu" while the menu is open is worse than no
        label at all.

        `aria-expanded` reports the DRAWER below the breakpoint and the RAIL above it.
        Both are "is the navigation showing its labels and its content", which is the
        same question the user is asking of the control, so one attribute answers it in
        both modes.
      -->
      <HeaderIconButton
        :label="isMobileOpen ? 'Close the navigation menu' : 'Open the navigation menu'"
        :expanded="isSidebarShowing"
        controls="app-sidebar"
        :active="isMobileOpen"
        @activate="handleToggle"
      >
        <X v-if="isMobileOpen" class="size-5" aria-hidden="true" />
        <Menu v-else class="size-5" aria-hidden="true" />
      </HeaderIconButton>

      <HeaderLogo />

      <!--
        The search field is the only element between the toggle and the right cluster,
        so it takes the slack. Below the sidebar breakpoint the right cluster collapses
        into an overflow button, which is why this is `xl:order-last` here and the
        account menu drops below.
      -->
      <SearchBar class="min-w-0 flex-1" />

      <!--
        Overflow toggle for the right-hand cluster on small screens.

        Named and given `aria-expanded` for the same reason as the toggle above.
        `xl:hidden` because at xl that cluster is permanently on screen and this button
        would then control nothing.
      -->
      <HeaderIconButton
        class="xl:hidden"
        :label="isAccountMenuOpen ? 'Hide account menu' : 'Show account menu'"
        :expanded="isAccountMenuOpen"
        controls="app-header-account"
        :active="isAccountMenuOpen"
        @activate="toggleAccountMenu"
      >
        <MoreVertical class="size-5" aria-hidden="true" />
      </HeaderIconButton>

      <!--
        The account cluster.

        `shadow-theme-md` used to be here, on a full-width block, below the breakpoint
        only. It was the one decorative shadow in the header, on a surface that already
        has a background and sits directly under a sticky bar - it read as a card floating
        under the header rather than as part of it. The bar's own bottom border does the
        separating.
      -->
      <div
        id="app-header-account"
        :class="isAccountMenuOpen ? 'flex' : 'hidden'"
        class="w-full flex-col items-stretch gap-3 border-t border-gray-200 px-3 pb-3 pt-3 sm:px-4 xl:flex xl:w-auto xl:flex-row xl:items-center xl:gap-3 xl:border-0 xl:p-0 dark:border-gray-800"
      >
        <div class="flex items-center gap-1">
          <ThemeToggleButton />
          <!--
            Messages sits immediately before the bell rather than after it.

            A message is something you write and a notification is something that
            happened to you, so the one you compose comes first. It is a plain link
            rather than a dropdown: opening a thread is navigation, and a panel that
            opened over the page would hide the thing you are replying to.
          -->
          <MessageButton />
          <NotificationMenu />
        </div>
        <UserMenu />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Menu, MoreVertical, X } from 'lucide-vue-next'
import { useSidebar } from '@/composables/useSidebar'
import HeaderIconButton from '@/components/layout/HeaderIconButton.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import SearchBar from './header/SearchBar.vue'
import HeaderLogo from './header/HeaderLogo.vue'
import NotificationMenu from './header/NotificationMenu.vue'
import MessageButton from './header/MessageButton.vue'
import UserMenu from './header/UserMenu.vue'

const { toggleSidebar, toggleMobileSidebar, isMobileOpen, isExpanded, isMobile } = useSidebar()

/**
 * One control doing both jobs.
 *
 * `isMobile` rather than reading `window.innerWidth` at click time: the composable's
 * value is the same one the sidebar's own classes respond to, and reading the window
 * separately is how a click ends up doing the opposite of what the user sees.
 */
const handleToggle = () => {
  if (isMobile.value) {
    toggleMobileSidebar()
    return
  }
  toggleSidebar()
}

/**
 * Whether the navigation is currently showing what it has to show: the drawer below the
 * breakpoint, the expanded rail above it. One boolean for `aria-expanded`, because the
 * user is asking the same question in both modes.
 */
const isSidebarShowing = computed(() => (isMobile.value ? isMobileOpen.value : isExpanded.value))

const isAccountMenuOpen = ref(false)

function toggleAccountMenu(): void {
  isAccountMenuOpen.value = !isAccountMenuOpen.value
}

// Growing past the breakpoint reveals the account cluster permanently, so an open
// overflow menu would be a control controlling something that is already visible.
watch(isMobile, (mobile) => {
  if (!mobile) isAccountMenuOpen.value = false
})
</script>

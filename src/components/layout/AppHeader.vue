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
    ref="headerEl"
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

        `ms-auto` pins it to the inline end. It used to rely on `SearchBar`'s `flex-1`
        to absorb the slack, which is an indirect way of saying the same thing and did
        not hold: the button sat mid-row, not at the end of the bar. A control that
        opens a panel belongs where the eye finishes scanning, and `ms-auto` states
        that directly instead of depending on what happens to be between the start of
        the row and the control. Logical, so it pins to the left in RTL.
      -->
      <HeaderIconButton
        class="ms-auto xl:hidden"
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

        This used to become `w-full flex-col` *inside* a flex row when opened. That
        put it below the bar as a second in-flow row rather than over the page, which
        squeezed the header taller and left the menus inside it with almost no room
        to anchor to - on a phone the account cluster was being asked to lay itself
        out inside the sliver of viewport left over after the sticky bar.

        So below the breakpoint it is now a genuinely anchored panel: absolutely
        positioned under the trigger's edge, `end-0` so it hangs off the same side as
        the button that opened it and mirrors correctly in RTL, and capped at
        `min(20rem, 100vw - 2rem)` so it cannot exceed a phone viewport no matter how
        narrow that is.

        It needs no z-index of its own. `z-50` here is inside this header's `z-[1000]`
        stacking context, so it lands above page content and below both the backdrop
        and the sidebar without either of those having to move - which is the whole
        reason the header was given a z-index that sits in the gap between them.

        `xl:static xl:flex` restores the inline row on desktop, where the cluster is
        always visible and there is nothing to anchor.
      -->
      <div
        id="app-header-account"
        :class="isAccountMenuOpen ? 'flex' : 'hidden'"
        class="absolute end-0 top-full z-50 w-[min(20rem,calc(100vw-2rem))] flex-col items-stretch gap-3 border border-gray-200 bg-canvas p-3 shadow-theme-lg xl:static xl:z-auto xl:flex xl:w-auto xl:flex-row xl:items-center xl:gap-3 xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none dark:border-gray-800 dark:bg-gray-900 xl:dark:bg-transparent"
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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

/**
 * The header element, for outside-tap detection.
 *
 * The panel lives inside the header in the DOM, so "is this tap inside the thing I
 * just opened" is answered by one `contains` check against the header rather than by
 * the panel's own rect. That is deliberately looser: a tap on the search field also
 * closes the menu, which is what you want from a menu that is overlaying the page.
 */
const headerEl = ref<HTMLElement | null>(null)

function toggleAccountMenu(): void {
  isAccountMenuOpen.value = !isAccountMenuOpen.value
}

function closeAccountMenu(): void {
  isAccountMenuOpen.value = false
}

function onPointerDownOutside(event: Event): void {
  const el = headerEl.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  closeAccountMenu()
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeAccountMenu()
}

/**
 * Close the panel on outside tap and on Escape, while it is open.
 *
 * Listeners are attached on open and removed on close rather than attached once and
 * early-returning. Two listeners that do nothing most of the time are cheaper than
 * two that do nothing most of the time, but the real cost is correctness: a
 * permanently-attached `keydown` listener has to ignore Escape whenever the panel is
 * closed, and then it is a second thing that can be wrong about the panel's state.
 * Binding the lifetime of the listener to the lifetime of the panel removes the
 * question.
 */
watch(isAccountMenuOpen, (open, wasOpen) => {
  if (open === wasOpen) return
  if (open) {
    document.addEventListener('pointerdown', onPointerDownOutside)
    document.addEventListener('keydown', onEscape)
  } else {
    document.removeEventListener('pointerdown', onPointerDownOutside)
    document.removeEventListener('keydown', onEscape)
  }
})

onBeforeUnmount(() => {
  // A closed panel already detached these, but unmounting while open would leave
  // them attached to a `document` that outlives the component.
  document.removeEventListener('pointerdown', onPointerDownOutside)
  document.removeEventListener('keydown', onEscape)
})

// Growing past the breakpoint reveals the account cluster permanently, so an open
// overflow menu would be a control controlling something that is already visible.
watch(isMobile, (mobile) => {
  if (!mobile) isAccountMenuOpen.value = false
})
</script>

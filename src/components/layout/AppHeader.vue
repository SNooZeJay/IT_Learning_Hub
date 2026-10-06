<template>
  <header
    class="sticky top-0 z-99999 flex w-full border-gray-200 bg-canvas xl:border-b dark:border-gray-800"
  >
    <div class="flex grow flex-col items-center justify-between xl:flex-row xl:px-6">
      <div
        class="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 sm:gap-4 dark:border-gray-800 xl:justify-normal xl:border-b-0 xl:px-0 lg:py-4"
      >
        <!--
          Sidebar toggle.

          An icon-only control, so the accessible name is not optional: without
          `aria-label` a screen reader announces "button" and the expanded state has
          nothing to attach itself to. The label follows the state, because a control
          named "Open the navigation menu" while the menu is open is worse than no
          label at all.

          `type="button"` because this element has no business submitting anything,
          and a `<button>` with no type attribute inside a form submits that form.

          Lucide rather than the three hand-inlined TailAdmin SVGs this replaced, so
          the hamburger, the close and the overflow glyph share one stroke weight and
          one optical size with every other icon in the app.
        -->
        <button
          type="button"
          :aria-label="isMobileOpen ? 'Close the navigation menu' : 'Open the navigation menu'"
          :aria-expanded="isMobileOpen"
          aria-controls="app-sidebar"
          class="z-99999 flex size-10 cursor-pointer items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:size-11 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          :class="isMobileOpen ? 'bg-gray-100 dark:bg-gray-800' : ''"
          @click="handleToggle"
        >
          <X v-if="isMobileOpen" class="size-5" aria-hidden="true" />
          <Menu v-else class="size-5" aria-hidden="true" />
        </button>

        <HeaderLogo />

        <!--
          Overflow toggle for the right-hand cluster: theme, notifications, account.

          Named and given `aria-expanded` for the same reason as the toggle above.
          `xl:hidden` because at xl that cluster is permanently on screen and this
          button would then control nothing.
        -->
        <button
          type="button"
          :aria-label="isApplicationMenuOpen ? 'Hide account menu' : 'Show account menu'"
          :aria-expanded="isApplicationMenuOpen"
          aria-controls="app-header-account"
          class="z-99999 flex size-10 cursor-pointer items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 xl:hidden"
          @click="toggleApplicationMenu"
        >
          <MoreVertical class="size-5" aria-hidden="true" />
        </button>

        <SearchBar />
      </div>

      <div
        id="app-header-account"
        :class="[isApplicationMenuOpen ? 'flex' : 'hidden']"
        class="w-full items-center justify-between gap-4 px-5 py-4 shadow-theme-md xl:flex xl:justify-end xl:px-0 xl:shadow-none"
      >
        <div class="flex items-center gap-2 2xsm:gap-3">
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
import { ref } from 'vue'
import { Menu, MoreVertical, X } from 'lucide-vue-next'
import { useSidebar } from '@/composables/useSidebar'
import ThemeToggleButton from '../common/ThemeToggleButton.vue'
import SearchBar from './header/SearchBar.vue'
import HeaderLogo from './header/HeaderLogo.vue'
import NotificationMenu from './header/NotificationMenu.vue'
import MessageButton from './header/MessageButton.vue'
import UserMenu from './header/UserMenu.vue'

const { toggleSidebar, toggleMobileSidebar, isMobileOpen } = useSidebar()

/**
 * Below xl the sidebar is an overlay drawer, so the same button opens and closes
 * it. At xl and above it is a persistent rail and the button collapses or expands
 * it instead. Reading `window.innerWidth` keeps one control doing both jobs without
 * duplicating it into two elements a keyboard user would have to discover twice.
 */
const handleToggle = () => {
  if (window.innerWidth >= 1280) {
    toggleSidebar()
  } else {
    toggleMobileSidebar()
  }
}

const isApplicationMenuOpen = ref(false)

const toggleApplicationMenu = () => {
  isApplicationMenuOpen.value = !isApplicationMenuOpen.value
}
</script>

<template>
  <button
    type="button"
    class="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
    :aria-label="label"
    :title="label"
    @click.prevent="toggleTheme"
  >
    <!--
      Icon-only, so the accessible name is what tells a screen reader what the
      button does. It states the ACTION ("Switch to dark theme"), not the current
      state, because that is what pressing it will do.

      Both glyphs are rendered and swapped with `hidden`, rather than one being
      conditional on state. That keeps the button a fixed size, so the header
      does not shift by a pixel when the theme changes.
    -->
    <Moon class="size-5 dark:hidden" aria-hidden="true" />
    <Sun class="hidden size-5 dark:block" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
/**
 * Light/dark switch. Icon only, no visible label.
 *
 * Separate from the upstream `ThemeToggler` because that one is fixed at the
 * header's 44px chrome and hand-inlines two SVGs. This version takes its size
 * from its container so the same button works in the app header, on the landing
 * page and on the auth pages without being restyled at each call site.
 */
import { computed } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'

const { isDarkMode, toggleTheme } = useTheme()

const label = computed(() => (isDarkMode.value ? 'Switch to light theme' : 'Switch to dark theme'))
</script>

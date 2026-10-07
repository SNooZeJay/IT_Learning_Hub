<template>
  <!--
    The theme toggle.

    Sized by `HeaderIconButton`, not by its own classes. This control used to be
    `rounded-full` + border at `size-11`, sitting beside a `rounded-full` + border bell
    at `size-11` and a `rounded-full` unbordered message button at `size-10`: three
    shapes and two sizes in one row. See `HeaderIconButton.vue` for why circles came off.

    Icon-only, so the accessible name is what tells a screen reader what the button does.
    It states the ACTION ("Switch to dark theme"), not the current state, because that is
    what pressing it will do.
  -->
  <HeaderIconButton :label="label" @activate="toggleTheme">
    <!--
      Both glyphs are rendered and swapped with `hidden`, rather than one being
      conditional on state. That keeps the button a fixed size, so the header
      does not shift by a pixel when the theme changes.
    -->
    <Moon class="size-5 dark:hidden" aria-hidden="true" />
    <Sun class="hidden size-5 dark:block" aria-hidden="true" />
  </HeaderIconButton>
</template>

<script setup lang="ts">
/**
 * Light/dark switch. Icon only, no visible label.
 *
 * Separate from the upstream `ThemeToggler` because that one is fixed at the
 * header's 44px chrome and hand-inlines two SVGs. This version delegates shape and size
 * to the shared header control, so the same button works in the app header, on the
 * landing page and on the auth pages without being restyled at each call site.
 */
import { computed } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'
import HeaderIconButton from '@/components/layout/HeaderIconButton.vue'

const { isDarkMode, toggleTheme } = useTheme()

const label = computed(() => (isDarkMode.value ? 'Switch to light theme' : 'Switch to dark theme'))
</script>

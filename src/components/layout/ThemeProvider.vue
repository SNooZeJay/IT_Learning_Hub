<template>
  <slot></slot>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, watch, computed } from 'vue'
import { themeKey } from '@/composables/themeContext'
import type { ResolvedTheme, ThemePreference } from '@/composables/themeContext'

const STORAGE_KEY = 'theme'

/**
 * What the visitor chose, kept separately from what is applied.
 *
 * These were one field with two values. The header button could only ever flip between
 * light and dark, and "follows my system" was not a choice that could be expressed - it
 * was merely the absence of one, inferred at load from `prefers-color-scheme`.
 *
 * A Settings page needs the third option to be selectable, because that is the state a
 * great many people are already in: they have never touched the toggle and their laptop
 * is dark at night. Writing `'system'` down is what makes "leave it alone" a decision
 * rather than an accident, and it is what lets the OS change later without overwriting a
 * choice somebody made on purpose.
 */
const preference = ref<ThemePreference>('system')

/** What the OS currently asks for. Only consulted while the preference is `system`. */
const systemTheme = ref<ResolvedTheme>('light')

const isInitialized = ref(false)

const theme = computed<ResolvedTheme>(() =>
  preference.value === 'system' ? systemTheme.value : preference.value,
)

const isDarkMode = computed(() => theme.value === 'dark')

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function setTheme(next: ThemePreference): void {
  preference.value = next
}

/**
 * The header button, which offers no choice of `system` - it is a switch, so it flips
 * between the two explicit values. From `system` it goes to the opposite of what is
 * currently on screen, which is what pressing a switch labelled "go dark" while dark
 * means. Pressing it again restores the explicit other value; it does not return to
 * `system`, because a switch has no third position to return to.
 */
function toggleTheme(): void {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

onMounted(() => {
  systemTheme.value = readSystemTheme()

  const saved = localStorage.getItem(STORAGE_KEY)
  preference.value = saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system'
  isInitialized.value = true

  // Follow the OS as it changes, always. It only has any effect while the preference is
  // `system`, because otherwise `theme` reads `preference` and this listener is
  // updating a value nothing is showing.
  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', (event) => {
      systemTheme.value = event.matches ? 'dark' : 'light'
    })
  }
})

// The preference is what gets persisted, not the resolved theme.
//
// Persisting `theme` would write 'light' or 'dark' over a 'system' the moment this ran,
// because `system` has no value of its own to save. That was not visible before - there
// was no way to store 'system' - and it would be the whole feature lost by accident the
// first time the settings page touched this.
watch([preference, isInitialized], ([next, initialized]) => {
  if (!initialized) return
  localStorage.setItem(STORAGE_KEY, next)
})

watch([theme, isInitialized], ([applied, initialized]) => {
  if (!initialized) return
  document.documentElement.classList.toggle('dark', applied === 'dark')
})

provide(themeKey, { preference, theme, systemTheme, isDarkMode, setTheme, toggleTheme })
</script>

<template>
  <slot></slot>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, watch, computed } from 'vue'
import { themeKey } from '@/composables/themeContext'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

const theme = ref<Theme>('light')
const isInitialized = ref(false)

const isDarkMode = computed(() => theme.value === 'dark')

const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}

/**
 * Honour the OS preference when the visitor has never chosen.
 *
 * Without this, anyone whose system is dark gets a white flash on every visit
 * until they find the toggle and press it. Their preference is the better
 * default; an explicit choice in localStorage still overrides it.
 */
function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  theme.value = saved === 'dark' || saved === 'light' ? saved : systemTheme()
  isInitialized.value = true

  // Follow the OS while the visitor has expressed no preference of their own.
  // Once they toggle, this stops mattering because localStorage wins from then on.
  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', (event) => {
      if (localStorage.getItem(STORAGE_KEY)) return
      theme.value = event.matches ? 'dark' : 'light'
    })
  }
})

watch([theme, isInitialized], ([newTheme, newIsInitialized]) => {
  if (!newIsInitialized) return
  localStorage.setItem(STORAGE_KEY, newTheme)
  document.documentElement.classList.toggle('dark', newTheme === 'dark')
})

provide(themeKey, { isDarkMode, toggleTheme })
</script>

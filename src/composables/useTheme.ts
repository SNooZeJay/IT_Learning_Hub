import { inject } from 'vue'
import { themeKey } from '@/composables/themeContext'
import type { ThemeContext } from '@/composables/themeContext'

/**
 * Read the theme provided by `ThemeProvider`.
 *
 * Throws rather than returning `undefined` when there is no provider, so a
 * missing provider surfaces at the call site instead of as a toggle that does
 * nothing.
 */
export function useTheme(): ThemeContext {
  const theme = inject(themeKey)
  if (!theme) {
    throw new Error('useTheme() must be called inside a ThemeProvider')
  }
  return theme
}

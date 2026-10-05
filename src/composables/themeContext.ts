import type { ComputedRef, InjectionKey } from 'vue'

/**
 * Theme context shared by `ThemeProvider`.
 *
 * Typing the injection is what makes `toggleTheme` visible to consumers. With a
 * bare `inject('theme')` the result is `unknown`, so every consumer has to cast
 * and a rename inside the provider becomes a silent `undefined` at runtime.
 */
export interface ThemeContext {
  isDarkMode: ComputedRef<boolean>
  toggleTheme: () => void
}

export const themeKey: InjectionKey<ThemeContext> = Symbol('theme')

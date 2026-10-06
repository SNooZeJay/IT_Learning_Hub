import type { ComputedRef, InjectionKey, Ref } from 'vue'

/**
 * What the visitor asked for, which is not the same as what is on screen.
 *
 * `'system'` means "whatever the operating system says", so it resolves to light or dark
 * at render time and can change under the visitor - when the OS flips at sunset, or when
 * they move a window onto a second monitor with a different setting. That is why the
 * preference and the resolved theme are separate values rather than one field with three
 * states: a setting that silently rewrites itself is not a setting anybody chose.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** What is actually applied to the document right now. */
export type ResolvedTheme = 'light' | 'dark'

/**
 * Theme context shared by `ThemeProvider`.
 *
 * Typing the injection is what makes `toggleTheme` visible to consumers. With a
 * bare `inject('theme')` the result is `unknown`, so every consumer has to cast
 * and a rename inside the provider becomes a silent `undefined` at runtime.
 */
export interface ThemeContext {
  /** The choice the visitor made, including `system`. */
  preference: Ref<ThemePreference>
  /** What that resolves to, following the OS while the preference is `system`. */
  theme: ComputedRef<ResolvedTheme>
  /**
   * What the operating system is currently asking for, tracked reactively.
   *
   * Separate from `theme` because while the preference is `light` or `dark` the two
   * disagree, and a settings page has to be able to say "your system is dark, so
   * choosing System will match that" without deriving it from a value that is
   * deliberately not following the system. Reading `matchMedia` inside a computed
   * instead would not update when the OS changes at sunset.
   */
  systemTheme: Ref<ResolvedTheme>
  isDarkMode: ComputedRef<boolean>
  setTheme: (next: ThemePreference) => void
  toggleTheme: () => void
}

export const themeKey: InjectionKey<ThemeContext> = Symbol('theme')

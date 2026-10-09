<template>
  <section
    class="surface-card p-5 sm:p-6"
    aria-labelledby="appearance-heading"
  >
    <h2 id="appearance-heading" class="text-theme-xl text-ink">Appearance</h2>
    <p class="mt-1 text-sm text-slate">
      These are remembered by this browser, so they do not follow you to another device.
    </p>

    <!--
      A radio group, not a select, and not a switch.

      A switch could not express "system" as a third position without lying about it, and
      a select hides the current choice until it is opened. These are three named options
      with one answer each, which is what a radiogroup is for.
    -->
    <fieldset class="mt-5">
      <legend class="text-sm font-medium text-ink">Theme</legend>
      <p class="mt-0.5 text-sm text-slate">
        Colours only. Font size, spacing and layout are the same either way.
      </p>

      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <label
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          class="flex min-h-11 flex-1 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm"
          :class="
            preference === option.value
              ? 'border-brand-500 bg-brand-50/50 dark:border-brand-400 dark:bg-brand-500/10'
              : 'border-hairline hover:border-hairline-strong dark:border-white/10 dark:hover:border-white/20'
          "
        >
          <input
            type="radio"
            name="theme-preference"
            class="mt-0.5 size-4 shrink-0 border-stone text-brand-600 focus:ring-brand-500 dark:border-muted dark:bg-white/[0.03]"
            :value="option.value"
            :checked="preference === option.value"
            :aria-describedby="`theme-note-${option.value}`"
            @change="setTheme(option.value)"
          />
          <span>
            {{ option.label }}
            <span class="block text-xs text-slate">{{ option.description }}</span>
          </span>
        </label>
      </div>

      <!--
        The sentence that makes "System" honest.

        Without it, System looks like the one option that is not doing anything, and a
        visitor who cannot see that it is currently reading their OS has no way to tell
        whether it works. Naming the thing it is following turns it from a dead control
        into a described one.
      -->
      <p id="theme-note-system" class="mt-3 text-xs text-slate" aria-live="polite">
        Following your system, which is set to
        <strong class="font-medium text-ink">{{ systemLabel }}</strong
        >. That will change on its own when your computer switches between light and dark.
        <template v-if="preference !== 'system'">
          Your system is {{ systemLabel.toLowerCase() }}, so choosing System will match that.
        </template>
      </p>
      <p id="theme-note-light" class="sr-only">Always light.</p>
      <p id="theme-note-dark" class="sr-only">Always dark.</p>
    </fieldset>

    <hr class="my-6 border-hairline" />

    <!--
      A switch, because this one genuinely has two states and no third.

      Text direction is not a preference layered on top of the theme - it is the one
      layout axis this project supports, and left-to-right is its default. A radiogroup
      here would imply the choice was open.
    -->
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <label for="text-direction" class="block text-sm font-medium text-ink">
          Right-to-left layout
        </label>
        <p id="direction-note" class="mt-0.5 text-sm text-slate">
          Mirrors the interface: navigation, spacing, icons and text alignment all follow. Set to
          off for left-to-right, which is the default.
        </p>
      </div>

      <label class="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          id="text-direction"
          type="checkbox"
          class="peer sr-only"
          role="switch"
          :checked="isRtl"
          aria-describedby="direction-note"
          @change="setRTL(!isRtl)"
        />
        <span
          class="h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 rtl:after:-translate-x-full rtl:peer-checked:after:translate-x-0 dark:bg-gray-700 dark:peer-checked:bg-brand-500"
        ></span>
      </label>
    </div>

    <p class="mt-3 text-xs text-slate" aria-live="polite">
      Layout is currently <strong class="font-medium text-ink">{{ directionLabel }}</strong
      >.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRTL } from '@/composables/useRTL'
import { themeKey } from '@/composables/themeContext'
import type { ThemeContext, ThemePreference } from '@/composables/themeContext'

/**
 * The two appearance settings this project can actually honour.
 *
 * Both of these were already working and already persisted, so nothing here is new
 * behaviour - they were simply not reachable from anywhere. The theme toggle lived only
 * in the header, which cannot express "follow my system", and the direction toggle had no
 * control at all.
 *
 * What is deliberately absent, because none of it exists here:
 *
 *   - Language. There is no translation layer, so a picker would change nothing.
 *   - Font size and density. Tailwind's scale is fixed in `main.css`.
 *   - Colour-blind filters, high contrast, reduced motion. Nothing in the design tokens
 *     reads a user preference, and a toggle that cannot alter the tokens is a switch
 *     that lies.
 *
 * The previous profile page offered a language picker that stored a value nothing read,
 * with a note admitting it. It has been deleted rather than carried over.
 */

/**
 * Injected rather than imported, because the provider is an ancestor and the state has to
 * be the same instance the header button is toggling. A missing provider is a programming
 * error, not a state to render around - hence the throw rather than a default.
 */
const theme = inject(themeKey)
if (!theme) {
  throw new Error('AppearanceCard must be rendered inside ThemeProvider.')
}

const { preference, systemTheme, setTheme } = theme as ThemeContext

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  description: string
}> = [
  { value: 'light', label: 'Light', description: 'Always light.' },
  { value: 'dark', label: 'Dark', description: 'Always dark.' },
  {
    value: 'system',
    label: 'System',
    description: 'Follow this device’s setting.',
  },
]

/**
 * Read from the provider rather than from `matchMedia` here.
 *
 * `matchMedia(...).matches` inside a computed is not reactive: it is evaluated once and
 * then never again, so the sentence under this group would have kept claiming the old
 * answer after the OS switched at sunset. The provider already tracks it in a ref and
 * updates it from the media-query listener, so reading that is both correct and one
 * source of truth.
 */
const systemLabel = computed(() => systemTheme.value)

const { isRtl, setRTL } = useRTL()

const directionLabel = computed(() => (isRtl.value ? 'right-to-left' : 'left-to-right'))
</script>

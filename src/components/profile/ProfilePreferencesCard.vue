<template>
  <section
    class="rounded-lg border border-hairline bg-canvas p-5 sm:p-6 dark:bg-white/[0.03]"
    aria-labelledby="preferences-heading"
  >
    <h2 id="preferences-heading" class="text-theme-xl text-ink">Preferences</h2>
    <p class="mt-1 text-sm text-slate">
      Stored on this device. Nothing here is saved to your account, and nothing here is synced to
      another browser.
    </p>

    <div class="mt-5">
      <label for="language-preference" class="mb-1.5 block text-sm font-medium text-ink">
        Preferred language
      </label>
      <select
        id="language-preference"
        :value="language"
        class="w-full rounded-md border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:bg-white/[0.03]"
        :aria-describedby="`language-note language-value`"
        @change="onChange"
      >
        <option v-for="option in OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <!--
        The honest sentence, in the place somebody looks before choosing.

        There is no i18n library and no translation table in this project, so
        nothing here changes a single word of the interface. Presenting a
        language picker that did not translate anything would be the same lie as
        the theme toggle that used to sit here and store a value nobody read.
      -->
      <p id="language-note" class="mt-2 text-xs text-slate">
        The interface is English only for now — there is no translation layer to switch to yet. This
        records the choice so it can be applied when Filipino is translated.
      </p>
      <p id="language-value" class="mt-1 text-xs text-slate">
        Currently <strong class="font-medium text-ink">{{ currentLabel }}</strong
        >, saved in this browser under <code class="font-mono">{{ STORAGE_KEY }}</code
        >.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * The one preference this project can honestly hold.
 *
 * `profiles` has no locale column, no timezone column and no notification
 * preferences, and inventing one in localStorage and calling it a saved setting
 * would be worse than not offering it. So this is explicitly a device-local
 * value, labelled as one, with the key printed underneath so it is inspectable
 * rather than mysterious.
 *
 * Two languages only, because those are the two this school teaches in. Arabic,
 * Spanish and German were never translations and would only widen the list.
 */

/** Documented storage key. Namespaced so it cannot collide with `theme` or `rtl_mode`. */
const STORAGE_KEY = 'lms.preferences'

const OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
] as const

type Language = (typeof OPTIONS)[number]['value']

function isLanguage(value: string | null): value is Language {
  return OPTIONS.some((option) => option.value === value)
}

/** A corrupt or absent value falls back to English rather than throwing on mount. */
function readStored(): Language {
  if (typeof localStorage === 'undefined') return 'en'

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'en'

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return 'en'

    const value = (parsed as { language?: unknown }).language
    return typeof value === 'string' && isLanguage(value) ? value : 'en'
  } catch {
    // Someone hand-edited the key into something that is not JSON. That is not
    // an error worth showing; the default is the correct answer either way.
    return 'en'
  }
}

const language = ref<Language>(readStored())

const currentLabel = computed(
  () => OPTIONS.find((option) => option.value === language.value)?.label ?? 'English',
)

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (!isLanguage(value)) return

  language.value = value
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: value }))
  } catch {
    // Private browsing and a full quota both land here. The choice still holds
    // for this visit, which is the most that can honestly be promised.
  }
}
</script>

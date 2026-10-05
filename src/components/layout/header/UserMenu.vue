<template>
  <div ref="dropdownRef" class="relative">
    <!-- User button -->
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-1 py-1 text-start transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:hover:bg-white/[0.06] xl:w-auto"
      aria-haspopup="true"
      :aria-expanded="dropdownOpen"
      aria-controls="user-menu-dropdown"
      @click="toggleDropdown"
    >
      <!--
        The avatar is the profile's own `avatar_url`, or two initials derived
        from the real `full_name`. It used to fall back to
        `/images/user/owner.png`, TailAdmin's bundled photograph of an actual
        person, so every account in the system wore the same stranger's face.
      -->
      <span
        class="relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
        :class="avatarFallbackClass"
      >
        <img
          v-if="showAvatarImage"
          :src="avatarUrl"
          alt=""
          class="size-full object-cover"
          @error="avatarFailed = true"
        />
        <span v-else aria-hidden="true">{{ initials }}</span>
      </span>

      <!-- `max-w-40` so a long name truncates instead of pushing the header wider
           than a 390px viewport. -->
      <span class="min-w-0 max-w-40 truncate text-theme-sm font-medium text-ink dark:text-gray-200">
        {{ firstName }}
      </span>

      <ChevronDown
        class="size-4 shrink-0 text-slate transition-transform duration-200"
        :class="{ 'rotate-180': dropdownOpen }"
        aria-hidden="true"
      />
    </button>

    <!-- Dropdown Start -->
    <div
      v-if="dropdownOpen"
      id="user-menu-dropdown"
      class="absolute end-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-2.5rem))] rounded-lg border border-hairline bg-canvas p-2 shadow-theme-lg animate-fadeIn dark:bg-surface"
    >
      <!-- User Info -->
      <div class="px-3 py-2">
        <span class="block truncate text-theme-sm font-medium text-ink dark:text-gray-200">
          {{ auth.profile?.fullName ?? 'Signed in' }}
        </span>
        <span class="mt-0.5 block truncate text-theme-xs text-slate">
          {{ auth.profile?.email ?? '' }}
        </span>
      </div>

      <!-- Menu Items -->
      <ul class="flex flex-col gap-0.5 border-t border-hairline-soft pt-2" aria-label="Account">
        <li>
          <RouterLink
            to="/profile"
            class="group flex items-center gap-3 rounded-md px-3 py-2 text-theme-sm font-medium text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
            @click="closeDropdown"
          >
            <UserRound class="size-4 shrink-0 text-slate dark:text-gray-400" aria-hidden="true" />
            Profile
          </RouterLink>
        </li>
        <li>
          <!--
            Not a second copy of "Profile". The profile screen owns its own
            security section, so the deep link lands on the password form rather
            than making the user hunt for it. The two used to point at the same
            bare `/profile`.
          -->
          <RouterLink
            to="/profile#security"
            class="group flex items-center gap-3 rounded-md px-3 py-2 text-theme-sm font-medium text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
            @click="closeDropdown"
          >
            <ShieldCheck class="size-4 shrink-0 text-slate dark:text-gray-400" aria-hidden="true" />
            Account settings
          </RouterLink>
        </li>
      </ul>

      <!--
        Language preference.

        This is a preference, not a translation control. There is no i18n library
        and no string table in this project, so picking "Filipino" does not — and
        cannot — change a single word on screen. The control says so rather than
        implying otherwise, and it never renders a flag: a flag names a country,
        not a language, which is why "Arabic" is being dropped rather than kept
        with a Saudi flag next to it.
      -->
      <div class="mt-2 border-t border-hairline-soft px-3 pt-3">
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-2 text-theme-xs font-medium text-slate">
            <Languages class="size-4 shrink-0" aria-hidden="true" />
            Language preference
          </span>
          <span
            class="shrink-0 rounded-full border border-hairline bg-surface-soft px-2 py-0.5 text-theme-xs font-medium text-slate dark:bg-white/[0.06]"
          >
            {{ currentLanguage.name }}
          </span>
        </div>

        <fieldset class="mt-2">
          <legend class="sr-only">Language preference</legend>
          <div class="grid grid-cols-2 gap-1.5">
            <label v-for="language in languages" :key="language.id" class="relative block">
              <input
                v-model="languageId"
                type="radio"
                name="user-language"
                :value="language.id"
                class="peer sr-only"
              />
              <span
                class="flex cursor-pointer items-center justify-center rounded-md border border-hairline bg-canvas px-2 py-1.5 text-theme-xs font-medium text-slate transition-colors peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 dark:bg-white/[0.03] dark:text-gray-300 dark:peer-checked:bg-brand-500/15 dark:peer-checked:text-brand-400"
              >
                {{ language.name }}
              </span>
            </label>
          </div>
        </fieldset>

        <p class="mt-2 text-xs leading-relaxed text-slate">
          Saved on this device. Interface translation is not available yet, so the app still reads
          in English.
        </p>
      </div>

      <!--
        Text direction. Kept, because it is real: `setRTL` flips the `dir`
        attribute on <html> and <body> and the whole layout mirrors. Relabelled,
        because "Arabic" implied a language switch that was never there.
      -->
      <div class="mt-2 border-t border-hairline-soft px-3 pt-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-theme-xs font-medium text-slate transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          :aria-pressed="isRtl"
          @click="setDirection(!isRtl)"
        >
          <component
            :is="isRtl ? AlignRight : AlignLeft"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="flex-1 text-start">Text direction</span>
          <span
            class="shrink-0 rounded-full border border-hairline bg-surface-soft px-2 py-0.5 dark:bg-white/[0.06]"
          >
            {{ isRtl ? 'Right to left' : 'Left to right' }}
          </span>
        </button>
        <p class="mt-1 ps-6 text-xs leading-relaxed text-slate">
          Mirrors the layout. It does not translate any text.
        </p>
      </div>

      <!-- Sign Out -->
      <button
        type="button"
        class="group mt-2 flex w-full items-center gap-3 rounded-md border border-hairline px-3 py-2 text-theme-sm font-medium text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
        @click="signOut"
      >
        <LogOut class="size-4 shrink-0 text-slate dark:text-gray-400" aria-hidden="true" />
        Sign out
      </button>
    </div>
    <!-- Dropdown End -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  AlignLeft,
  AlignRight,
  ChevronDown,
  Languages,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-vue-next'
import { useRTL } from '@/composables/useRTL'
import { useAuthStore } from '@/stores/auth'

/**
 * Where the language preference is kept.
 *
 * Documented here rather than inlined at the call site because this is the only
 * thing that would need changing when the preference is promoted from a device
 * setting to a column on `profiles`. `rtl_mode` is a separate key owned by
 * `@/composables/useRTL` and is deliberately not reused.
 */
const LANGUAGE_STORAGE_KEY = 'lms.languagePreference'

interface LanguageOption {
  id: 'en' | 'fil'
  name: string
}

const languages: LanguageOption[] = [
  { id: 'en', name: 'English' },
  { id: 'fil', name: 'Filipino' },
]

const auth = useAuthStore()
const router = useRouter()
const { isRtl, setRTL } = useRTL()

const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

/** Set once an `avatar_url` 404s, so the dead URL is not rendered again. */
const avatarFailed = ref(false)

const firstName = computed(() => auth.profile?.fullName?.split(' ')[0]?.trim() || 'Account')

/** `undefined` rather than `null`, so `:src` accepts it directly. */
const avatarUrl = computed<string | undefined>(() => auth.profile?.avatarUrl ?? undefined)

const showAvatarImage = computed(() => avatarUrl.value !== undefined && !avatarFailed.value)

/**
 * Two letters, or one when the name only has one word.
 *
 * Mirrors the `initials()` helper in `views/admin/Users.vue` so the same person
 * reads the same way in the header and in the users table.
 */
const initials = computed(() => {
  const source = auth.profile?.fullName?.trim() || auth.profile?.email?.trim() || ''
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
})

/**
 * A stable colour per person.
 *
 * Six pairs, chosen by a hash of the name, so two different accounts do not
 * land on the same swatch and the same account lands on the same one every
 * visit. Every pair is a theme token rather than a literal colour, so the dark
 * variants come from the same decision as the rest of the app.
 */
const AVATAR_SWATCHES = [
  'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400',
  'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  'bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-200',
  'bg-surface text-charcoal dark:bg-white/[0.08] dark:text-gray-200',
] as const

const avatarFallbackClass = computed(() => {
  const source = auth.profile?.fullName ?? auth.profile?.email ?? ''
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0
  }
  return AVATAR_SWATCHES[hash % AVATAR_SWATCHES.length]
})

function readStoredLanguage(): LanguageOption['id'] {
  if (typeof localStorage === 'undefined') return 'en'
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return languages.some((language) => language.id === saved)
    ? (saved as LanguageOption['id'])
    : 'en'
}

const languageId = ref<LanguageOption['id']>(readStoredLanguage())

const currentLanguage = computed(
  () => languages.find((language) => language.id === languageId.value) ?? languages[0],
)

// Writing on change rather than on every render keeps the store out of the
// read path: opening the dropdown cannot write to storage.
watch(languageId, (value) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, value)
  }
})

function setDirection(rtl: boolean): void {
  setRTL(rtl)
}

function toggleDropdown(): void {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown(): void {
  dropdownOpen.value = false
}

/**
 * Sign out for real.
 *
 * This used to only write a console log and close the dropdown. The session
 * survived, so the next navigation guard still saw a signed-in user and the
 * button changed nothing at all.
 */
const signOut = async () => {
  closeDropdown()
  await auth.signOut()
  await router.push({ name: 'login' })
}

function handleClickOutside(event: MouseEvent): void {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !dropdownOpen.value) return
  event.stopPropagation()
  closeDropdown()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

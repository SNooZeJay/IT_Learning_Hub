<template>
  <div ref="dropdownRef" class="relative">
    <!--
      User button.

      The accessible name is set explicitly because the visible content is a first name:
      a screen reader announcing "Joren, button" gives no hint that opening it reveals the
      account menu, which is the only thing the control does. Naming it also gives the
      end-to-end suite a stable handle - matching on the name in the header text broke
      whenever the header rendered a different amount of the name.
    -->
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-1 py-1 text-start transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:hover:bg-white/[0.06] xl:w-auto"
      aria-haspopup="true"
      :aria-expanded="dropdownOpen"
      aria-controls="user-menu-dropdown"
      :aria-label="`Account menu for ${firstName}`"
      @click="toggleDropdown"
    >
      <!--
        The avatar is the profile's own `avatar_url`, or two initials derived
        from the real `full_name`. It used to fall back to
        `/images/user/owner.png`, TailAdmin's bundled photograph of an actual
        person, so every account in the system wore the same stranger's face.
      -->
      <UserAvatar :name="auth.profile?.fullName ?? ''" :src="avatarUrl" size="md" />

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

      <!--
        My profile, Settings, Sign out. Three items, two destinations, one meaning each.

        This menu used to offer "Profile" and "Account settings" - two labels pointing at
        `/profile` and `/profile#security`, which are the same page. The choice carried no
        information, so "Account settings" had to be read as the more comprehensive option
        and was the natural place to look for the password form, the appearance controls
        and the language picker, all three of which lived on that one page.

        They are now genuinely different: /profile is who you are, /settings is how this
        behaves for you. "Account settings" is gone, because the account is not what
        either screen edits - one edits a profile row, the other edits this browser and
        this account's password.
      -->
      <ul class="flex flex-col gap-0.5 border-t border-hairline-soft pt-2" aria-label="Account">
        <li>
          <RouterLink
            to="/profile"
            class="group flex items-center gap-3 rounded-md px-3 py-2 text-theme-sm font-medium text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
            @click="closeDropdown"
          >
            <UserRound class="size-4 shrink-0 text-slate dark:text-gray-400" aria-hidden="true" />
            My profile
          </RouterLink>
        </li>
        <li>
          <RouterLink
            to="/settings"
            class="group flex items-center gap-3 rounded-md px-3 py-2 text-theme-sm font-medium text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
            @click="closeDropdown"
          >
            <Settings class="size-4 shrink-0 text-slate dark:text-gray-400" aria-hidden="true" />
            Settings
          </RouterLink>
        </li>
      </ul>

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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import UserAvatar from '@/components/common/UserAvatar.vue'

const auth = useAuthStore()
const router = useRouter()

const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const firstName = computed(() => auth.profile?.fullName?.split(' ')[0]?.trim() || 'Account')

/** `undefined` rather than `null`, so `:src` accepts it directly. */
const avatarUrl = computed<string | undefined>(() => auth.profile?.avatarUrl ?? undefined)

/**
 * Two language controls are gone from this menu.
 *
 * One lived here as a two-option radio group, and a second lived on the profile page.
 * They wrote two different keys - `lms.languagePreference` and `lms.preferences` - and
 * neither was ever read by anything. There is no i18n library and no string table in this
 * project, so choosing "Filipino" changed no word on screen.
 *
 * Both were honest about it in small print, which does not make them honest controls. A
 * radio group is an assertion that one of the options is in effect; here none of them
 * were. The text-direction control that shared this menu was kept for the opposite
 * reason - it does mirror the whole interface - and now lives in Settings, beside the
 * theme, where the two appearance controls sit together.
 */

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

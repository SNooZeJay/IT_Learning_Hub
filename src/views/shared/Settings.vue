<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="How this LMS looks and behaves for you. Your name, photo and contact details live on My profile."
      :crumbs="[{ label: 'Settings' }]"
    />

    <!--
      The division, stated on the page rather than left to the two titles to imply.

      These two screens get confused because they used to be one screen. A visitor who
      edits their name on one and their password on the other is not misreading anything;
      the application had put both on one page. Saying which is which costs one sentence
      and removes the reason to go looking.
    -->
    <p class="mt-4 max-w-2xl text-sm text-slate">
      <strong class="font-medium text-ink">Settings</strong> is for the experience — appearance and
      security.
      <RouterLink
        to="/profile"
        class="font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        My profile
      </RouterLink>
      is for who you are: your photo, name, contact details and bio.
    </p>

    <div v-if="profile" class="mt-6 flex flex-col gap-6">
      <AppearanceCard />
      <ProfileSecurityCard :profile="profile" />
    </div>

    <LoadingState v-else class="mt-6" label="Loading your account" />

    <!--
      The rest, named.

      A settings page that quietly omits a section leaves the visitor deciding whether the
      absence means "off", "not applicable to me" or "not built yet". Naming the categories
      that do not exist here, and why, answers that without inventing a control for any of
      them.
    -->
    <section
      class="mt-6 rounded-lg border border-hairline bg-canvas p-5 sm:p-6 dark:bg-white/[0.03]"
      aria-labelledby="not-yet-heading"
    >
      <h2 id="not-yet-heading" class="text-theme-xl text-ink">Not here yet</h2>
      <p class="mt-1 text-sm text-slate">
        These are settings people expect to find. None of them is listed as a control here, because
        each would be a switch that changes nothing.
      </p>
      <dl class="mt-4 grid gap-3 sm:grid-cols-2">
        <div v-for="item in ABSENT" :key="item.title" class="rounded-md bg-surface-soft p-3">
          <dt class="text-sm font-medium text-ink">{{ item.title }}</dt>
          <dd class="mt-0.5 text-xs text-slate">{{ item.why }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import AppearanceCard from '@/components/profile/AppearanceCard.vue'
import ProfileSecurityCard from '@/components/profile/ProfileSecurityCard.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * How the LMS behaves for the signed-in person. Not who they are.
 *
 * Everything on this page works. There are no switches here that record a value and
 * change nothing, which is why this page is short: the honest set of preferences in this
 * project is a theme, a text direction, and a password.
 *
 * The security card moved here from the profile page. A password is not a profile
 * detail - it is not shown next to a person's name or photo, and it is not part of how
 * their identity is displayed anywhere in the LMS - so its old home was the wrong one.
 */

const auth = useAuthStore()

const profile = computed(() => auth.profile)

onMounted(async () => {
  // The security card reads `auth.user` for the sign-in address and last sign-in, and
  // `auth.profile` for the name and role. Both are loaded by the guard, but a direct
  // load of this route on a cold refresh can race it, so this waits for the same promise
  // the guard awaited rather than assuming the work is done.
  await auth.ensureReady()
})

/**
 * Categories a settings page would be expected to carry, and the reason each is absent.
 *
 * Written out rather than left unmentioned, because an unlisted section is ambiguous in
 * a way a listed one is not: a visitor cannot tell "I turned this off" from "nobody built
 * this". Every entry below names a real absence, not a missing feature someone forgot to
 * add - there is no preference store, no i18n layer, and no per-user notification
 * configuration anywhere in this project.
 */
const ABSENT: ReadonlyArray<{ title: string; why: string }> = [
  {
    title: 'Notifications',
    why: 'Notifications are not configurable per person. There is no preference record to store a choice in, so every kind is sent to everybody it applies to.',
  },
  {
    title: 'Language',
    why: 'The interface is English only. There is no translation layer, so there is nothing for a language choice to switch between.',
  },
  {
    title: 'Accessibility',
    why: 'Font size, contrast and motion are fixed in the design tokens. Nothing here reads a per-person value, so a control could not alter what is on screen.',
  },
  {
    title: 'Privacy',
    why: 'What is visible about you is decided by your role and your enrolments, not by a setting. The only per-person visibility choice — your profile photo — is on My profile.',
  },
]
</script>

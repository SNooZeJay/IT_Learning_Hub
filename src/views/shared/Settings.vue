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
      <SignInCodeCard :profile="profile" />
      <ProfileSecurityCard :profile="profile" />
    </div>

    <LoadingState v-else class="mt-6" label="Loading your account" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import AppearanceCard from '@/components/profile/AppearanceCard.vue'
import ProfileSecurityCard from '@/components/profile/ProfileSecurityCard.vue'
import SignInCodeCard from '@/components/profile/SignInCodeCard.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * How the LMS behaves for the signed-in person. Not who they are.
 *
 * Everything on this page works. There are no switches here that record a value and
 * change nothing, which is why this page is short: the honest set of preferences in this
 * project is a theme, a text direction, whether signing in needs a code, and a password.
 *
 * The security card moved here from the profile page. A password is not a profile
 * detail - it is not shown next to a person's name or photo, and it is not part of how
 * their identity is displayed anywhere in the LMS - so its old home was the wrong one.
 * The sign-in code is here for the same reason: it is a security setting, not a detail
 * about who somebody is.
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
</script>

<template>
  <section
    class="surface-card p-5 sm:p-6"
    aria-labelledby="security-heading"
  >
    <h2 id="security-heading" class="text-theme-xl text-ink">Security</h2>
    <p class="mt-1 text-sm text-slate">
      Your sign-in address, when you last signed in, and your password.
    </p>

    <!--
      A mismatch is worth surfacing rather than hiding.

      `profiles.email` is a copy of the address in `auth.users` and nothing keeps
      them in step, so the copy can drift from the truth. When it has, this page
      shows the address that actually works for signing in and says the other one
      is stale — rather than presenting two different addresses as if both were
      fine.
    -->
    <Alert
      v-if="mirrorDrifted"
      variant="warning"
      title="Your profile shows a different email address"
      :message="`You sign in as ${signInAddress}, but this profile records ${profile.email}. The sign-in address is the real one; an administrator can correct the profile copy.`"
      class="mt-4"
    />

    <dl class="mt-5 divide-y divide-hairline-soft">
      <!--
        The label is `w-full` on a phone and `sm:w-40` above it, not a flat `w-40
        shrink-0`.

        `shrink-0` refused to give the 160px back, so beside a value like an email
        address the pair needed more than the 358px a 390px phone has inside its
        padding, and the page scrolled 23px sideways. It is the only row on this card
        whose value is an unbounded string, and it is the row that broke.

        Stacking below `sm` also reads correctly: "Sign-in address" above the address
        is a normal description pair, and it is what the row becomes at every width a
        person actually holds a phone at.
      -->
      <div
        v-for="row in facts"
        :key="row.label"
        class="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3"
      >
        <dt class="w-full text-sm text-slate sm:w-40 sm:shrink-0">{{ row.label }}</dt>
        <dd class="min-w-0 flex-1 text-sm font-medium break-words text-ink">
          {{ row.value }}
        </dd>
      </div>
    </dl>

    <div class="mt-6 border-t border-hairline-soft pt-5">
      <h3 class="text-theme-sm text-ink">Change your password</h3>
      <p class="mt-1 text-sm text-slate">
        You are signed in as {{ signInAddress }}, so the new password applies immediately. Keep the
        old one somewhere until you have signed in with the new one.
      </p>

      <div v-if="passwordNotice" aria-live="polite" class="mt-4">
        <Alert
          :variant="passwordNotice.tone"
          :title="passwordNotice.title"
          :message="passwordNotice.text"
        />
      </div>

      <form
        class="mt-4 grid gap-4"
        novalidate
        :aria-busy="isChangingPassword"
        @submit.prevent="changePassword"
      >
        <div>
          <label for="new-password" class="mb-1.5 block text-sm font-medium text-ink">
            New password
          </label>
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            :class="[inputClass, passwordFieldError ? 'border-error-500' : '']"
            :aria-invalid="passwordFieldError ? 'true' : undefined"
            :aria-describedby="
              `new-password-hint ${passwordFieldError ? 'new-password-error' : ''}`.trim()
            "
          />
          <p id="new-password-hint" class="mt-1.5 text-xs text-slate">At least 8 characters.</p>
          <p
            v-if="passwordFieldError"
            id="new-password-error"
            role="alert"
            class="mt-1.5 text-xs text-error-700 dark:text-error-400"
          >
            {{ passwordFieldError }}
          </p>
        </div>

        <div>
          <label for="confirm-password" class="mb-1.5 block text-sm font-medium text-ink">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            :class="[inputClass, confirmError ? 'border-error-500' : '']"
            :aria-invalid="confirmError ? 'true' : undefined"
            :aria-describedby="confirmError ? 'confirm-password-error' : undefined"
          />
          <p
            v-if="confirmError"
            id="confirm-password-error"
            role="alert"
            class="mt-1.5 text-xs text-error-700 dark:text-error-400"
          >
            {{ confirmError }}
          </p>
        </div>

        <div>
          <Button type="submit" :disabled="isChangingPassword">
            <LoaderCircle
              v-if="isChangingPassword"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            {{ isChangingPassword ? 'Updating...' : 'Update password' }}
          </Button>
        </div>
      </form>

      <div class="mt-5 border-t border-hairline-soft pt-5">
        <p class="text-sm font-medium text-ink">Locked out?</p>
        <p class="mt-1 text-sm text-slate">
          Send yourself a reset link instead, and use it to choose a new password.
        </p>

        <div v-if="resetNotice" aria-live="polite" class="mt-3">
          <Alert
            :variant="resetNotice.tone"
            :title="resetNotice.title"
            :message="resetNotice.text"
          />
        </div>

        <button
          type="button"
          :disabled="isSendingReset"
          class="mt-3 inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.03]"
          @click="sendResetLink"
        >
          <LoaderCircle v-if="isSendingReset" class="size-4 animate-spin" aria-hidden="true" />
          <Mail v-else class="size-4" aria-hidden="true" />
          {{ isSendingReset ? 'Sending...' : 'Email me a reset link' }}
        </button>
      </div>
    </div>

    <!--
      What the two actions above actually do to a session, stated plainly.

      A password change is not a sign-out. Somebody who has taken a session
      elsewhere keeps it until that token expires, and a page that implied
      otherwise would leave a real risk unmentioned. Signing out, on the other
      hand, is broader than it looks: supabase-js defaults `signOut` to
      `scope: 'global'`, which revokes the account's refresh tokens rather than
      only this browser's.
    -->
    <p class="mt-5 border-t border-hairline-soft pt-5 text-xs text-slate">
      Changing your password does not sign you out anywhere else — a session already open on another
      device stays valid until it expires. Signing out from the menu is broader than it looks: it
      revokes this account's refresh tokens, so every browser is asked to sign in again. Your
      profile and your results are untouched either way.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { LoaderCircle, Mail } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/types'
import type { Profile } from '@/types'
import { useToast } from '@/composables/useToast'

/**
 * The account facts a person can genuinely read about themselves, and the two
 * things they can genuinely change.
 *
 * Everything here comes from the session the browser already holds. Nothing is
 * invented: no "trusted device" list, because `auth.users` is not readable from
 * a browser session, and no "last password change", because nothing records one.
 */
const props = defineProps<{ profile: Profile }>()

const auth = useAuthStore()
const toast = useToast()

const newPassword = ref('')
const confirmPassword = ref('')
const passwordFieldError = ref('')
const confirmError = ref('')
const isChangingPassword = ref(false)
const isSendingReset = ref(false)

type Notice = { tone: 'success' | 'error'; title: string; text: string }
const passwordNotice = ref<Notice | null>(null)
const resetNotice = ref<Notice | null>(null)

/** The address that actually signs in, which is not necessarily the one on file. */
const signInAddress = computed(() => auth.user?.email ?? props.profile.email)

const mirrorDrifted = computed(() => {
  const stored = props.profile.email.trim().toLowerCase()
  const actual = signInAddress.value.trim().toLowerCase()
  return stored !== '' && actual !== '' && stored !== actual
})

const facts = computed<Array<{ label: string; value: string }>>(() => {
  const user = auth.user
  const session = auth.session

  return [
    { label: 'Sign-in address', value: signInAddress.value },
    {
      label: 'Email confirmed',
      value: user?.email_confirmed_at
        ? formatDateTime(user.email_confirmed_at)
        : 'Not confirmed yet',
    },
    {
      label: 'Last sign-in',
      value: user?.last_sign_in_at
        ? formatDateTime(user.last_sign_in_at)
        : 'This is your first one',
    },
    {
      // `expires_at` is a Unix second count, not an ISO string, so it cannot go
      // through the shared formatter directly.
      label: 'Session expires',
      value: session?.expires_at
        ? `${formatDateTime(new Date(session.expires_at * 1000).toISOString())} (refreshed automatically while this tab is open)`
        : 'No active session',
    },
    {
      label: 'Account created',
      value: user?.created_at ? formatDateTime(user.created_at) : 'Unknown',
    },
    {
      label: 'Signed in with',
      value: user?.app_metadata?.provider
        ? capitalise(String(user.app_metadata.provider))
        : 'Email',
    },
    {
      label: 'Phone',
      // `profiles.phone` is a contact detail for an instructor. There is no SMS
      // sign-in in this project, so saying "verified" about it would be a claim
      // the backend never made.
      value: props.profile.phone ?? 'Not set',
    },
  ]
})

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const inputClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:bg-white/[0.03]'

async function changePassword(): Promise<void> {
  passwordFieldError.value = ''
  confirmError.value = ''
  passwordNotice.value = null

  if (newPassword.value.length < 8) {
    passwordFieldError.value = 'Use at least 8 characters.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    confirmError.value = 'The two passwords do not match.'
    return
  }

  isChangingPassword.value = true
  try {
    await auth.updatePassword(newPassword.value)
    newPassword.value = ''
    confirmPassword.value = ''
    passwordNotice.value = {
      tone: 'success',
      title: 'Password changed',
      text: 'It applies from now. Any other device already signed in keeps its session until that session expires.',
    }
    toast.success(
      'Password changed',
      'It applies from now. Any other device already signed in keeps its session until that session expires.',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Try again in a moment.'
    passwordNotice.value = {
      tone: 'error',
      title: 'The password was not changed',
      text: message,
    }
    toast.error('The password was not changed', message)
  } finally {
    isChangingPassword.value = false
  }
}

async function sendResetLink(): Promise<void> {
  resetNotice.value = null
  isSendingReset.value = true
  try {
    await auth.sendPasswordReset(signInAddress.value)
    // Never "we could not find that address". The edge function answers the
    // same way either way, on purpose, and saying otherwise here would undo
    // that: this form would become a way to test whether an address has an
    // account.
    resetNotice.value = {
      tone: 'success',
      title: 'Reset link sent',
      text: `If ${signInAddress.value} has an account, a reset link is on its way. This page cannot tell you whether it does — that would let anyone test other people's addresses.`,
    }
  } catch (error) {
    resetNotice.value = {
      tone: 'error',
      title: 'The reset link was not sent',
      text: error instanceof Error ? error.message : 'Try again in a moment.',
    }
  } finally {
    isSendingReset.value = false
  }
}
</script>

<template>
  <AuthShell title="Choose a new password">
    <!--
        Three different situations produce a URL that cannot render this form, and
        "not valid" was the answer to all three. They are now separated, because
        the remedy differs for each:

          still-checking  the recovery token is being exchanged right now. Saying
                         "not valid" here is the bug itself - the original version
                         read `auth.isAuthenticated` once, immediately, and the
                         exchange had not finished, so a working link was declared
                         dead. The reload that "fixed" it was the token already
                         being spent from storage.
          expired         a real link that has been spent or timed out. The only
                         useful thing to offer is another one.
          no-token        the URL never carried a token. This is what an in-app
                         webview produces when it strips the fragment, and what
                         somebody gets by typing the path directly. Nothing to
                         retry - the answer is to open the link from the email.
    -->
    <Alert
      v-if="status === 'checking'"
      variant="info"
      title="Checking your reset link"
      message="One moment while we confirm the link from your email."
      class="mb-5"
    />

    <Alert
      v-else-if="status === 'expired'"
      variant="warning"
      title="This reset link has expired"
      :message="
        detail || 'Reset links last one hour and work only once. Send yourself a new one below.'
      "
      class="mb-5"
    />

    <Alert
      v-else-if="status === 'no-token'"
      variant="warning"
      title="This page needs a link from your email"
      :message="detail"
      class="mb-5"
    />

    <Alert
      v-else-if="status === 'failed'"
      variant="error"
      title="Something went wrong with this link"
      :message="detail || 'Send yourself a new link below and try that one.'"
      class="mb-5"
    />

    <Alert
      v-if="saved"
      variant="success"
      title="Password updated"
      message="You are signed in with your new password."
      class="mb-5"
    />
    <Alert
      v-else-if="errorMessage"
      variant="error"
      title="Could not update your password"
      :message="errorMessage"
      class="mb-5"
    />

    <Alert
      v-if="resentMessage"
      variant="success"
      title="Check your inbox"
      :message="resentMessage"
      class="mb-5"
    />

    <form
      v-if="hasRecoverySession && !saved"
      class="flex flex-col gap-5"
      novalidate
      @submit.prevent="handleSubmit"
    >
      <div>
        <label :for="password" :class="fieldLabelClass">New password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          name="password"
          placeholder="......"
          autocomplete="new-password"
          required
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.password)"
          :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
        />
        <p
          v-if="fieldErrors.password"
          id="password-error"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.password }}
        </p>
      </div>

      <div>
        <label :for="confirmPassword" :class="fieldLabelClass">Confirm new password</label>
        <input
          id="confirmPassword"
          v-model="confirmPassword"
          type="password"
          name="confirmPassword"
          placeholder="......"
          autocomplete="new-password"
          required
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.confirmPassword)"
          :aria-describedby="fieldErrors.confirmPassword ? 'confirm-error' : undefined"
        />
        <p
          v-if="fieldErrors.confirmPassword"
          id="confirm-error"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.confirmPassword }}
        </p>
      </div>

      <!--
        A native button rather than `Button.vue`, for the reason given on the
        sign-in page: that component's `primary` variant is `bg-brand-500` and
        none of its variants are legible on this page's cream card.
      -->
      <button
        type="submit"
        class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lp-ink px-7 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isSubmitting"
      >
        <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" aria-hidden="true" />
        {{ isSubmitting ? 'Saving...' : 'Save new password' }}
      </button>
    </form>

    <!--
      The old dead end.

      This page used to offer exactly one way out - "Back to sign in" - to somebody
      whose link had expired. Sending them to the sign-in form is the wrong remedy:
      they have forgotten their password, which is the entire reason they are here.
      The one action that actually helps is asking for another link, so that is the
      action this state offers.
    -->
    <form
      v-if="!hasRecoverySession && !saved"
      class="mt-2 flex flex-col gap-4"
      novalidate
      @submit.prevent="handleResend"
    >
      <p class="text-sm text-lp-slate">
        {{ status === 'checking' ? 'Checking your link...' : 'Send yourself a new reset link' }}
      </p>
      <div>
        <label for="resendEmail" :class="fieldLabelClass">Email address</label>
        <input
          id="resendEmail"
          v-model="resendEmail"
          type="email"
          name="resendEmail"
          placeholder="you@email.com"
          autocomplete="email"
          required
          :class="inputClass"
        />
      </div>
      <button
        type="submit"
        class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lp-ink px-7 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isResending || status === 'checking'"
      >
        <LoaderCircle v-if="isResending" class="size-4 animate-spin" aria-hidden="true" />
        {{ isResending ? 'Sending...' : 'Send a new link' }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-lp-slate">
      <router-link to="/auth/login" class="font-medium text-lp-accent hover:underline">
        Back to sign in
      </router-link>
    </p>
  </AuthShell>
</template>

<script setup lang="ts">
import { describeSupabaseError } from '@/services/supabase/client'
import { onMounted, ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import { lpFieldLabelClass, lpTextInputClass } from '@/components/ui/controlClasses'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'
import type { RecoverySessionOutcome } from '@/stores/auth'

const auth = useAuthStore()

/** Aliased for the same reason as on `ForgotPassword` - see the note there. */
const fieldLabelClass = lpFieldLabelClass

const password = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)
const saved = ref(false)
const errorMessage = ref('')
const hasRecoverySession = ref(false)
const fieldErrors = ref<{ password?: string; confirmPassword?: string }>({})

/** Which of the four situations the link turned out to be. */
const status = ref<RecoverySessionOutcome['status'] | 'checking'>('checking')
const detail = ref('')

const resendEmail = ref('')
const isResending = ref(false)
const resentMessage = ref('')

const MIN_PASSWORD_LENGTH = 8

const inputClass = lpTextInputClass

onMounted(async () => {
  const outcome = await auth.waitForRecoverySession()
  status.value = outcome.status
  // `ready` carries no detail - there is nothing to explain when it worked.
  detail.value = 'detail' in outcome ? outcome.detail : ''
  hasRecoverySession.value = outcome.status === 'ready'

  // Pre-fill the resend field when we know who the link was for. `session` is only
  // read on the 'expired' and 'no-token' paths, where a previous session may still
  // be present from a normal sign-in - it is a convenience for the field, never the
  // authority on who the link belongs to.
  if (!hasRecoverySession.value && auth.user?.email) {
    resendEmail.value = auth.user.email
  }
})

function validate(): boolean {
  const errors: { password?: string; confirmPassword?: string } = {}
  if (password.value.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (confirmPassword.value !== password.value) {
    errors.confirmPassword = 'The two passwords do not match.'
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!validate()) return

  isSubmitting.value = true
  try {
    await auth.updatePassword(password.value)
    saved.value = true
  } catch (error) {
    errorMessage.value = describeSupabaseError(
      error,
      'That password could not be saved. Please try again in a moment.',
    )
  } finally {
    isSubmitting.value = false
  }
}

/**
 * Ask for another reset link.
 *
 * The failure this replaces was silence: an expired link left the person staring
 * at a form that would never submit and a link back to a sign-in page they could
 * not get past. This is the action that unblocks them.
 */
async function handleResend(): Promise<void> {
  resentMessage.value = ''
  const email = resendEmail.value.trim()
  if (!email) return

  isResending.value = true
  try {
    await auth.sendPasswordReset(email)
    // Deliberately the same wording whatever happened. `sendPasswordReset` does not
    // reveal whether an account exists, and this view must not become the oracle
    // that does - see the note in the auth store.
    resentMessage.value = 'If that address has an account, a new reset link is on its way.'
  } catch (error) {
    errorMessage.value = describeSupabaseError(
      error,
      'That reset link could not be sent. Please try again in a moment.',
    )
  } finally {
    isResending.value = false
  }
}
</script>

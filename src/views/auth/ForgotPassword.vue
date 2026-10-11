<template>
  <AuthShell
    title="Reset your password"
    description="Enter the email you signed up with and we will send you a reset link."
  >
    <Alert
      v-if="sent"
      variant="success"
      title="Check your inbox"
      message="If an account exists for that address, a reset link is on its way. The link expires after one hour."
      class="mb-5"
    />
    <Alert
      v-else-if="errorMessage"
      variant="error"
      title="Could not send the reset link"
      :message="errorMessage"
      class="mb-5"
    />

    <form v-if="!sent" class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">
      <div>
        <Label for="email">Email address</Label>
        <Input
          id="email"
          v-model.trim="email"
          type="email"
          name="email"
          autocomplete="email"
          required
          placeholder="you@email.com"
          :aria-invalid="Boolean(fieldErrors.email)"
          aria-describedby="email-hint email-error"
        />
        <p id="email-hint" class="mt-1.5 text-xs text-lp-slate">
          We will email you a link to choose a new password.
        </p>
        <p
          v-if="fieldErrors.email"
          id="email-error"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.email }}
        </p>
      </div>

      <!--
        A native button rather than `Button.vue`. That component's `primary`
        variant is `bg-brand-500`, so it was the one purple element left on the
        auth surface, and there is no variant of it legible on a cream card.
        See the note on the sign-in page's submit button.
      -->
      <button
        type="submit"
        class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lp-ink px-7 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isSubmitting"
      >
        <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" aria-hidden="true" />
        {{ isSubmitting ? 'Sending...' : 'Send reset link' }}
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
import { ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'
import { Input } from '@/components/public/ui/input'
import { Label } from '@/components/public/ui/label'

const auth = useAuthStore()

/*
  Aliased rather than renaming the template binding. These two pages used the
  imported name directly, with no local alias, so renaming the import alone left
  `fieldLabelClass` undefined in the template - which type-check caught. Login
  and Register already aliased, and both now alias the same way.
*/

const email = ref('')
const isSubmitting = ref(false)
const sent = ref(false)
const errorMessage = ref('')

/**
  Per-field messages, so the input itself can say what is wrong.

  This page is the one form in the set that had only a page-level alert.
  An Alert above the form tells a sighted user the request failed; to a screen
  reader, and to anyone tabbing straight to the field, the field itself said
  nothing - no aria-invalid, and nothing pointed at the message. So the same
  message is now carried by the control as well.
 */
const fieldErrors = ref<{ email?: string }>({})

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!email.value) return

  isSubmitting.value = true
  try {
    await auth.sendPasswordReset(email.value)
    sent.value = true
  } catch (error) {
    fieldErrors.value = { email: 'That email could not be found on an IT Learning Hub account.' }
    errorMessage.value = describeSupabaseError(
      error,
      'That reset email could not be sent. Please try again in a moment.',
    )
  } finally {
    isSubmitting.value = false
  }
}
</script>

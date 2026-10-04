<template>
  <AuthShell title="Choose a new password">
    <!--
        Supabase puts a recovery token in the URL fragment, not the query string.
        If it is missing there is no recovery session, so submitting a new
        password could never succeed. Say that plainly instead of showing a form
        that silently fails.
      -->
    <Alert
      v-if="!hasRecoverySession"
      variant="warning"
      title="This reset link is not valid"
      message="Open the link from your email on this device. Links expire after one hour and can only be used once."
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

    <form
      v-if="hasRecoverySession && !saved"
      class="flex flex-col gap-5"
      novalidate
      @submit.prevent="handleSubmit"
    >
      <div>
        <label
          for="password"
          class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          New password
        </label>
        <input
          id="password"
          v-model="password"
          type="password"
          name="password"
          autocomplete="new-password"
          required
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.password)"
        />
        <p v-if="fieldErrors.password" class="mt-1.5 text-xs text-error-600 dark:text-error-400">
          {{ fieldErrors.password }}
        </p>
      </div>

      <div>
        <label
          for="confirmPassword"
          class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          v-model="confirmPassword"
          type="password"
          name="confirmPassword"
          autocomplete="new-password"
          required
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.confirmPassword)"
        />
        <p
          v-if="fieldErrors.confirmPassword"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.confirmPassword }}
        </p>
      </div>

      <Button type="submit" class="w-full justify-center" :disabled="isSubmitting">
        <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" />
        {{ isSubmitting ? 'Saving...' : 'Save new password' }}
      </Button>
    </form>

    <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
      <router-link
        to="/auth/login"
        class="font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Back to sign in
      </router-link>
    </p>
  </AuthShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const password = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)
const saved = ref(false)
const errorMessage = ref('')
const hasRecoverySession = ref(false)
const fieldErrors = ref<{ password?: string; confirmPassword?: string }>({})

const MIN_PASSWORD_LENGTH = 8

const inputClass =
  'w-full rounded border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

onMounted(async () => {
  // getSession picks up the recovery token that detectSessionInUrl already
  // exchanged for a session.
  await auth.ensureReady()
  hasRecoverySession.value = auth.isAuthenticated
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
    errorMessage.value =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

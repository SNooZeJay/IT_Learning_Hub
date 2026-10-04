<template>
  <div class="relative isolate flex min-h-screen items-center justify-center overflow-hidden">
    <CommonGridShape />

    <div class="relative w-full max-w-md px-4 py-10">
      <div class="mb-8 flex flex-col items-center text-center">
        <img src="/images/logo/logo-icon.svg" alt="IT Learning Hub" class="size-12" />
        <h1 class="mt-4 text-title-lg text-gray-900 dark:text-white/90">Reset your password</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enter the email you signed up with and we will send you a reset link.
        </p>
      </div>

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
          <label for="email" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email address
          </label>
          <input
            id="email"
            v-model.trim="email"
            type="email"
            name="email"
            autocomplete="email"
            required
            placeholder="you@school.edu.ph"
            :class="inputClass"
          />
        </div>

        <Button type="submit" class="w-full justify-center" :disabled="isSubmitting">
          <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" />
          {{ isSubmitting ? 'Sending...' : 'Send reset link' }}
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import CommonGridShape from '@/components/common/CommonGridShape.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const email = ref('')
const isSubmitting = ref(false)
const sent = ref(false)
const errorMessage = ref('')

const inputClass =
  'w-full rounded border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!email.value) return

  isSubmitting.value = true
  try {
    await auth.sendPasswordReset(email.value)
    sent.value = true
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>
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
        <label :for="email" :class="fieldLabelClass">Email address</label>
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

    <p class="mt-6 text-center text-sm text-slate">
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
import { describeSupabaseError } from '@/services/supabase/client'
import { ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import { fieldLabelClass, textInputClass } from '@/components/ui/controlClasses'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const email = ref('')
const isSubmitting = ref(false)
const sent = ref(false)
const errorMessage = ref('')

const inputClass = textInputClass

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!email.value) return

  isSubmitting.value = true
  try {
    await auth.sendPasswordReset(email.value)
    sent.value = true
  } catch (error) {
    errorMessage.value = describeSupabaseError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

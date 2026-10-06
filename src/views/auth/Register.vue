<template>
  <AuthShell
    title="Create your account"
    description="New accounts start as a student. An administrator can promote you later."
  >
    <Alert
      v-if="errorMessage"
      variant="error"
      title="Could not create your account"
      :message="errorMessage"
      class="mb-5"
    />

    <!--
        Shown instead of the form when the project requires email confirmation.
        Signing in before confirming would leave a user staring at a form that
        cannot possibly work yet, so this replaces it outright.
      -->
    <div
      v-if="needsEmailConfirmation"
      class="rounded-lg border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]"
      role="status"
    >
      <span
        class="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
      >
        <MailCheck class="size-6" aria-hidden="true" />
      </span>
      <h2 class="text-base font-medium text-gray-900 dark:text-white/90">Check your email</h2>
      <p class="mt-1 text-sm text-slate">
        We sent a confirmation link to <span class="font-medium">{{ email }}</span
        >. Open it to activate your account, then sign in.
      </p>
      <router-link
        to="/auth/login"
        class="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Back to sign in
      </router-link>
    </div>

    <form v-else class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">
      <div>
        <label :for="fullName" :class="fieldLabelClass">Full name</label>
        <input
          id="fullName"
          v-model.trim="fullName"
          type="text"
          name="name"
          autocomplete="name"
          required
          placeholder="Juan Dela Cruz"
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.fullName)"
          :aria-describedby="fieldErrors.fullName ? 'name-error' : undefined"
        />
        <p
          v-if="fieldErrors.fullName"
          id="name-error"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.fullName }}
        </p>
      </div>

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
          :aria-invalid="Boolean(fieldErrors.email)"
          :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
        />
        <p
          v-if="fieldErrors.email"
          id="email-error"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.email }}
        </p>
      </div>

      <div>
        <label :for="password" :class="fieldLabelClass">Password</label>
        <div class="relative">
          <input
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            autocomplete="new-password"
            required
            :class="[inputClass, 'pe-12']"
            :aria-invalid="Boolean(fieldErrors.password)"
            :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
          />
          <!--
            Full-height, 44px wide, corner-matched to the field with `rounded-e-md`.
            It used to be `px-3` hugging a 20px glyph, which measured about 28px of
            hit area sitting inside a 48px field and left the eye hunting for it.
          -->
          <button
            type="button"
            class="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-slate transition-colors hover:text-ink dark:text-gray-400 dark:hover:text-gray-200"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" class="size-5" aria-hidden="true" />
            <Eye v-else class="size-5" aria-hidden="true" />
          </button>
        </div>
        <p
          v-if="fieldErrors.password"
          id="password-error"
          class="mt-1.5 text-xs text-error-600 dark:text-error-400"
        >
          {{ fieldErrors.password }}
        </p>
      </div>

      <div>
        <label :for="confirmPassword" :class="fieldLabelClass">Confirm password</label>
        <input
          id="confirmPassword"
          v-model="confirmPassword"
          type="password"
          name="confirmPassword"
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

      <Button type="submit" class="w-full justify-center" :disabled="isSubmitting">
        <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" aria-hidden="true" />
        {{ isSubmitting ? 'Creating account...' : 'Create account' }}
      </Button>
    </form>

    <p class="mt-6 text-center text-sm text-slate">
      Already have an account?
      <router-link
        to="/auth/login"
        class="font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Sign in
      </router-link>
    </p>
  </AuthShell>
</template>

<script setup lang="ts">
import { describeSupabaseError } from '@/services/supabase/client'
import { ref } from 'vue'
import { Eye, EyeOff, LoaderCircle, MailCheck } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import { fieldLabelClass, textInputClass } from '@/components/ui/controlClasses'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const toast = useToast()

const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const needsEmailConfirmation = ref(false)
const fieldErrors = ref<{
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}>({})

const inputClass = textInputClass

/**
 * The only place a password policy is expressed. Supabase enforces its own
 * minimum length too; this catches the obvious cases before a round trip.
 */
const MIN_PASSWORD_LENGTH = 8

function validate(): boolean {
  const errors: typeof fieldErrors.value = {}
  if (!fullName.value) {
    errors.fullName = 'Enter your full name.'
  }
  if (!email.value) {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    errors.email = 'That does not look like an email address.'
  }
  if (!password.value) {
    errors.password = 'Choose a password.'
  } else if (password.value.length < MIN_PASSWORD_LENGTH) {
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
    const result = await auth.signUp(email.value, password.value, fullName.value)
    needsEmailConfirmation.value = result.needsEmailConfirmation
    toast.success(
      'Account created',
      result.needsEmailConfirmation
        ? 'Check your inbox to confirm your email before signing in.'
        : 'Your account is ready.',
    )
  } catch (error) {
    const message = describeSupabaseError(error)
    errorMessage.value = message
    toast.error('Could not create your account', message)
  } finally {
    isSubmitting.value = false
  }
}
</script>

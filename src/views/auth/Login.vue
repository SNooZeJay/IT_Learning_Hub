<template>
  <div class="relative isolate flex min-h-screen items-center justify-center overflow-hidden">
    <CommonGridShape />

    <div class="relative w-full max-w-md px-4 py-10">
      <div class="mb-8 flex flex-col items-center text-center">
        <img src="/images/logo/logo-icon.svg" alt="IT Learning Hub" class="size-12" />
        <h1 class="mt-4 text-title-lg text-gray-900 dark:text-white/90">Welcome back</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Sign in to continue your learning.
        </p>
      </div>

      <Alert
        v-if="errorMessage"
        variant="error"
        title="Could not sign in"
        :message="errorMessage"
        class="mb-5"
      />

      <form class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">
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
            :aria-invalid="Boolean(fieldErrors.email)"
            :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
          />
          <p v-if="fieldErrors.email" id="email-error" class="mt-1.5 text-xs text-error-600 dark:text-error-400">
            {{ fieldErrors.email }}
          </p>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <router-link
              to="/auth/forgot-password"
              class="text-xs text-brand-600 hover:underline dark:text-brand-400"
            >
              Forgot password?
            </router-link>
          </div>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              required
              :class="[inputClass, 'pe-11']"
              :aria-invalid="Boolean(fieldErrors.password)"
              :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
            />
            <button
              type="button"
              class="absolute inset-y-0 end-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="size-5" />
              <Eye v-else class="size-5" />
            </button>
          </div>
          <p v-if="fieldErrors.password" id="password-error" class="mt-1.5 text-xs text-error-600 dark:text-error-400">
            {{ fieldErrors.password }}
          </p>
        </div>

        <label class="flex cursor-pointer items-center gap-2.5 text-sm text-gray-600 dark:text-gray-400">
          <input
            v-model="rememberMe"
            type="checkbox"
            class="size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
          />
          Keep me signed in
        </label>

        <Button type="submit" class="w-full justify-center" :disabled="isSubmitting">
          <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" />
          {{ isSubmitting ? 'Signing in...' : 'Sign in' }}
        </Button>
      </form>

      <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        New to IT Learning Hub?
        <router-link
          to="/auth/register"
          class="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Create an account
        </router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import CommonGridShape from '@/components/common/CommonGridShape.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<{ email?: string; password?: string }>({})

const inputClass =
  'w-full rounded border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

/** Client-side checks for a fast response. Supabase remains the real authority. */
function validate(): boolean {
  const errors: { email?: string; password?: string } = {}
  if (!email.value) {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    errors.email = 'That does not look like an email address.'
  }
  if (!password.value) {
    errors.password = 'Enter your password.'
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!validate()) return

  isSubmitting.value = true
  try {
    await auth.signIn(email.value, password.value)
    // Honour the ?redirect= the guard attached, but never bounce someone into a
    // role they cannot use. A guessed path would land on a redirect loop.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      await router.replace(redirect)
    } else {
      await router.replace(auth.homePath)
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>
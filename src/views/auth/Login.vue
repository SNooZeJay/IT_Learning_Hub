<template>
  <AuthShell
    :title="challenge ? 'Check your email' : 'Welcome back'"
    :description="
      challenge
        ? 'Enter the six-digit code we sent you to finish signing in.'
        : 'Sign in to continue your learning.'
    "
  >
    <!--
      Step two of sign-in. The code step is its own component rather than a second form
      in this file: it has its own submitting state, its own countdown and its own error
      vocabulary, and folding it in here is what made a previous version of this page
      unreadable.
    -->
    <VerifyCodeStep
      v-if="challenge"
      :challenge="challenge"
      :email="email"
      @verified="completeSignIn"
      @back="challenge = null"
    />

    <template v-else>
      <Alert
        v-if="errorMessage"
        variant="error"
        title="Could not sign in"
        :message="errorMessage"
        class="mb-5"
      />

      <form class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">
        <div>
          <label :for="email" :class="fieldLabelClass">Email address</label>
          <input
            id="email"
            v-model.trim="email"
            type="email"
            name="email"
            autocomplete="email"
            required
            placeholder="you@email.com"
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
          <div class="mb-2 flex items-center justify-between gap-3">
            <label :for="password" class="block text-sm font-medium text-lp-ink"> Password </label>
            <router-link
              to="/auth/forgot-password"
              class="text-xs font-medium text-lp-accent hover:underline"
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
              placeholder="......"
              autocomplete="current-password"
              required
              :class="[inputClass, 'pe-12']"
              :aria-invalid="Boolean(fieldErrors.password)"
              :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
            />
            <!--
            44px wide and the full height of the field beside it, because this is a
            tap target on a phone and `px-3` around a 20px glyph measured about 28px
            with the hit area hugging the glyph rather than the field.
            `rounded-e-xl` matches the field's own corner.
          -->
            <button
              type="button"
              class="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-lp-slate transition-colors hover:text-lp-ink"
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

        <!--
        `accent-lp-accent` rather than `text-brand-600` + `focus:ring-brand-500`.
        A checkbox takes its checked colour from `accent-color`, so one utility
        does the work of four, and it lands on the public pages' green rather
        than the app's purple.
      -->
        <label class="flex cursor-pointer items-center gap-2.5 text-sm text-lp-slate">
          <input
            v-model="rememberMe"
            type="checkbox"
            class="size-4 rounded-sm border-lp-line-strong accent-lp-accent"
          />
          Keep me signed in
        </label>

        <!--
        A native button rather than `Button.vue`.

        That component's `primary` variant is `bg-brand-500` and its `outline`
        variant carries `text-canvas`, which resolves to near-black in dark mode -
        so there was no variant to reuse on this surface, and no safe way to
        override one from a caller: Tailwind resolves two conflicting background
        utilities by their order in the generated stylesheet, not by their order
        in the class attribute. This renders the same element, keeps the same
        `:disabled` behaviour, and wears the landing page's primary button.
      -->
        <button
          type="submit"
          class="lp-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lp-ink px-7 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSubmitting"
        >
          <LoaderCircle v-if="isSubmitting" class="size-4 animate-spin" aria-hidden="true" />
          {{ isSubmitting ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-lp-slate">
        New to IT Learning Hub?
        <router-link to="/auth/register" class="font-medium text-lp-accent hover:underline">
          Create an account
        </router-link>
      </p>

      <AuthConsent variant="signin" />
    </template>
  </AuthShell>
</template>

<script setup lang="ts">
import { describeSupabaseError } from '@/services/supabase/client'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import { lpFieldLabelClass, lpTextInputClass } from '@/components/ui/controlClasses'
import AuthShell from '@/components/auth/AuthShell.vue'
import AuthConsent from '@/components/auth/AuthConsent.vue'
import VerifyCodeStep from '@/views/auth/VerifyCodeStep.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import {
  OTP_MESSAGES,
  requestSignInCode,
  SignInOtpError,
  type SignInChallenge,
} from '@/services/otp.service'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const toast = useToast()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<{ email?: string; password?: string }>({})

/**
 * Non-null once the password has been accepted AND a code is on its way. This is the whole
 * state of "half signed in": a challenge id and nothing else. No session exists until
 * `verifySignInCode` returns one, so there is no window in which the router guard would
 * let this person through.
 *
 * An account with no sign-in code never reaches this. `requestSignInCode` returns a
 * session instead of a challenge, `handleSubmit` completes the sign-in immediately, and
 * the second screen is never rendered.
 */
const challenge = ref<SignInChallenge | null>(null)

const inputClass = lpTextInputClass
const fieldLabelClass = lpFieldLabelClass

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
    // Deliberately not `auth.signIn`. That mints a session in the browser, which would make
    // a code step decorative for any account that has one: the tokens would already exist
    // and the router guard would admit this person before a code was ever asked for.
    // Going through `requestSignInCode` means the password is checked by the server, and
    // for an account with a code turned on, `verify` is the only route to a signed-in
    // state.
    const step = await requestSignInCode(email.value, password.value)

    if (step.kind === 'session') {
      // No code on this account, so the password was the whole sign-in.
      challenge.value = null
      await completeSignIn()
      return
    }

    challenge.value = step.challenge
    toast.info('Code sent', `We emailed a six-digit code to ${email.value}.`)
  } catch (error) {
    const message =
      error instanceof SignInOtpError
        ? OTP_MESSAGES[error.reason]
        : describeSupabaseError(error, 'Signing in did not work. Please try again.')
    errorMessage.value = message
    toast.error('Could not sign in', message)
  } finally {
    isSubmitting.value = false
  }
}

/**
 * Called once the code has been verified and the session written into the Supabase
 * client. The redirect honours the guard's `?redirect=` for the same reason it always
 * did: a guessed path would land somebody in a role they cannot use.
 */
async function completeSignIn(): Promise<void> {
  await auth.ensureReady()
  toast.success('Signed in', 'You are back on IT Learning Hub.')
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    await router.replace(redirect)
  } else {
    await router.replace(auth.homePath)
  }
}
</script>

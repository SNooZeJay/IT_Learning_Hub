<template>
  <form class="flex flex-col gap-5" novalidate @submit.prevent="handleVerify">
    <Alert
      v-if="errorMessage"
      :variant="expired ? 'warning' : 'error'"
      :title="expired ? 'That code has expired' : 'Could not verify'"
      :message="errorMessage"
      class="mb-5"
    />

    <div>
      <label for="otp-code" :class="fieldLabelClass">Sign-in code</label>
      <input
        id="otp-code"
        v-model="code"
        type="text"
        name="otp-code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="000000"
        autofocus
        :class="[inputClass, 'text-center text-lg tracking-[0.4em] font-semibold tabular-nums']"
        :aria-invalid="Boolean(errorMessage)"
        :aria-describedby="errorMessage ? 'otp-error' : 'otp-hint'"
      />
      <p v-if="errorMessage" id="otp-error" class="mt-1.5 text-xs text-error-600">
        {{ errorMessage }}
      </p>
      <p v-else id="otp-hint" class="mt-1.5 text-xs text-lp-slate">
        We emailed a six-digit code to {{ maskedEmail }}. It works once and expires in 15 minutes.
      </p>
    </div>

    <!--
      A native button for the same reason as the sign-in button beside it: this page
      wears the landing page's tokens, and `Button.vue`'s variants resolve to the app's
      purple rather than this surface's ink.
    -->
    <button
      type="submit"
      class="lp-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lp-ink px-7 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="isVerifying || code.length !== 6"
    >
      <LoaderCircle v-if="isVerifying" class="size-4 animate-spin" aria-hidden="true" />
      {{ isVerifying ? 'Verifying...' : 'Verify and sign in' }}
    </button>

    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-lp-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isResending || resendCooldown > 0"
        @click="handleResend"
      >
        <LoaderCircle v-if="isResending" class="size-4 animate-spin" aria-hidden="true" />
        <template v-else-if="resendCooldown > 0">Resend in {{ resendCooldown }}s</template>
        <template v-else>Resend code</template>
      </button>

      <button
        type="button"
        class="inline-flex min-h-11 items-center text-sm font-medium text-lp-slate transition-colors hover:text-lp-ink"
        @click="$emit('back')"
      >
        Use a different account
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import { lpFieldLabelClass, lpTextInputClass } from '@/components/ui/controlClasses'
import {
  OTP_MESSAGES,
  resendSignInCode,
  SignInOtpError,
  verifySignInCode,
  type SignInChallenge,
} from '@/services/otp.service'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  challenge: SignInChallenge
  email: string
}>()
const emit = defineEmits<{
  verified: []
  back: []
}>()

const toast = useToast()

const code = ref('')
const isVerifying = ref(false)
const isResending = ref(false)
const errorMessage = ref('')
const expired = ref(false)
const resendCooldown = ref(0)

const inputClass = lpTextInputClass
const fieldLabelClass = lpFieldLabelClass

/**
 * Enough of the address to confirm it is the right one, not enough to be useful on a
 * shared screen. `j••••@ncst.edu.ph` says "that account" without printing the mailbox.
 */
const maskedEmail = computed(() => {
  const [local, domain] = props.email.split('@')
  if (!domain) return props.email
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`
})

/**
 * The countdown is advice, never authority. The server enforces fifteen minutes on every
 * verify, so an edited timer could not buy an extra attempt - it would only mislead the
 * person reading it.
 */
let timer: number | null = null

function startCooldown(seconds: number): void {
  resendCooldown.value = seconds
  if (timer !== null) clearInterval(timer)
  timer = window.setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

onMounted(() => startCooldown(30))
onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer)
})

function describe(error: unknown): { message: string; isExpired: boolean } {
  if (error instanceof SignInOtpError) {
    const base = OTP_MESSAGES[error.reason]
    const message =
      error.attemptsLeft === null || error.attemptsLeft === undefined
        ? base
        : `${base} ${error.attemptsLeft} attempt${error.attemptsLeft === 1 ? '' : 's'} left.`
    return { message, isExpired: error.reason === 'challenge_expired' }
  }
  return { message: 'That code could not be verified. Try again in a moment.', isExpired: false }
}

async function handleVerify(): Promise<void> {
  if (isVerifying.value || code.value.length !== 6) return
  isVerifying.value = true
  errorMessage.value = ''

  try {
    await verifySignInCode(props.challenge.challengeId, code.value)
    toast.success('Signed in', 'Welcome back.')
    emit('verified')
  } catch (error) {
    const described = describe(error)
    errorMessage.value = described.message
    expired.value = described.isExpired
    // Cleared so a wrong code cannot be resubmitted unchanged, and so a correct one is
    // not accepted into a field that has already failed once.
    code.value = ''
    toast.error('Could not verify', described.message)
  } finally {
    isVerifying.value = false
  }
}

async function handleResend(): Promise<void> {
  if (isResending.value || resendCooldown.value > 0) return
  isResending.value = true
  errorMessage.value = ''

  try {
    await resendSignInCode(props.challenge.challengeId)
    startCooldown(30)
    code.value = ''
    toast.success('Code sent', 'Check your inbox for a new six-digit code.')
  } catch (error) {
    const described = describe(error)
    errorMessage.value = described.message
    expired.value = described.isExpired
    toast.error('Could not send a new code', described.message)
  } finally {
    isResending.value = false
  }
}
</script>

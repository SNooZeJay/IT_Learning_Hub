<template>
  <section
    class="rounded-lg border border-hairline bg-canvas p-5 sm:p-6 dark:bg-white/[0.03]"
    aria-labelledby="signin-code-heading"
  >
    <h2 id="signin-code-heading" class="text-theme-xl text-ink">Sign-in code</h2>
    <p class="mt-1 text-sm text-slate">
      Ask for a six-digit code by email every time you sign in. Your password stays necessary either
      way — this adds a second check, it does not replace one.
    </p>

    <!--
      Stated rather than implied, because the failure this prevents is a person who cannot
      get back in. Somebody without a usable inbox on the address they sign in with would
      be locked out, and nothing on this screen could tell them.
    -->
    <Alert
      v-if="!hasSignInAddress"
      variant="warning"
      title="No email address on this account"
      message="A sign-in code is delivered by email, so there is nowhere to send it. Set an email address on My profile first."
      class="mt-4"
    />

    <div
      class="mt-5 flex flex-wrap items-start justify-between gap-4 border-t border-hairline-soft pt-5"
    >
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-ink">
          {{ codeRequired ? 'On' : 'Off' }}
        </p>
        <p class="mt-1 text-sm text-slate">
          <template v-if="codeRequired">
            The next time you sign in, we will email a code to
            <span class="font-medium text-ink">{{ signInAddress }}</span
            >. You will need both your password and that code.
          </template>
          <template v-else>
            You sign in with your password alone. Nothing is emailed. Turn this on if you want a
            code as well.
          </template>
        </p>
      </div>

      <!--
        A 24px-tall track is the right shape for a switch and the wrong target. The
        `before` pseudo-element carries the tap area out to 44px tall without changing
        what is drawn, because this is a control a learner turns on once and then never
        thinks about again - and 24px is where a thumb misses. The pill stays a pill:
        DESIGN.md reserves that radius for status badges, pill tabs, avatars and
        toggles, so the shape is not the thing to fix.
      -->
      <button
        type="button"
        role="switch"
        :aria-checked="codeRequired"
        :aria-label="codeRequired ? 'Turn off the sign-in code' : 'Turn on the sign-in code'"
        :disabled="isSaving || !hasSignInAddress"
        class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        :class="
          codeRequired ? 'border-brand-500 bg-brand-500' : 'border-hairline-strong bg-surface'
        "
        @click="toggle"
      >
        <LoaderCircle
          v-if="isSaving"
          class="absolute inset-0 m-auto size-4 animate-spin text-white"
          aria-hidden="true"
        />
        <span
          v-else
          class="absolute top-0.5 size-4.5 rounded-full bg-white shadow-theme-xs transition-[inset-inline-start]"
          :class="codeRequired ? 'start-5.5' : 'start-0.5'"
        />
      </button>
    </div>

    <div v-if="notice" aria-live="polite" class="mt-4">
      <Alert :variant="notice.tone" :title="notice.title" :message="notice.text" />
    </div>

    <!--
      The one consequence worth spelling out: turning this off does not sign you out, and
      it does not reach any other session. It changes what the *next* sign-in asks for.
    -->
    <p class="mt-4 border-t border-hairline-soft pt-4 text-xs text-slate">
      This changes the next sign-in only. It does not sign you out of this browser, and it does not
      affect any device you are already signed in on. If you think somebody else has your password,
      change it as well.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import type { Profile } from '@/types'

/**
 * The owner's own choice about how their account signs in.
 *
 * Reads the session for the address a code would go to rather than `profiles.email`:
 * the profile copy is allowed to drift, and a code sent to a stale address is a sign-in
 * nobody can finish. The address that actually signs in is the one the code follows.
 *
 * Nothing here can turn two-step sign-in off for anybody else. The write goes through
 * `profiles update own`, which requires `id = auth.uid()`, and this component only ever
 * passes the signed-in person's id.
 */
const props = defineProps<{ profile: Profile }>()

const auth = useAuthStore()
const toast = useToast()

const isSaving = ref(false)

type Notice = { tone: 'success' | 'error'; title: string; text: string }
const notice = ref<Notice | null>(null)

const signInAddress = computed(() => auth.user?.email ?? props.profile.email)
const hasSignInAddress = computed(() => signInAddress.value.trim().length > 0)
const codeRequired = computed(() => props.profile.emailCodeSignIn)

async function toggle(): Promise<void> {
  const next = !codeRequired.value
  isSaving.value = true
  notice.value = null
  try {
    // The store is updated from the row the database returned, so the switch can only
    // show what is actually stored. Optimistically flipping it and hoping is how a
    // security setting ends up displaying the opposite of the truth.
    await auth.setEmailCodeSignIn(next)
    const text = next
      ? `We will email a code to ${signInAddress.value} the next time you sign in.`
      : 'Your password is all you will need from now on.'
    notice.value = {
      tone: 'success',
      title: next ? 'Sign-in code turned on' : 'Sign-in code turned off',
      text,
    }
    toast.success(next ? 'Sign-in code turned on' : 'Sign-in code turned off', text)
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Try again in a moment.'
    notice.value = {
      tone: 'error',
      title: next ? 'The sign-in code was not turned on' : 'The sign-in code was not turned off',
      text,
    }
    toast.error('That change was not saved', text)
  } finally {
    isSaving.value = false
  }
}
</script>

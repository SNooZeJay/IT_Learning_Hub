<template>
  <!--
    Consent, on the sign-in and register forms.

    One component, two wordings. They are not the same sentence because they are not the
    same act: signing in accepts the terms for an account that already exists, while
    registering accepts them for an account being created. "By signing in or registering"
    is the flattest possible version - it asks the reader on one screen to agree to
    something that did not happen - so each page says what it is actually agreeing to.

    Placement is after the submit button and the "other page" link, because that is where a
    reader's eye already is when they finish, and a notice beside the form heading competes
    with the thing they came to do.

    The links open in a new tab. Following a privacy policy from a sign-in form and then
    pressing Back should return you to a form with the email still typed in; navigating away
    and back clears it.
  -->
  <p class="mt-5 text-center text-xs leading-relaxed text-lp-slate">
    {{ lead }}
    <router-link
      to="/legal/terms"
      class="font-medium text-lp-accent underline underline-offset-2 hover:no-underline"
      target="_blank"
      rel="noopener"
      >Terms of Service</router-link
    >
    and our
    <router-link
      to="/legal/privacy"
      class="font-medium text-lp-accent underline underline-offset-2 hover:no-underline"
      target="_blank"
      rel="noopener"
      >Privacy Policy</router-link
    >.
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Presentational, apart from which of the two sentences to use.
 *
 * The landing page's colour tokens, because this renders on the authentication shell,
 * which is that surface. `lp-slate` and `lp-accent` are the two values that stay legible on
 * the warm canvas in both themes.
 */
const props = defineProps<{ variant: 'signin' | 'register' }>()

const SIGN_IN_LEAD = 'By signing in, you agree to our'
const REGISTER_LEAD = 'By creating an account, you agree to our'

const lead = computed(() => (props.variant === 'register' ? REGISTER_LEAD : SIGN_IN_LEAD))
</script>

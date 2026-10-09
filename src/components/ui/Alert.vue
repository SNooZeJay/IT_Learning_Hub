<template>
  <!--
    `role` is not decoration.

    This component is how the whole app reports a failure: a rejected sign-in, a
    refused save, a service that could not be reached. It renders after the fact, in
    response to something the person did, so without a live region it is invisible to a
    screen reader. The visible text appears; nothing is announced. That is the failure
    this attribute prevents, and it was found by an end-to-end test looking for
    `role="alert"` on a deliberately-wrong password and not finding one.

    `alert` for error and warning because those interrupt and demand action.
    `status` for success and info because those are polite, do not interrupt, and are
    announced when the user next pauses - the right register for "saved" versus
    "that did not work".

    `v-if="!dismissed"` rather than a transition wrapper: a dismiss that animates
    out leaves a `role="alert"` node in the accessibility tree for the length of the
    animation, so a live region announces a notice that is already gone. Removing it
    from the tree in the same tick is the honest version.
  -->
  <div
    v-if="!dismissed"
    :role="variant === 'error' || variant === 'warning' ? 'alert' : 'status'"
    :aria-live="variant === 'error' || variant === 'warning' ? 'assertive' : 'polite'"
    :class="[
      'w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-s-4 p-4',
      variantClasses[variant].container,
    ]"
  >
    <div class="flex items-start gap-3">
      <div :class="['-mt-0.5 shrink-0', variantClasses[variant].icon]">
        <component :is="icons[variant]" aria-hidden="true" />
      </div>

      <div class="min-w-0 flex-1">
        <h4 class="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">
          {{ title }}
        </h4>

        <p class="section-subheading">{{ message }}</p>

        <div class="mt-3 flex flex-wrap items-center gap-3">
          <!--
            The action slot.

            This component never declared one, and three call sites passed content into
            it: the admin dashboard's payments panel passed a "Try again" button, and
            the student certificate error state passed a "Back to My grades" link. Vue
            drops content sent to a slot the component does not render, silently - so
            the payments panel showed an error with no way to retry it, and the
            certificate error state was a dead end.

            A failure you cannot recover from on screen is a much worse failure than
            one you can, so the outlet exists now. It renders alongside `showLink`
            rather than replacing it: `showLink` is the declarative form used where the
            destination is static, the slot is for the case where the action is a
            handler.
          -->
          <slot name="action" />
          <slot />

          <router-link
            v-if="showLink"
            :to="linkHref"
            class="inline-flex min-h-6 items-center text-sm font-medium text-slate underline underline-offset-2 hover:text-ink"
          >
            {{ linkText }}
          </router-link>

          <!--
            A notice that can be acted on but not dismissed is a notice the person
            has to reload the page to get rid of. This exists for the checkout
            "payment cancelled" banner, which used to be cleared in exactly one
            place - when the payment eventually settled - so a notice about a
            *cancelled* payment waited for the opposite event and stayed for the
            life of the page.

            The label carries the title so a screen reader announces what is being
            dismissed, not just "dismiss".
          -->
          <button
            v-if="dismissible"
            type="button"
            class="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-slate transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            :aria-label="`Dismiss: ${title}`"
            @click="handleDismiss"
          >
            <X class="size-4" aria-hidden="true" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleCheck, CircleX, TriangleAlert, Info, X } from 'lucide-vue-next'
import { ref } from 'vue'

interface AlertProps {
  variant: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  showLink?: boolean
  linkHref?: string
  linkText?: string
  /** Show a dismiss control. Opt-in: most alerts describe a blocked action. */
  dismissible?: boolean
}

// Not assigned: the template reads the reactive props directly, and nothing in the
// script body needs the defaults object itself.
withDefaults(defineProps<AlertProps>(), {
  showLink: false,
  linkHref: '#',
  linkText: 'Learn more',
  dismissible: false,
})

const emit = defineEmits<{ dismiss: [] }>()

/**
 * Dismissed state lives here rather than being driven by the parent.
 *
 * A parent that has to own the flag has to also remember to hide the alert when it
 * is set, and every caller that forgets leaves the notice on screen - which is the
 * bug this control was added to fix. The component removing itself makes the common
 * case correct by construction. `dismiss` is still emitted so a parent that wants to
 * clear its own copy of the state can, and so the action is observable in a test.
 */
const dismissed = ref(false)

function handleDismiss(): void {
  dismissed.value = true
  emit('dismiss')
}

/**
 * Variant surfaces.
 *
 * `dark:bg-gray-900`, not `dark:bg-*-500/15`. At 15% opacity over arbitrary page
 * content the panel is not a panel: the page reads straight through it, so the text
 * inside is set against whatever happened to be behind - a dark photo, a saturated
 * button, a table stripe - and the contrast that made the alert legible in a
 * screenshot is gone in the real page. The same pattern was in `ToastHost` at 10%.
 *
 * So the surface is opaque and the variant is carried by the border and the icon,
 * plus a `border-s-4` accent rail that reads as a colour-coded edge without tinting
 * the whole box. `border-s-*` is logical, so the rail sits on the start edge in both
 * directions instead of flipping to the wrong side in RTL.
 */
const variantClasses = {
  success: {
    container: 'border-success-500 border-s-success-500 bg-success-50 dark:bg-gray-900',
    icon: 'text-success-500',
  },
  error: {
    container: 'border-error-500 border-s-error-500 bg-error-50 dark:bg-gray-900',
    icon: 'text-error-500',
  },
  warning: {
    container: 'border-warning-500 border-s-warning-500 bg-warning-50 dark:bg-gray-900',
    icon: 'text-warning-500',
  },
  info: {
    container: 'border-brand-500 border-s-brand-500 bg-brand-50 dark:bg-gray-900',
    icon: 'text-brand-500',
  },
} as const

const icons = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
}
</script>

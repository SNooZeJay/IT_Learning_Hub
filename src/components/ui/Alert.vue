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
  -->
  <div
    :role="variant === 'error' || variant === 'warning' ? 'alert' : 'status'"
    :aria-live="variant === 'error' || variant === 'warning' ? 'assertive' : 'polite'"
    :class="['rounded-xl border p-4', variantClasses[variant].container]"
  >
    <div class="flex items-start gap-3">
      <div :class="['-mt-0.5', variantClasses[variant].icon]">
        <component :is="icons[variant]" aria-hidden="true" />
      </div>

      <div>
        <h4 class="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">
          {{ title }}
        </h4>

        <p class="text-sm text-gray-500 dark:text-gray-400">{{ message }}</p>

        <router-link
          v-if="showLink"
          :to="linkHref"
          class="inline-block mt-3 text-sm font-medium text-gray-500 underline dark:text-gray-400"
        >
          {{ linkText }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleCheck, CircleX, TriangleAlert, Info } from 'lucide-vue-next'

interface AlertProps {
  variant: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  showLink?: boolean
  linkHref?: string
  linkText?: string
}

withDefaults(defineProps<AlertProps>(), {
  showLink: false,
  linkHref: '#',
  linkText: 'Learn more',
})

const variantClasses = {
  success: {
    container: 'border-success-500 bg-success-50 dark:border-success-500/30 dark:bg-success-500/15',
    icon: 'text-success-500',
  },
  error: {
    container: 'border-error-500 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15',
    icon: 'text-error-500',
  },
  warning: {
    container: 'border-warning-500 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15',
    icon: 'text-warning-500',
  },
  info: {
    container: 'border-brand-500 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/15',
    icon: 'text-brand-500',
  },
}

const icons = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
}
</script>

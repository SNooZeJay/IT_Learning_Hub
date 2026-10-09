<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed bottom-4 left-1/2 z-99999 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:left-auto sm:right-6 sm:-translate-x-0"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 translate-y-2"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'pointer-events-auto relative w-full overflow-hidden rounded-xl border shadow-theme-md dark:bg-gray-900/90',
            classes[toast.variant].container,
          ]"
          role="status"
        >
          <div class="flex items-start gap-3 p-4">
            <component
              :is="icons[toast.variant]"
              class="mt-0.5 size-5 shrink-0"
              :class="classes[toast.variant].icon"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-ink dark:text-white/90">{{ toast.title }}</p>
              <p v-if="toast.message" class="mt-0.5 text-sm text-slate dark:text-gray-400">
                {{ toast.message }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-md p-1 text-slate transition-colors hover:bg-black/5 hover:text-ink dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
              :aria-label="`Dismiss notification: ${toast.title}`"
              @click="dismiss(toast.id)"
            >
              <X class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

const icons = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
} as const

const classes = {
  // Opaque dark surfaces, not `dark:bg-*-500/10`.
  //
  // At 10% the toast was not a surface at all: the page behind it read straight
  // through, so the message was set against whatever happened to be underneath - a
  // dark hero, a saturated button - and the contrast that made it readable in a
  // screenshot was not there on the real page. A toast is the one surface guaranteed
  // to appear over arbitrary content, which is exactly why it has to be the one
  // surface that does not depend on what that content is.
  //
  // The variant is carried by the border and the icon instead. The light surfaces
  // keep their tint, because they sit on the app's own canvas, which is a known
  // colour. The dark ones cannot make that assumption.
  success: {
    container: 'border-success-500/60 bg-success-50 dark:border-success-500/50 dark:bg-gray-900',
    icon: 'text-success-500',
  },
  error: {
    container: 'border-error-500/60 bg-error-50 dark:border-error-500/50 dark:bg-gray-900',
    icon: 'text-error-500',
  },
  warning: {
    container: 'border-warning-500/60 bg-warning-50 dark:border-warning-500/50 dark:bg-gray-900',
    icon: 'text-warning-500',
  },
  info: {
    container: 'border-brand-500/60 bg-brand-50 dark:border-brand-500/50 dark:bg-gray-900',
    icon: 'text-brand-500',
  },
} as const
</script>

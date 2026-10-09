<script setup lang="ts">
/**
 * The warning dialog, and the end of an attempt.
 *
 * The brief is specific that no warning should be silent, that none should
 * terminate a quiz unexpectedly, and that the consequence must be stated in
 * advance. So this dialog is a modal that must be acknowledged, it names what
 * happened, it says how many are left, and the last one says what is about to
 * happen instead of letting it happen.
 *
 * It cannot be dismissed by clicking outside or pressing Escape. An
 * unacknowledged warning is how a student ends up back in their other tab without
 * knowing they spent one.
 */
import { computed } from 'vue'
import { AlertTriangle, CheckCircle2, ShieldX } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  /** Open while a warning is on screen. */
  open: boolean
  /** 1-based index of the warning just recorded. */
  warningNumber: number
  maxWarnings: number
  remaining: number
  /** What the student did, in words. */
  reason: string
  /** True when this was the last warning and the attempt is about to end. */
  final: boolean
  ending: boolean
}>()

const emit = defineEmits<{ acknowledge: [] }>()

const tone = computed(() => {
  if (props.final) {
    return 'border-error-200 bg-error-50 dark:border-error-500/40 dark:bg-error-500/[0.08]'
  }
  if (props.warningNumber >= props.maxWarnings - 1) {
    return 'border-warning-200 bg-warning-50 dark:border-warning-500/40 dark:bg-warning-500/[0.08]'
  }
  return 'border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
})

const heading = computed(() => {
  if (props.final) return 'This attempt is ending'
  if (props.warningNumber === 1) return 'Stay on this page'
  return `Warning ${props.warningNumber} of ${props.maxWarnings}`
})
</script>

<template>
  <!--
    A real dialog rather than a styled div: it traps focus and takes Escape, and
    the Escape handler is deliberately absent because this must be acknowledged.

    `z-[1000000]` is one above the design system's top token, and deliberately so.
    The sitting quiz is teleported to `body` at `z-999999` to cover the sidebar,
    which means this dialog - if it kept the `z-50` it was written with - would now
    render *underneath the quiz it is about*. Before the quiz was teleported this
    dialog was already wrong, at `z-50` against a sidebar at `z-99999`, which is why
    a student dismissing a warning could see the navigation behind it. One step
    above the shell fixes both, and does not depend on which of the two happens to
    come later in the document.
  -->
  <div
    v-if="open"
    class="fixed inset-0 z-[1000000] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="quiz-warning-heading"
    aria-describedby="quiz-warning-body"
  >
    <div class="w-full max-w-md rounded-xl border p-6 shadow-xl" :class="tone" role="document">
      <div class="flex items-start gap-4">
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full"
          :class="
            final
              ? 'bg-error-100 text-error-600 dark:bg-error-500/20 dark:text-error-400'
              : 'bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400'
          "
        >
          <ShieldX v-if="final" class="size-5" aria-hidden="true" />
          <AlertTriangle v-else class="size-5" aria-hidden="true" />
        </span>

        <div class="min-w-0 flex-1">
          <h2 id="quiz-warning-heading" class="text-theme-sm text-gray-900 dark:text-white/90">
            {{ heading }}
          </h2>

          <div
            id="quiz-warning-body"
            class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300"
          >
            <p>{{ reason }}</p>

            <!-- The consequence, before it happens. -->
            <p v-if="final" class="mt-3 font-medium text-error-700 dark:text-error-300">
              This was your last warning. The attempt is being submitted with the answers you have
              given — you are not disconnected, and what you answered is still marked.
            </p>
            <p
              v-else-if="remaining === 1"
              class="mt-3 font-medium text-warning-700 dark:text-warning-300"
            >
              One more warning and the attempt will be submitted with whatever you have answered.
            </p>
            <p v-else class="mt-3">
              {{ remaining }}
              {{ remaining === 1 ? 'warning' : 'warnings' }} remaining after this one.
            </p>
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <Button
          variant="primary"
          class="w-full sm:w-auto"
          :disabled="ending"
          @click="emit('acknowledge')"
        >
          <CheckCircle2 class="size-4" aria-hidden="true" />
          {{ ending ? 'Submitting…' : final ? 'Submit my answers' : 'I understand, continue' }}
        </Button>
      </div>
    </div>
  </div>
</template>

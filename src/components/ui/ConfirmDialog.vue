<template>
  <!--
    The shadcn AlertDialog renders the question now, not the hand-built Modal
    box. Same store, same promise: `ask()` opens, `settle()` resolves, and the
    `destructive-confirm.spec.ts` contract (every destructive path passes
    through `useConfirm`) is untouched - only the surface changed.

    `open` is driven by the store's `request`, so there is no local visibility
    state to drift from it. Cancel is the quiet action, confirm carries the
    variant: danger is the destructive red, anything else the brand green.
  -->
  <AlertDialog
    :open="request !== null"
    @update:open="
      (open) => {
        if (!open) cancel()
      }
    "
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ request?.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ request?.message }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="cancel">
          {{ request?.cancelText }}
        </AlertDialogCancel>
        <AlertDialogAction
          :class="
            request?.variant === 'danger'
              ? 'bg-error-600 text-white hover:bg-error-700'
              : 'bg-brand-500 text-white hover:bg-brand-600'
          "
          @click="confirm"
        >
          {{ request?.confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/public/ui/alert-dialog'
import { useConfirmStore } from '@/stores/confirm'

const store = useConfirmStore()
const request = computed(() => store.request)

function cancel(): void {
  store.settle(false)
}

function confirm(): void {
  store.settle(true)
}
</script>

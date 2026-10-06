<template>
  <Modal v-if="request" full-screen-backdrop @close="cancel">
    <template #body>
      <div
        class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-theme-lg dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
      >
        <h3 class="text-title-sm text-gray-900 dark:text-white/90">{{ request.title }}</h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ request.message }}</p>

        <div class="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            @click="cancel"
          >
            {{ request.cancelText }}
          </button>
          <button
            type="button"
            :class="[
              'inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium text-white transition-colors',
              request.variant === 'danger'
                ? 'bg-error-600 hover:bg-error-700'
                : 'bg-brand-500 hover:bg-brand-600',
            ]"
            @click="confirm"
          >
            {{ request.confirmText }}
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
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

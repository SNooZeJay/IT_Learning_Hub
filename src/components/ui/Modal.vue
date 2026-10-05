<template>
  <div class="fixed inset-0 flex items-center justify-center overflow-y-auto z-99999">
    <!--
      The dim layer, and the click-outside target.

      `fullScreenBackdrop` was declared here and never passed by the one caller, so
      the only modal in the app - the course delete confirmation - rendered as a
      white card floating over an undimmed page with the page still fully legible
      and still clickable-looking behind it.
    -->
    <div
      v-if="fullScreenBackdrop"
      class="fixed inset-0 h-full w-full bg-gray-900/50 backdrop-blur-[2px]"
      aria-hidden="true"
      @click="emit('close')"
    ></div>

    <!--
      Escape, on a real listener rather than `@keydown.esc` on the wrapper.

      The wrapper is not focusable, so the keydown would only fire if something
      inside the dialog happened to hold focus, and a dialog opened by a click on a
      button leaves that button focused behind the overlay. Listening on the window
      is what makes Escape work immediately, which is when somebody actually tries
      it.

      Scroll is locked for the same reason the backdrop exists: without it, a dialog
      shorter than the viewport scrolls the page underneath, which reads as the page
      having moved rather than as the dialog being dismissed.
    -->
    <slot name="body"></slot>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

interface ModalProps {
  fullScreenBackdrop?: boolean
}

defineProps<ModalProps>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  // Restored rather than cleared: if the page was already scroll-locked for another
  // reason, clearing it here would unlock something this modal never locked.
  document.body.style.overflow = ''
})
</script>

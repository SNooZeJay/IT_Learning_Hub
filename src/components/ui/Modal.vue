<template>
  <!--
    `p-4` on the centring wrapper, and it is the load-bearing part of this component.

    Both callers size their own panel - `max-w-md` in `ConfirmDialog`, `max-w-lg` in
    the course editor - and those are 28rem and 32rem. On a 375px screen both are
    wider than the viewport, and a flex row with no padding and no width bound lays
    its item out at its intrinsic size: the dialog ran off both edges of the phone
    and the buttons inside it became unreachable.

    Padding alone would not have fixed it either, because a flex item can still be
    forced past its container by its own `max-w-*`. So the wrapper also constrains
    its own width to `100%`, which is what lets the shrink calculation happen. The
    two together express the cap the design calls for - `min(28rem, 100vw - 2rem)` -
    once, at the layer that owns the geometry, instead of in every panel that
    happens to be passed through this slot today.
  -->
  <div class="fixed inset-0 z-99999 flex w-full items-center justify-center overflow-y-auto p-4">
    <!--
      The dim layer, and the click-outside target.

      `fullScreenBackdrop` is now `true` by default. It was a prop with no default,
      which meant a modal rendered correctly only if its author remembered to pass
      it - and a caller who did not got a card floating over a fully legible, fully
      clickable-looking page with no way to tell the two apart. A default that
      describes the component's purpose is better than one that describes an
      omission.

      Semi-transparent on purpose: this is a *dim*, not a second surface. The dialog
      panel itself is opaque (`bg-white dark:bg-gray-900` in both callers), and the
      job of this layer is to stop the page behind it competing for attention. An
      opaque backdrop would also hide the context the dialog was opened from.
    -->
    <div
      v-if="fullScreenBackdrop"
      class="fixed inset-0 h-full w-full bg-gray-900/60 backdrop-blur-sm"
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

// `true`, not `false`. The prop exists so a caller can ask for *no* backdrop, which
// is a rarer intent than "render the thing a modal is for".
withDefaults(defineProps<ModalProps>(), {
  fullScreenBackdrop: true,
})
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

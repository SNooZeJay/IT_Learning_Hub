import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * Whether animation may run.
 *
 * Module-scope state, following `useRTL.ts`: one listener for the whole app,
 * every consumer reads the same ref. Feedback form for the shape - a motion
 * component asks "may I move" and either mounts or renders its static fallback.
 *
 * SSR-safe: no `window` access at module scope. The default is motion allowed;
 * the media query is evaluated on mount, so server-rendered markup matches the
 * common case and corrects itself on the client without a hydration mismatch
 * anyone can see (a static-first frame that starts moving is invisible; the
 * reverse - a flash of motion that snaps static - is not).
 */
const QUERY = '(prefers-reduced-motion: reduce)'

const reduceRequested = ref(false)
let media: MediaQueryList | null = null

function onChange(event: { matches: boolean }) {
  reduceRequested.value = event.matches
}

export function initReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return
  if (media) return
  media = window.matchMedia(QUERY)
  reduceRequested.value = media.matches
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange)
  }
}

export function useReducedMotion() {
  onMounted(() => initReducedMotion())
  onUnmounted(() => {
    // The listener is module-scope and shared; per-component teardown would
    // unsubscribe consumers that are still mounted. It lives for the session.
  })
  return {
    /** True when animation may run. Name it for what it grants, not the query. */
    motionOK: computed(() => !reduceRequested.value),
  }
}

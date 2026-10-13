import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Whether a sentinel element is inside (or near) the viewport.
 *
 * Below-fold motion - the marquee, the reveals - currently mounts and starts
 * its work on first paint even when nobody can see it yet. This is the gate:
 * observe the sentinel and report, once by default or continuously.
 *
 * Fail-open everywhere: when IntersectionObserver is missing, or the target
 * never binds, the answer is visible. Content must never stay hidden because
 * an API is absent - a missing observer would otherwise blank every section
 * it guards on the oldest browsers.
 *
 * SSR-safe: no `window` access at module scope. Observation starts on mount,
 * following `useReducedMotion.ts`.
 */
export function useElementVisibility(options?: { once?: boolean; rootMargin?: string }) {
  const target = ref<Element | null>(null)
  const inView = ref(false)
  const once = options?.once ?? true

  let observer: IntersectionObserver | null = null

  function disconnect() {
    observer?.disconnect()
    observer = null
  }

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined' || target.value === null) {
      inView.value = true
      return
    }
    observer = new IntersectionObserver(
      ([entry]) => {
        inView.value = entry.isIntersecting
        if (entry.isIntersecting && once) disconnect()
      },
      { rootMargin: options?.rootMargin ?? '0px' },
    )
    observer.observe(target.value)
  })

  onUnmounted(() => disconnect())

  return { target, inView }
}

import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * Fullscreen and focus-loss during an assessment.
 *
 * Browser-level anti-cheating is deterrence, not security, and this composable
 * is written as though that is the case rather than as though it were a wall.
 * A student with devtools open can suppress any event this listens for. What it
 * does reliably do is make leaving the quiz visible and costly, and leave a record
 * the instructor can read afterwards.
 *
 * The parts that are actually enforced are not here. `record_quiz_warning` counts
 * on the server and `submit_quiz_attempt` refuses an attempt whose time is up, so
 * a student who clears localStorage, blocks the network and reloads finds the
 * warning count still where it was. This composable decides *when* to ask the
 * server; the server decides what it costs.
 *
 * Two kinds of event are watched, and the distinction matters:
 *
 *   visibilitychange - the tab was hidden or shown. Reliable, fires even if the
 *                      window is behind another window in the same tab.
 *   window blur/focus - the window lost or regained OS focus. Fires when the
 *                      student clicks another application.
 *
 * Neither fires when a student opens a second monitor and drags the quiz window
 * beside it. That is a known limitation and the pre-quiz screen says so, rather
 * than implying a guarantee the browser cannot make.
 */

export interface FocusGuardOptions {
  /** True while the quiz is actually being sat, so setup/teardown does not warn. */
  active: () => boolean
  /** Called for each detected focus loss. Must not throw. */
  onWarning: (reason: FocusLossReason) => void
  /** Called when the browser leaves fullscreen of its own accord. */
  onFullscreenExit: () => void
}

export type FocusLossReason = 'tab_hidden' | 'window_blurred' | 'left_fullscreen'

/** Fullscreen element ids, since there is no shared registry to import. */
function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? null
}

export function isFullscreen(): boolean {
  return fullscreenElement() !== null
}

/**
 * Ask for fullscreen.
 *
 * Must be called from a user gesture. A click handler qualifies; anything async
 * first does not, and the browser rejects the request with no error the caller
 * can act on. That is why `begin()` asks for it synchronously.
 *
 * Returns whether the request was accepted. A refusal is not a failure the
 * student needs to be blocked over - some browsers refuse on embedded or mobile
 * surfaces - so the caller carries on either way and the warning system simply
 * has one less signal to work with.
 */
export async function requestFullscreen(target?: Element): Promise<boolean> {
  const element = target ?? document.documentElement
  if (!element) return false
  if (isFullscreen()) return true

  try {
    // `requestFullscreen` is vendor-prefixed on older Safari and absent on some
    // mobile browsers, hence the shape of this call.
    const request = (
      element as Element & {
        webkitRequestFullscreen?: () => Promise<void> | void
      }
    ).requestFullscreen?.bind(element)

    if (!request) return false

    await request()
    return isFullscreen()
  } catch {
    return false
  }
}

/** Leave fullscreen, tolerating a browser that has none. */
export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return
  try {
    const exit = (
      document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
    ).exitFullscreen?.bind(document)
    await exit?.()
  } catch {
    // Leaving fullscreen is best-effort. The quiz ending will take the student out
    // of it regardless, and a refusal here must not interrupt grading.
  }
}

export function useQuizFocusGuard(options: FocusGuardOptions) {
  /** Suppresses a warning burst when we are the ones changing focus. */
  let ignoreUntil = 0

  /**
   * Do not warn for the next moment.
   *
   * Needed twice over. Opening the fullscreen request, or showing a modal, moves
   * focus and can fire `blur` on the window; counting that as the student looking
   * away would punish them for using the interface. A short suppression window is
   * the difference between a warning system that is believed and one that is
   * worked around.
   */
  function suppress(ms = 900): void {
    ignoreUntil = Date.now() + ms
  }

  function suppressed(): boolean {
    return Date.now() < ignoreUntil
  }

  function handleVisibility(): void {
    if (!options.active() || suppressed()) return
    if (document.visibilityState === 'hidden') {
      options.onWarning('tab_hidden')
    }
  }

  function handleBlur(): void {
    if (!options.active() || suppressed()) return
    // Alt-tabbing away from a fullscreen window can also fire a visibility
    // change, and one event should not cost two warnings.
    if (document.visibilityState === 'hidden') return
    options.onWarning('window_blurred')
  }

  function handleFullscreenChange(): void {
    if (!options.active() || suppressed()) return
    if (!isFullscreen()) options.onFullscreenExit()
  }

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('blur', handleBlur)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
  })

  return {
    /**
     * Attach the listeners.
     *
     * Called when the quiz starts, not on mount, so navigating to this view and
     * sitting a quiz are separate moments. A warning recorded while sitting on the
     * pre-quiz screen would be indefensible.
     */
    attach(): void {
      document.addEventListener('visibilitychange', handleVisibility)
      window.addEventListener('blur', handleBlur)
      document.addEventListener('fullscreenchange', handleFullscreenChange)
    },
    detach(): void {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    },
    suppress,
  }
}

/**
 * The wall-clock deadline for an attempt.
 *
 * Driven from `expires_at`, which the server wrote when the attempt started, and
 * re-synced against it rather than counting down locally. A countdown that starts
 * from the browser's own clock can be set back; one that measures from a server
 * timestamp cannot, and the difference costs nothing to implement.
 */
export function useAttemptClock(expiresAt: () => string | null) {
  const secondsLeft = ref<number | null>(null)
  let timer: number | null = null

  function tick(): void {
    const expiry = expiresAt()
    if (!expiry) {
      secondsLeft.value = null
      return
    }
    const remaining = Math.max(0, Math.floor((new Date(expiry).getTime() - Date.now()) / 1000))
    secondsLeft.value = remaining
  }

  function start(): void {
    stop()
    tick()
    if (expiresAt()) timer = window.setInterval(tick, 1000)
  }

  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  onBeforeUnmount(stop)

  const expired = computed(() => secondsLeft.value !== null && secondsLeft.value <= 0)

  /** m:ss, or h:mm:ss past an hour. Never negative, never blank. */
  const label = computed(() => {
    if (secondsLeft.value === null) return ''
    const total = secondsLeft.value
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  })

  /** Past five minutes the colour changes, because a number alone is easy to miss. */
  const urgent = computed(() => secondsLeft.value !== null && secondsLeft.value <= 300)

  return { secondsLeft, label, expired, urgent, start, stop, tick }
}

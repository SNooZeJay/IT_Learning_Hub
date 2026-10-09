import { defineStore } from 'pinia'

/**
 * A toast is feedback about an action that has already been attempted. It is never
 * shown *before* the operation it describes has genuinely finished.
 *
 * Variants map to intent, not to colour: `success` for an operation that worked,
 * `error` for a failure the person can retry, `warning` for a non-blocking problem
 * that should not be mistaken for failure, and `info` for a neutral update.
 */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  variant: ToastVariant
  title: string
  message?: string
  /** Milliseconds before the toast dismisses itself. `null` = stay until closed. */
  durationMs: number | null
}

interface ToastInput {
  variant: ToastVariant
  title: string
  message?: string
  /** Pass `null` to keep the toast until dismissed. */
  durationMs?: number | null
}

const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  // A success is the least worth reading for a long time: it confirms and gets out.
  success: 4500,
  // Errors and warnings often carry a "what to do next" that must not vanish first.
  error: 8000,
  warning: 8000,
  info: 5000,
}

/**
 * How many toasts may be on screen at once.
 *
 * Three is not a taste decision, it is a legibility one. The stack is anchored to
 * the bottom of the viewport in a max-width column, and on a 375px phone three
 * full-width cards and their gaps already reach halfway up the screen. A fourth
 * covers what the page is doing, which means the page stops being readable at
 * exactly the moment the person most wants to read it.
 */
const MAX_VISIBLE = 3

/**
 * Live dismissal timers, keyed by toast id.
 *
 * Deliberately module scope rather than store state. These are timer handles, not
 * data: they should never appear in a state snapshot or a devtools diff, and they
 * need to survive past the `push` call that created them in order to be
 * cancellable at all.
 *
 * Before this existed, `push` registered a `setTimeout` and threw the handle
 * away. `clear()` on sign-out emptied the array, but every pending timer kept
 * running and then called `dismiss` against an id that no longer existed. The
 * store stayed consistent, so it was easy to miss - but a signed-out user still
 * had callbacks firing against a store that nothing was rendering.
 *
 * `globalThis` rather than `window`, for two reasons. The obvious one is that this
 * store is unit-tested and the test environment is `node`, where `window` does not
 * exist - a bare `window.setTimeout` threw `ReferenceError` the moment anything
 * tried to verify this behaviour, which is part of why the cap and the dedupe went
 * unverified for as long as they did. The structural reason is that a store which
 * claims to hold app state should not care whether it was imported from a browser
 * bundle or a test runner.
 */
const timers = new Map<number, ReturnType<typeof setTimeout>>()

/** Cancel a toast's pending dismissal, if it has one. */
function cancelTimer(id: number): void {
  const handle = timers.get(id)
  if (handle === undefined) return
  clearTimeout(handle)
  timers.delete(id)
}

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
    nextId: 1,
  }),
  actions: {
    /**
     * Show a toast. Returns its id so it can be dismissed programmatically.
     *
     * Repeats collapse. The same failure arriving nine times is one piece of
     * information, not nine, and stacking it told the user nothing the first copy
     * did not - while pushing everything underneath it off the screen they were
     * trying to read. That is not hypothetical: one action that fired per row, or
     * a retry loop with no backoff, produced a column of identical "Enrollment
     * failed" cards that covered the page.
     *
     * Identity is variant + title + message. A repeat restarts the countdown on
     * the toast already mounted instead of adding a second, so the live timer
     * always belongs to the newest occurrence - the one whose duration is still
     * meaningful.
     */
    push(input: ToastInput): number {
      const durationMs =
        input.durationMs === undefined ? DEFAULT_DURATION[input.variant] : input.durationMs

      const existing = this.toasts.find(
        (toast) =>
          toast.variant === input.variant &&
          toast.title === input.title &&
          (toast.message ?? '') === (input.message ?? ''),
      )

      if (existing) {
        // Cancel before restarting. The outstanding timer is still counting down
        // the PREVIOUS occurrence, and leaving it alive would silently cap the
        // newer duration at the older, shorter one.
        cancelTimer(existing.id)
        if (durationMs === null) {
          // An explicit "stay until dismissed" must also cancel a pending
          // auto-dismiss, or the toast vanishes anyway.
          existing.durationMs = null
        } else {
          existing.durationMs = durationMs
          timers.set(
            existing.id,
            setTimeout(() => this.dismiss(existing.id), durationMs),
          )
        }
        return existing.id
      }

      const id = this.nextId++
      this.toasts.push({
        id,
        variant: input.variant,
        title: input.title,
        message: input.message,
        durationMs,
      })

      // Oldest out first. The evicted toast's timer is cancelled too, so one that
      // was pushed off the screen does not keep a live handle for another eight
      // seconds.
      while (this.toasts.length > MAX_VISIBLE) {
        const evicted = this.toasts.shift()
        if (evicted) cancelTimer(evicted.id)
      }

      if (durationMs !== null) {
        timers.set(
          id,
          setTimeout(() => this.dismiss(id), durationMs),
        )
      }
      return id
    },
    success(title: string, message?: string, durationMs?: number | null): number {
      return this.push({ variant: 'success', title, message, durationMs })
    },
    error(title: string, message?: string, durationMs?: number | null): number {
      return this.push({ variant: 'error', title, message, durationMs })
    },
    warning(title: string, message?: string, durationMs?: number | null): number {
      return this.push({ variant: 'warning', title, message, durationMs })
    },
    info(title: string, message?: string, durationMs?: number | null): number {
      return this.push({ variant: 'info', title, message, durationMs })
    },
    dismiss(id: number): void {
      cancelTimer(id)
      this.toasts = this.toasts.filter((toast) => toast.id !== id)
    },
    /**
     * Drop every toast and cancel every pending dismissal.
     *
     * Called on sign-out. The array is emptied either way; what changed is that
     * the timers are cancelled rather than left to fire against a store nothing
     * is reading.
     */
    clear(): void {
      for (const id of [...timers.keys()]) cancelTimer(id)
      timers.clear()
      this.toasts = []
    },
  },
})

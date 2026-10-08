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

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
    nextId: 1,
  }),
  actions: {
    /** Show a toast. Returns its id so it can be dismissed programmatically. */
    push(input: ToastInput): number {
      const id = this.nextId++
      const durationMs =
        input.durationMs === undefined ? DEFAULT_DURATION[input.variant] : input.durationMs
      this.toasts.push({
        id,
        variant: input.variant,
        title: input.title,
        message: input.message,
        durationMs,
      })
      if (durationMs !== null) {
        window.setTimeout(() => this.dismiss(id), durationMs)
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
      this.toasts = this.toasts.filter((toast) => toast.id !== id)
    },
    clear(): void {
      this.toasts = []
    },
  },
})

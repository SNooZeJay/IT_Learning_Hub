import { defineStore } from 'pinia'

export interface ConfirmRequest {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** Tone the confirm button carries: `danger` for destructive/irreversible actions. */
  variant?: 'default' | 'danger'
}

/**
 * The confirmation modal is for actions that deserve a beat of thought: deleting a
 * record, confirming a payment, signing up from a destructive place. Everything
 * lightweight (save success, a failed save) is a toast, not a modal.
 */
export const useConfirmStore = defineStore('confirm', {
  state: () => ({
    request: null as (ConfirmRequest & { resolve: (value: boolean) => void }) | null,
  }),
  actions: {
    ask(request: ConfirmRequest): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        this.request = { confirmText: 'Confirm', cancelText: 'Cancel', variant: 'default', ...request, resolve }
      })
    },
    settle(value: boolean): void {
      if (!this.request) return
      this.request.resolve(value)
      this.request = null
    },
  },
})

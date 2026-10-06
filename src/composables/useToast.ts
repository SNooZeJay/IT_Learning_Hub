import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toast'

/** Convenience accessor, mirroring `useToastStore()` but exported for components. */
export function useToast() {
  const store = useToastStore()
  const { toasts } = storeToRefs(store)
  return {
    toasts,
    push: store.push.bind(store),
    success: store.success.bind(store),
    error: store.error.bind(store),
    warning: store.warning.bind(store),
    info: store.info.bind(store),
    dismiss: store.dismiss.bind(store),
    clear: store.clear.bind(store),
  }
}

import { storeToRefs } from 'pinia'
import { useConfirmStore } from '@/stores/confirm'

/** Programmatic replacement for `window.confirm` — but on-brand, and promise-based. */
export function useConfirm() {
  const store = useConfirmStore()
  return {
    ...storeToRefs(store),
    ask: store.ask.bind(store),
    settle: store.settle.bind(store),
  }
}

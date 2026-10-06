import { computed, readonly, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

/**
 * The unread message count, owned once and shared.
 *
 * A sibling of `useUnreadNotifications`, and for the same reason it exists: two
 * surfaces show this number - the header's message button and the sidebar's Messages
 * item - and if each counted for itself they would disagree. Marking a thread read in
 * one place has to move the other, which only happens if they read the same value.
 *
 * `null` means "not counted yet", which is deliberately distinct from `0`. A badge that
 * renders before the first count is a badge that guesses, and a badge that appears and
 * then disappears on every route change is worse than no badge.
 *
 * Keyed by account so a shared machine cannot show one person another's count. `set`
 * discards a count recorded against a different id rather than carrying it over.
 */

const unreadCount = ref<number | null>(null)
const ownerId = ref<string | null>(null)

const isKnown: ComputedRef<boolean> = computed(() => unreadCount.value !== null)

export interface UnreadMessages {
  unreadCount: Readonly<Ref<number | null>>
  isKnown: Readonly<Ref<boolean>>
  set: (userId: string, count: number) => void
  reset: () => void
}

export function useUnreadMessages(): UnreadMessages {
  return {
    unreadCount: readonly(unreadCount),
    isKnown: readonly(isKnown) as Readonly<Ref<boolean>>,
    set(userId: string, count: number) {
      if (ownerId.value !== null && ownerId.value !== userId) unreadCount.value = null
      ownerId.value = userId
      unreadCount.value = Math.max(0, Math.trunc(count))
    },
    reset() {
      unreadCount.value = null
      ownerId.value = null
    },
  }
}

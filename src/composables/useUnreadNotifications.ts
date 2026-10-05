import { computed, readonly, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

/**
 * The unread notification count, owned once and shared.
 *
 * Two surfaces show it: the header bell and the sidebar's Notifications item. The
 * navigation has declared `badge: 'notifications'` on that item since before
 * anything rendered it, so the declaration was a promise the UI did not keep.
 *
 * Why a module-level singleton rather than each component counting for itself:
 * they would disagree. The bell is where notifications are marked read, so a sidebar
 * counting independently would sit there claiming there are three unread for as long
 * as the user stayed on the page after reading them. One owner, and both surfaces
 * read it, means marking a notification read moves both at once.
 *
 * Why the count is keyed by user id: this state outlives sign-out in a way component
 * state would not, so signing in as somebody else would otherwise inherit the
 * previous account's unread count. `set` discards anything recorded against a
 * different id rather than carrying it over.
 *
 * `null` means "not read yet", which is deliberately distinct from `0`. A badge that
 * renders before the first read is a badge that guesses.
 */
const unreadCount = ref<number | null>(null)
const ownerId = ref<string | null>(null)

const isKnown: ComputedRef<boolean> = computed(() => unreadCount.value !== null)

export interface UnreadNotifications {
  /** `null` until the first successful read. */
  unreadCount: Readonly<Ref<number | null>>
  /** True once a read has succeeded for the current user. */
  isKnown: Readonly<Ref<boolean>>
  /** Called by whoever reads the feed. A count from a different account is dropped. */
  set: (userId: string, count: number) => void
  /** Called on sign-out so the next account does not inherit this one. */
  reset: () => void
}

export function useUnreadNotifications(): UnreadNotifications {
  return {
    unreadCount: readonly(unreadCount),
    // Narrowed to a plain read-only ref rather than the computed's own type:
    // the extra members are implementation detail a consumer has no use for.
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

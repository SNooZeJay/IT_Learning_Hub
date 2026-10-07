<script setup lang="ts">
/**
 * The header's message button: an icon, a count, and a link.
 *
 * It is not a dropdown, and that is the design decision worth defending. The bell is a
 * dropdown because a notification is a thing that has already happened and you glance at
 * it. A message is something you are about to write, and writing it means going
 * somewhere - so this navigates rather than opening a panel that would cover the
 * conversation you are replying to.
 *
 * The unread count comes from the same shared value the sidebar's Messages badge
 * reads. Two surfaces counting for themselves is how a header says 3 while the sidebar
 * says 0, and that inconsistency is the whole reason `useUnreadMessages` exists.
 *
 * Nothing is rendered for a signed-out visitor: the header sits inside a layout that
 * only wraps guarded routes, so there is no session to count.
 */
import { computed, onMounted, ref } from 'vue'
import { MessageSquare } from 'lucide-vue-next'
import { countUnreadMessages } from '@/services/messaging.service'
import { useUnreadMessages } from '@/composables/useUnreadMessages'
import { useAuthStore } from '@/stores/auth'
import HeaderIconButton from '@/components/layout/HeaderIconButton.vue'

const auth = useAuthStore()
const unread = useUnreadMessages()
const { unreadCount, isKnown } = unread
const failed = ref(false)

const count = computed(() => unreadCount.value ?? 0)

/** Announced, because a dot on an icon says nothing to a screen reader. */
const label = computed(() => {
  if (!isKnown.value) return 'Messages, checking for unread'
  if (count.value === 0) return 'Messages, none unread'
  return `Messages, ${count.value} unread message${count.value === 1 ? '' : 's'}`
})

async function refresh(): Promise<void> {
  const id = auth.profile?.id
  if (!id) return
  try {
    unread.set(id, await countUnreadMessages())
    failed.value = false
  } catch {
    // The count is a convenience. `isKnown` stays false, so no badge renders, which is
    // the honest outcome - the Messages page itself is where the truth lives.
    failed.value = true
  }
}

onMounted(async () => {
  await auth.ensureReady()
  await refresh()
})
</script>

<template>
  <!--
    The same header control treatment as every other icon button here, wrapping a link
    rather than a button: `as="router-link"`. It was the odd one out at `rounded-full`
    with no border while the bell beside it was `rounded-full` with one.

    A link rather than a dropdown, deliberately: see the script block.
  -->
  <HeaderIconButton :label="label" as="router-link" to="/messages">
    <MessageSquare class="size-5" aria-hidden="true" />

    <!--
      Positioned rather than laid out after the icon: an absolutely placed badge keeps
      the button's hit area at 40px, and a badge in the flex row would push the icon
      off-centre as the number grows.
    -->
    <span
      v-if="isKnown && count > 0"
      class="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums"
    >
      {{ count }}
    </span>
  </HeaderIconButton>
</template>

<script setup lang="ts">
/**
 * Messages.
 *
 * An inbox, not a chat app. Two panes on a wide screen; on a narrow one, the list and
 * then the thread, with a real back control rather than a gesture.
 *
 * The mobile behaviour is a state variable rather than CSS. Three reasons, and the
 * first is the one that decided it:
 *
 *  1. A thread shown behind the list is a thread a screen reader can reach and a
 *     keyboard user can tab into while the list has focus. Two panes need two states,
 *     not two renderings of one.
 *  2. The browser's own back should leave the thread, not the app. That means the
 *     thread is a route, not a local flag - see the `?thread=` handling below.
 *  3. There is no gesture on this, because the platform has no gesture and inventing one
 *     hides an action from anyone not using a touchscreen.
 *
 * There is deliberately no polling, no typing indicator, and no optimistic send. The
 * message appears when the database says it does. A message that looks sent and was
 * not is worse than a half-second of waiting.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  Inbox,
  MessageSquare,
  PenLine,
  RefreshCw,
  Send,
  TriangleAlert,
  X,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import {
  MessagingError,
  countUnreadMessages,
  listConversations,
  listMessageablePeople,
  listMessages,
  markConversationRead,
  normaliseMessageBody,
  sendMessage,
  startConversation,
  type ConversationSummary,
  type Message,
  type MessagePerson,
} from '@/services/messaging.service'
import { useAuthStore } from '@/stores/auth'
import { useUnreadMessages } from '@/composables/useUnreadMessages'
import { formatDateTime } from '@/types'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const unread = useUnreadMessages()

const conversations = ref<ConversationSummary[]>([])
const messages = ref<Message[]>([])
const people = ref<MessagePerson[]>([])

const isLoading = ref(true)
const isThreadLoading = ref(false)
const errorMessage = ref('')
const threadError = ref('')

const draft = ref('')
const isSending = ref(false)
const sendError = ref('')
const sendNotice = ref('')

const isComposing = ref(false)
const composeError = ref('')
const recipientId = ref('')
const subjectDraft = ref('')
const isStarting = ref(false)

/**
 * Which thread is open, held in the URL.
 *
 * `null` is a real, addressable state: it is the list on its own, which is what a
 * narrow screen shows and what the back control returns to.
 */
const openThreadId = computed<string | null>(() => {
  const value = route.query.thread
  return typeof value === 'string' && value ? value : null
})

const openConversation = computed(
  () => conversations.value.find((c) => c.id === openThreadId.value) ?? null,
)

const myId = computed(() => auth.profile?.id ?? '')

async function refreshUnread(): Promise<void> {
  const id = auth.profile?.id
  if (!id) return
  try {
    unread.set(id, await countUnreadMessages())
  } catch {
    // A badge is not worth an error banner. The list below carries the truth.
  }
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    conversations.value = await listConversations()
    await refreshUnread()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Your conversations could not be loaded.'
  } finally {
    isLoading.value = false
  }
}

async function loadThread(id: string): Promise<void> {
  isThreadLoading.value = true
  threadError.value = ''
  try {
    messages.value = await listMessages(id)
    await markConversationRead(id)
    // Recomputed locally rather than refetching the list: the count that changed is
    // this thread's, and a full reload would also discard the scroll position.
    const conversation = conversations.value.find((c) => c.id === id)
    if (conversation) conversation.unreadCount = 0
    await refreshUnread()
  } catch (error) {
    messages.value = []
    threadError.value =
      error instanceof Error ? error.message : 'This conversation could not be opened.'
  } finally {
    isThreadLoading.value = false
  }
}

watch(openThreadId, (id) => {
  if (id) void loadThread(id)
  else messages.value = []
})

function openThread(id: string): void {
  void router.replace({ query: { ...route.query, thread: id } })
}

/** The back control on a narrow screen, and Back in the browser. */
function closeThread(): void {
  void router.replace({ query: { ...route.query, thread: undefined } })
}

async function onSend(): Promise<void> {
  const id = openThreadId.value
  if (!id || isSending.value) return

  let body: string
  try {
    body = normaliseMessageBody(draft.value)
  } catch (error) {
    sendError.value =
      error instanceof MessagingError ? error.message : 'That message cannot be sent.'
    return
  }

  isSending.value = true
  sendError.value = ''
  sendNotice.value = ''
  try {
    await sendMessage(id, body)
    draft.value = ''
    await loadThread(id)
    await load()
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : 'That message could not be sent.'
  } finally {
    isSending.value = false
  }
}

async function openCompose(): Promise<void> {
  isComposing.value = true
  composeError.value = ''
  recipientId.value = ''
  subjectDraft.value = ''
  people.value = []
  try {
    people.value = await listMessageablePeople()
  } catch (error) {
    composeError.value =
      error instanceof Error ? error.message : 'The people you can message could not be loaded.'
  }
}

async function onStartConversation(): Promise<void> {
  if (!recipientId.value || isStarting.value) return
  isStarting.value = true
  composeError.value = ''
  try {
    const id = await startConversation(recipientId.value, subjectDraft.value)
    isComposing.value = false
    await load()
    openThread(id)
  } catch (error) {
    composeError.value =
      error instanceof Error ? error.message : 'The conversation could not be started.'
  } finally {
    isStarting.value = false
  }
}

/** Nobody reachable is a real outcome, not an error, and it says why. */
const nobodyToMessage = computed(
  () => !isComposing.value || (people.value.length === 0 && !composeError.value),
)

onMounted(async () => {
  await auth.ensureReady()
  await load()
  if (openThreadId.value) await loadThread(openThreadId.value)
})
</script>

<template>
  <div>
    <PageHeader
      title="Messages"
      subtitle="Conversations with the people in your courses."
      :crumbs="[
        { label: auth.isAdmin ? 'Admin' : auth.isInstructor ? 'Instructor' : 'Student' },
        { label: 'Messages' },
      ]"
    >
      <template #actions>
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-hairline px-3 text-sm font-medium text-slate transition-colors hover:bg-surface hover:text-ink dark:border-white/10 dark:hover:bg-white/[0.06]"
          :disabled="isLoading"
          @click="load"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </button>
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          @click="openCompose"
        >
          <PenLine class="size-4" aria-hidden="true" />
          New message
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading your conversations" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <div v-else class="mt-6 grid gap-5 lg:grid-cols-[20rem_1fr]">
      <!--
        The list. On a narrow screen this is the whole view until a thread is opened;
        the grid handles the split at `lg` and the `v-if` on the wrappers handles the
        two-step flow below it.
      -->
      <section
        aria-labelledby="messages-list-heading"
        :class="openThreadId ? 'hidden lg:block' : 'block'"
      >
        <div class="rounded-lg border border-hairline bg-canvas dark:border-white/10">
          <h2 id="messages-list-heading" class="sr-only">Your conversations</h2>

          <p
            v-if="conversations.length === 0"
            class="flex flex-col items-center gap-2 px-6 py-12 text-center"
          >
            <Inbox class="size-7 text-stone" aria-hidden="true" />
            <span class="text-sm font-medium text-ink">No conversations yet</span>
            <span class="max-w-xs text-sm text-slate">
              Start one with an instructor, or with a student in one of your courses.
            </span>
          </p>

          <ul v-else role="list" class="divide-y divide-hairline dark:divide-white/10">
            <li v-for="conversation in conversations" :key="conversation.id">
              <button
                type="button"
                class="flex w-full flex-col items-start gap-1 px-4 py-3.5 text-start transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 dark:hover:bg-white/[0.03]"
                :class="conversation.id === openThreadId ? 'bg-brand-50 dark:bg-brand-500/10' : ''"
                :aria-current="conversation.id === openThreadId ? 'true' : undefined"
                @click="openThread(conversation.id)"
              >
                <span class="flex w-full items-baseline justify-between gap-2">
                  <span class="min-w-0 truncate text-sm font-medium text-ink">
                    {{ conversation.withName }}
                  </span>
                  <span
                    v-if="conversation.unreadCount > 0"
                    class="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums"
                  >
                    {{ conversation.unreadCount }}
                    <span class="sr-only">unread messages</span>
                  </span>
                </span>
                <span class="w-full truncate text-start text-xs text-slate">
                  {{ conversation.subject }}
                </span>
                <span class="w-full truncate text-start text-xs text-stone">
                  {{ conversation.lastMessagePreview }}
                </span>
                <span class="text-[11px] text-stone tabular-nums">
                  {{ formatDateTime(conversation.lastMessageAt) }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </section>

      <!-- The thread. -->
      <section
        aria-labelledby="messages-thread-heading"
        :class="openThreadId ? 'block' : 'hidden lg:block'"
      >
        <div class="rounded-lg border border-hairline bg-canvas dark:border-white/10">
          <template v-if="openThreadId">
            <div
              class="flex items-center gap-3 border-b border-hairline px-4 py-3 dark:border-white/10"
            >
              <!--
                The narrow-screen back control. `lg:hidden` because from `lg` the list is
                visible alongside, and a back control that returns to a list you can
                already see is noise.
              -->
              <button
                type="button"
                class="-ms-1 flex size-9 shrink-0 items-center justify-center rounded-md text-slate transition-colors hover:bg-surface hover:text-ink lg:hidden dark:hover:bg-white/[0.06]"
                aria-label="Back to your conversations"
                @click="closeThread"
              >
                <ArrowLeft class="size-4" aria-hidden="true" />
              </button>
              <h2 id="messages-thread-heading" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink">
                  {{ openConversation?.withName ?? 'Conversation' }}
                </span>
                <span class="block truncate text-xs text-slate">
                  {{ openConversation?.subject }}
                </span>
              </h2>
            </div>

            <LoadingState v-if="isThreadLoading" label="Loading the conversation" />

            <ErrorState
              v-else-if="threadError"
              class="m-4"
              :message="threadError"
              @retry="() => openThreadId && loadThread(openThreadId)"
            />

            <template v-else>
              <p v-if="messages.length === 0" class="px-4 py-10 text-center text-sm text-slate">
                No messages yet. Say something.
              </p>

              <ul
                v-else
                role="log"
                aria-label="Messages in this conversation"
                aria-live="polite"
                class="flex max-h-[26rem] flex-col gap-3 overflow-y-auto px-4 py-4"
              >
                <li
                  v-for="message in messages"
                  :key="message.id"
                  class="flex flex-col gap-1"
                  :class="message.senderId === myId ? 'items-end' : 'items-start'"
                >
                  <span
                    class="max-w-[85%] rounded-lg px-3 py-2 text-sm"
                    :class="
                      message.senderId === myId
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface text-ink dark:bg-white/[0.06]'
                    "
                  >
                    {{ message.body }}
                  </span>
                  <span class="text-[11px] text-stone tabular-nums">
                    {{ formatDateTime(message.createdAt) }}
                  </span>
                </li>
              </ul>

              <form
                class="border-t border-hairline p-4 dark:border-white/10"
                novalidate
                @submit.prevent="onSend"
              >
                <label for="message-body" class="sr-only">Your message</label>
                <textarea
                  id="message-body"
                  v-model="draft"
                  rows="3"
                  maxlength="4000"
                  placeholder="Write a message"
                  :aria-invalid="Boolean(sendError)"
                  :aria-describedby="sendError ? 'message-error' : undefined"
                  class="w-full resize-y rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-stone focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 dark:border-white/10 dark:bg-white/[0.04]"
                ></textarea>

                <p
                  v-if="sendError"
                  id="message-error"
                  class="mt-2 text-xs text-error-600 dark:text-error-400"
                >
                  {{ sendError }}
                </p>
                <p v-if="sendNotice" class="mt-2 text-xs text-success-600 dark:text-success-400">
                  {{ sendNotice }}
                </p>

                <div class="mt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-slate transition-colors hover:bg-surface hover:text-ink"
                    @click="draft = ''"
                  >
                    <X class="size-4" aria-hidden="true" />
                    Clear
                  </button>
                  <button
                    type="submit"
                    class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="isSending || draft.trim().length === 0"
                  >
                    <Send class="size-4" aria-hidden="true" />
                    {{ isSending ? 'Sending…' : 'Send' }}
                  </button>
                </div>
              </form>
            </template>
          </template>

          <!-- No thread open. -->
          <div v-else class="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <MessageSquare class="size-7 text-stone" aria-hidden="true" />
            <p class="text-sm font-medium text-ink">Choose a conversation</p>
            <p class="max-w-xs text-sm text-slate">Pick one from your list to read it and reply.</p>
          </div>
        </div>
      </section>
    </div>

    <!--
      Compose. A dialog rather than a panel, because it is a short task with a definite
      end, and a list the user can still see behind it would compete with it.
    -->
    <div
      v-if="isComposing"
      class="fixed inset-0 z-99999 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <div
        class="absolute inset-0 bg-gray-900/50"
        aria-hidden="true"
        @click="isComposing = false"
      ></div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-heading"
        class="relative w-full max-w-lg rounded-t-xl border border-hairline bg-canvas p-6 shadow-theme-lg sm:rounded-xl dark:border-white/10 dark:bg-gray-900"
      >
        <div class="flex items-start justify-between gap-3">
          <h2 id="compose-heading" class="text-theme-sm text-ink">New message</h2>
          <button
            type="button"
            class="-me-2 -mt-1 flex size-9 items-center justify-center rounded-md text-slate transition-colors hover:bg-surface dark:hover:bg-white/[0.06]"
            aria-label="Close"
            @click="isComposing = false"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>

        <LoadingState
          v-if="isComposing && people.length === 0 && !composeError"
          label="Finding people"
        />

        <div v-else-if="nobodyToMessage" class="mt-4">
          <p class="flex items-start gap-2 text-sm text-slate">
            <TriangleAlert class="mt-0.5 size-4 shrink-0 text-stone" aria-hidden="true" />
            <span>
              There is nobody to message yet. You can write to the instructors of your courses, and
              to the students in the courses you teach.
            </span>
          </p>
        </div>

        <form
          v-else
          class="mt-4 flex flex-col gap-4"
          novalidate
          @submit.prevent="onStartConversation"
        >
          <p v-if="composeError" class="text-sm text-error-600 dark:text-error-400" role="alert">
            {{ composeError }}
          </p>

          <div>
            <label for="compose-recipient" class="mb-1.5 block text-sm font-medium text-ink">
              To
            </label>
            <select
              id="compose-recipient"
              v-model="recipientId"
              required
              class="w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm text-ink dark:border-white/10 dark:bg-white/[0.04]"
            >
              <option value="" disabled>Choose someone</option>
              <option v-for="person in people" :key="person.id" :value="person.id">
                {{ person.fullName }} — {{ person.via }}
              </option>
            </select>
          </div>

          <div>
            <label for="compose-subject" class="mb-1.5 block text-sm font-medium text-ink">
              Subject
            </label>
            <input
              id="compose-subject"
              v-model="subjectDraft"
              type="text"
              maxlength="120"
              required
              placeholder="What is this about?"
              class="w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-stone dark:border-white/10 dark:bg-white/[0.04]"
            />
          </div>

          <div class="flex justify-end gap-3">
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-slate transition-colors hover:bg-surface hover:text-ink"
              @click="isComposing = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isStarting || !recipientId || subjectDraft.trim().length === 0"
            >
              <Check class="size-4" aria-hidden="true" />
              {{ isStarting ? 'Starting…' : 'Start conversation' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

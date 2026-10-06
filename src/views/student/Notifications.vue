<template>
  <div>
    <PageHeader
      title="Notifications"
      :subtitle="headerSubtitle"
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Notifications' }]"
    >
      <template #actions>
        <Button
          v-if="unreadCount > 0"
          variant="outline"
          size="sm"
          :disabled="actingOn === 'all'"
          @click="markAllRead"
        >
          <LoaderCircle v-if="actingOn === 'all'" class="size-4 animate-spin" aria-hidden="true" />
          <CheckCheck v-else class="size-4" aria-hidden="true" />
          Mark all read
        </Button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading your notifications" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else>
      <!-- Action error sits above the list rather than replacing it. A failed
           "mark all read" has not lost the notifications, so blanking the page
           would overstate what went wrong. -->
      <Alert
        v-if="actionError"
        variant="error"
        title="Could not update your notifications"
        :message="actionError"
        class="mb-4"
      />

      <!-- Unread filter. Hidden when nothing is unread, because a filter with one
           possible answer is a control that does nothing. -->
      <div v-if="unreadCount > 0" class="mb-4">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors"
          :class="
            showUnreadOnly
              ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
              : 'border-hairline bg-canvas text-slate hover:bg-surface dark:bg-white/[0.03]'
          "
          :aria-pressed="showUnreadOnly"
          @click="showUnreadOnly = !showUnreadOnly"
        >
          <Circle class="size-4" aria-hidden="true" />
          Unread only
          <span
            class="rounded-full px-1.5 py-0.5 text-xs font-medium"
            :class="showUnreadOnly ? 'bg-brand-600 text-white' : 'bg-surface text-slate'"
          >
            {{ unreadCount }}
          </span>
        </button>
      </div>

      <EmptyState
        v-if="notifications.length === 0"
        title="Nothing here yet"
        description="Enrollments, quiz results, graded assignments and certificates all arrive here as notifications."
        :icon="BellOff"
      />

      <EmptyState
        v-else-if="visible.length === 0"
        title="Nothing unread"
        :description="`All ${notifications.length} of your notifications have been read. Turn the filter off to see them again.`"
        :icon="CheckCheck"
      >
        <Button variant="outline" @click="showUnreadOnly = false">Show all notifications</Button>
      </EmptyState>

      <ul v-else class="space-y-2">
        <li
          v-for="notification in visible"
          :key="notification.id"
          class="rounded-lg border bg-canvas transition-colors dark:bg-white/[0.03]"
          :class="
            notification.isRead
              ? 'border-hairline'
              : 'border-brand-200 bg-brand-25 dark:border-brand-500/30 dark:bg-brand-500/[0.06]'
          "
        >
          <div class="flex items-start gap-3 p-4">
            <!-- Type is shown as an icon and, for assistive tech, as a word. A
                 coloured dot alone would tell a screen reader nothing about what
                 kind of notification this is. -->
            <span
              class="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
              :class="iconWrapClass(notification.type)"
            >
              <component :is="iconFor(notification.type)" class="size-4" aria-hidden="true" />
              <span class="sr-only">{{ typeLabel(notification.type) }}:</span>
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2
                  class="text-theme-sm"
                  :class="notification.isRead ? 'text-ink' : 'font-semibold text-ink'"
                >
                  {{ notification.title }}
                </h2>
                <span class="text-xs text-slate">
                  {{ typeLabel(notification.type) }} · {{ formatDateTime(notification.createdAt) }}
                </span>
                <span v-if="!notification.isRead" class="sr-only">(unread)</span>
              </div>

              <p v-if="notification.body" class="mt-1 text-sm leading-relaxed text-slate">
                {{ notification.body }}
              </p>

              <!--
                `link` is an in-app path written by a server-side notify call, and
                the service already discards anything that is not a slash-prefixed
                path. Rendering it as a link rather than a raw string keeps it
                inside the router instead of reloading the app.
              -->
              <div class="mt-2.5 flex flex-wrap items-center gap-3">
                <RouterLink
                  v-if="notification.link"
                  :to="notification.link"
                  class="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  @click="markRead(notification)"
                >
                  Open
                  <ChevronRight class="size-4 rtl:rotate-180" aria-hidden="true" />
                </RouterLink>

                <button
                  v-if="!notification.isRead"
                  type="button"
                  class="inline-flex items-center gap-1 text-sm font-medium text-slate transition-colors hover:text-ink disabled:opacity-60"
                  :disabled="actingOn === notification.id"
                  @click="markRead(notification)"
                >
                  <LoaderCircle
                    v-if="actingOn === notification.id"
                    class="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  <Check v-else class="size-3.5" aria-hidden="true" />
                  Mark as read
                </button>

                <span v-else class="text-xs text-slate">
                  Read {{ notification.readAt ? formatDateTime(notification.readAt) : '' }}
                </span>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Award,
  BadgeCheck,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  CircleX,
  ClipboardCheck,
  GraduationCap,
  LoaderCircle,
  Megaphone,
  MessageSquare,
  School,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/learning.service'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/types'
import type { NotificationType, StudentNotification } from '@/services/learning.service'

const auth = useAuthStore()

const notifications = ref<StudentNotification[]>([])
const unreadCount = ref(0)
const isLoading = ref(true)
const errorMessage = ref('')
const actionError = ref('')
/** Id of the row being written, or 'all'. Null when nothing is in flight. */
const actingOn = ref<string | null>(null)

const showUnreadOnly = ref(false)

const visible = computed(() =>
  showUnreadOnly.value ? notifications.value.filter((item) => !item.isRead) : notifications.value,
)

const headerSubtitle = computed(() => {
  if (unreadCount.value === 0) return 'Everything here has been read.'
  return `${unreadCount.value} unread of ${notifications.value.length}.`
})

/**
 * Icon and wording per notification type.
 *
 * The words matter as much as the icons: colour alone would leave a colour-blind
 * reader, or a screen reader, with no way to tell an enrolment confirmation from
 * a revocation.
 */
const TYPE_META: Record<NotificationType, { icon: typeof Award; label: string; wrap: string }> = {
  enrolment_confirmed: {
    icon: School,
    label: 'Enrollment',
    wrap: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
  },
  payment_received: {
    icon: CircleDollarSign,
    label: 'Payment',
    wrap: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  },
  quiz_graded: {
    icon: ClipboardCheck,
    label: 'Quiz result',
    wrap: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400',
  },
  assignment_graded: {
    icon: Award,
    label: 'Assignment marked',
    wrap: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400',
  },
  course_completed: {
    icon: GraduationCap,
    label: 'Course completed',
    wrap: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  },
  certificate_issued: {
    icon: BadgeCheck,
    label: 'Certificate issued',
    wrap: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  },
  certificate_revoked: {
    icon: CircleX,
    label: 'Certificate revoked',
    wrap: 'bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400',
  },
  announcement: {
    icon: Megaphone,
    label: 'Announcement',
    wrap: 'bg-surface text-slate dark:bg-white/[0.06]',
  },
  new_message: {
    icon: MessageSquare,
    label: 'Message',
    wrap: 'bg-surface text-slate dark:bg-white/[0.06]',
  },
}

/**
 * Unknown types fall back rather than rendering nothing. The enum in Postgres can
 * gain a value before this map does, and a blank circle beside a real title looks
 * like a rendering bug.
 */
function metaFor(type: NotificationType) {
  return TYPE_META[type] ?? { icon: BellOff, label: 'Update', wrap: 'bg-surface text-slate' }
}

function iconFor(type: NotificationType) {
  return metaFor(type).icon
}

function typeLabel(type: NotificationType): string {
  return metaFor(type).label
}

function iconWrapClass(type: NotificationType): string {
  return metaFor(type).wrap
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    // The feed is keyed on the signed-in user id from the profile, which the
    // store may still be resolving on a cold load.
    await auth.ensureReady()
    const userId = auth.profile?.id
    if (!userId) {
      errorMessage.value = 'Your profile has not loaded yet. Give it a moment and try again.'
      return
    }
    const feed = await listNotifications(userId)
    notifications.value = feed.notifications
    unreadCount.value = feed.unreadCount
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load your notifications.'
  } finally {
    isLoading.value = false
  }
}

/**
 * Mark one read, then re-read the feed.
 *
 * The row is updated from the returned feed rather than patched locally. The
 * unread count is derived from the rows, so patching one row and decrementing a
 * number by hand is how a count and the list underneath it drift apart.
 */
async function markRead(notification: StudentNotification): Promise<void> {
  const userId = auth.profile?.id
  if (!userId || notification.isRead) return

  actionError.value = ''
  actingOn.value = notification.id
  try {
    await markNotificationRead(notification.id, userId)
    const feed = await listNotifications(userId)
    notifications.value = feed.notifications
    unreadCount.value = feed.unreadCount
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : 'Could not mark that as read. Try again.'
  } finally {
    actingOn.value = null
  }
}

async function markAllRead(): Promise<void> {
  const userId = auth.profile?.id
  if (!userId) return

  actionError.value = ''
  actingOn.value = 'all'
  try {
    await markAllNotificationsRead(userId)
    const feed = await listNotifications(userId)
    notifications.value = feed.notifications
    unreadCount.value = feed.unreadCount
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : 'Could not mark them as read. Try again.'
  } finally {
    actingOn.value = null
  }
}

onMounted(load)
</script>

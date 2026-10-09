<template>
  <div ref="dropdownRef" class="relative">
    <!--
      The bell. Shape and size come from `HeaderIconButton`, like every other control in
      this row. It used to be `rounded-full` + border at `size-11`, while the message
      button beside it was `rounded-full` with no border at `size-10`.
    -->
    <HeaderIconButton
      :label="buttonLabel"
      :expanded="dropdownOpen"
      controls="notification-menu-dropdown"
      :active="dropdownOpen"
      @activate="toggleDropdown"
    >
      <!--
        The unread dot used to be `const notifying = ref(true)` — a red pulse
        from first paint, on an account with no notifications at all. It is now
        the real count from the `notifications` table, and it is absent at zero.

        The ping is gone with the rest of the motion budget: it animated forever, on
        every screen, and a badge that pulses continuously stops being read as urgent
        within a day. The dot itself carries the state.
      -->
      <span
        v-if="unreadCount > 0"
        class="absolute end-1.5 top-1.5 z-1 size-2 rounded-full bg-error-500"
      />

      <Bell class="size-5" aria-hidden="true" />
    </HeaderIconButton>

    <!-- Dropdown Start -->
    <!--
      Anchored to the bell's inline END, and sized against the viewport rather than
      against anything in the header.

      It used to be `start-0` with `calc(100vw - 6rem)`. That `6rem` was the bell's
      own offset from the start of the header - the row's padding, plus a 44px theme
      toggle, plus a gap - measured once and hard-coded into a component that does
      not own the header's spacing. The header's padding and its row structure have
      both changed since, the arithmetic stopped holding, and the panel ran off the
      end of a 375px screen. A sibling's layout, written down as a constant, is a
      measurement waiting to go stale.

      `end-0` makes the panel hang off the same edge as the control that opened it,
      which is where the eye already is, and a viewport-derived width then bounds it
      correctly no matter where the bell sits. It is logical, so it mirrors under RTL
      without a second rule.

      `max-h` bounds the panel against the viewport height so the list scrolls inside
      it. Unbounded, the panel is as tall as its content: five rows of notification
      text ran the footer - the one control that says "see everything" - past the
      bottom of a phone screen. The list is already `min-h-0 flex-1 overflow-y-auto`,
      so it inherits the bound and scrolls within it.
    -->
    <div
      v-if="dropdownOpen"
      id="notification-menu-dropdown"
      class="absolute end-0 top-full z-50 mt-4 flex max-h-[min(32rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-lg border border-hairline bg-canvas p-3 shadow-theme-lg animate-fadeIn dark:bg-surface"
    >
      <div class="flex items-center justify-between gap-2 border-b border-hairline-soft pb-3">
        <h5 class="text-theme-xl text-ink dark:text-gray-100">
          Notifications
          <span
            v-if="unreadCount > 0"
            class="ms-1.5 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-theme-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
          >
            {{ unreadCount }} unread
          </span>
        </h5>

        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
          aria-label="Close notifications"
          @click="closeDropdown"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>

      <!--
        Mark all read gets its own row rather than sharing the footer with the
        view-all link: at 390px this panel is ~280px wide, and two labelled
        buttons side by side inside that is how one of them ends up truncated.
      -->
      <div v-if="unreadCount > 0" class="flex justify-end pt-2">
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-theme-xs font-medium text-slate transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          :disabled="markingAll"
          @click="markAllRead"
        >
          <LoaderCircle v-if="markingAll" class="size-3.5 animate-spin" aria-hidden="true" />
          <CheckCheck v-else class="size-3.5" aria-hidden="true" />
          Mark all read
        </button>
      </div>

      <!-- Action error sits above the list rather than replacing it: a failed
           "mark all read" has not lost the notifications. -->
      <p
        v-if="actionError"
        class="mt-3 rounded-md bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-500/10 dark:text-error-400"
        role="alert"
      >
        {{ actionError }}
      </p>

      <div class="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center gap-3 py-6" role="status">
          <LoaderCircle
            class="size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-400"
            aria-hidden="true"
          />
          <p class="text-theme-sm text-slate">Loading your notifications</p>
        </div>

        <!-- Read failure. Retry is offered because the button that got here is a
             real control and the only honest thing to do with a failure. -->
        <div v-else-if="errorMessage" class="py-6 text-center">
          <p class="text-theme-sm text-slate">{{ errorMessage }}</p>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-theme-xs font-medium text-slate transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            @click="load"
          >
            <RefreshCw class="size-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>

        <!-- Empty. An empty bell says so, rather than rendering a broken card. -->
        <div v-else-if="notifications.length === 0" class="py-6 text-center">
          <span
            class="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-surface text-slate dark:bg-white/[0.06]"
          >
            <BellOff class="size-5" aria-hidden="true" />
          </span>
          <p class="text-theme-sm font-medium text-ink dark:text-gray-200">Nothing new</p>
          <p class="mt-1 text-xs text-slate">
            Enrollments, quiz results, graded work and certificates arrive here.
          </p>
        </div>

        <ul v-else class="flex flex-col">
          <li v-for="notification in preview" :key="notification.id">
            <button
              type="button"
              class="flex w-full gap-3 rounded-md border-b border-hairline-soft px-2 py-3 text-start transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 last:border-b-0 dark:hover:bg-white/[0.06]"
              :disabled="markingId === notification.id"
              @click="open(notification)"
            >
              <!-- Type is shown as an icon and, for assistive tech, as a word.
                   A coloured circle alone tells a screen reader nothing. -->
              <span
                class="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
                :class="iconWrapClass(notification.type)"
              >
                <component :is="iconFor(notification.type)" class="size-4" aria-hidden="true" />
                <span class="sr-only">{{ typeLabel(notification.type) }}:</span>
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <span
                    class="min-w-0 flex-1 truncate text-theme-sm dark:text-gray-200"
                    :class="notification.isRead ? 'font-medium text-ink' : 'font-semibold text-ink'"
                  >
                    {{ notification.title }}
                  </span>
                  <LoaderCircle
                    v-if="markingId === notification.id"
                    class="size-3.5 shrink-0 animate-spin text-slate"
                    aria-hidden="true"
                  />
                </span>

                <span v-if="notification.body" class="mt-0.5 line-clamp-2 text-xs text-slate">
                  {{ notification.body }}
                </span>

                <!--
                  The label truncates and the timestamp does not. On a 294px-wide
                  phone panel the two together wrapped onto two lines and left
                  the separator dot hanging at the end of the first, which reads
                  as a broken list rather than a metadata line.
                -->
                <span class="mt-1 flex items-center gap-2 text-xs text-slate">
                  <span class="truncate">{{ typeLabel(notification.type) }}</span>
                  <span
                    class="size-1 shrink-0 rounded-full bg-hairline-strong"
                    aria-hidden="true"
                  ></span>
                  <span class="shrink-0">{{ formatDateTime(notification.createdAt) }}</span>
                </span>

                <span v-if="!notification.isRead" class="sr-only"
                  >Unread. Activate to mark as read.</span
                >
              </span>
            </button>
          </li>
        </ul>

        <!--
          The panel shows five rows. Without this, a user with twelve
          notifications has no way to know the other seven exist — and only a
          student has a page to find them on, so the wording stays count-only.
        -->
        <p v-if="notifications.length > PREVIEW_LIMIT" class="py-3 text-center text-xs text-slate">
          Showing {{ preview.length }} of {{ notifications.length }}
        </p>
      </div>

      <!--
        The footer link used to be `to="#"`, which resolves to the page you are
        already on and looks like navigation. Students have a real
        notifications screen; instructors and admins do not, so theirs points at
        the dashboard rather than a page that was invented to fill the gap.
      -->
      <div class="mt-3 border-t border-hairline-soft pt-3">
        <RouterLink
          v-if="hasNotificationsPage"
          to="/student/notifications"
          class="flex w-full items-center justify-center rounded-md border border-hairline bg-canvas px-3 py-2 text-theme-sm font-medium text-slate shadow-theme-xs transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
          @click="closeDropdown"
        >
          View all notifications
          <ChevronRight class="ms-1.5 size-4 rtl:rotate-180" aria-hidden="true" />
        </RouterLink>
        <RouterLink
          v-else
          :to="homePath"
          class="flex w-full items-center justify-center rounded-md border border-hairline bg-canvas px-3 py-2 text-theme-sm font-medium text-slate shadow-theme-xs transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
          @click="closeDropdown"
        >
          Go to your dashboard
          <ChevronRight class="ms-1.5 size-4 rtl:rotate-180" aria-hidden="true" />
        </RouterLink>
      </div>
    </div>
    <!-- Dropdown End -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import {
  Award,
  BadgeCheck,
  Bell,
  BellOff,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  CircleX,
  ClipboardCheck,
  GraduationCap,
  LoaderCircle,
  Megaphone,
  MessageSquare,
  RefreshCw,
  School,
  X,
} from 'lucide-vue-next'
import HeaderIconButton from '@/components/layout/HeaderIconButton.vue'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/learning.service'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/types'
import type { NotificationType, StudentNotification } from '@/services/learning.service'

/**
 * How many rows the panel shows before deferring to the full page.
 *
 * Five is what fits a panel this height without scrolling, so the dropdown
 * stays a glance rather than becoming a second, worse copy of the list.
 */
const PREVIEW_LIMIT = 5

const auth = useAuthStore()
const router = useRouter()

const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const notifications = ref<StudentNotification[]>([])
const unreadCount = ref(0)
/** Shared with the sidebar so the two surfaces cannot show different numbers. */
const unread = useUnreadNotifications()
const isLoading = ref(true)
/** False until the first read resolves, so "nothing new" is never guessed. */
const hasLoaded = ref(false)
const errorMessage = ref('')
const actionError = ref('')
/** Id of the row being written, or `'all'`. Null when nothing is in flight. */
const markingId = ref<string | null>(null)

const markingAll = computed(() => markingId.value === 'all')

const preview = computed(() => notifications.value.slice(0, PREVIEW_LIMIT))

/** What the bell announces, since a coloured dot is silent. */
const buttonLabel = computed(() => {
  if (!hasLoaded.value) return 'Notifications, still loading'
  if (unreadCount.value === 0) return 'Notifications, none unread'
  return `${unreadCount.value} unread notification${unreadCount.value === 1 ? '' : 's'}`
})

/** Only students have a notifications screen. Inventing one for the others
 *  would be a link to nowhere dressed as a feature. An unresolved role is
 *  treated as a student, which is also what `auth.homePath` does. */
const hasNotificationsPage = computed(() => auth.role !== 'instructor' && auth.role !== 'admin')

const homePath = computed(() => auth.homePath)

/**
 * Icon and wording per notification type.
 *
 * The same vocabulary as `views/student/Notifications.vue`, so a "Certificate
 * revoked" is called the same thing in the dropdown as on the page. Duplicated
 * rather than shared: `<script setup>` cannot export, and the mapping is small
 * enough that a wrong copy is cheaper to spot than a wrong abstraction. It
 * should be lifted into a shared module the next time the list is touched.
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

/** Unknown types fall back rather than rendering nothing: the enum in Postgres
 *  can gain a value before this map does. */
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
    // The feed is keyed on the profile id, which the store may still be
    // resolving on a cold load.
    await auth.ensureReady()
    const userId = auth.profile?.id
    if (!userId) {
      errorMessage.value = 'Your profile has not loaded yet. Give it a moment and try again.'
      return
    }
    const feed = await listNotifications(userId)
    notifications.value = feed.notifications
    unreadCount.value = feed.unreadCount
    // Published so the sidebar's Notifications badge reads the same number. Both
    // surfaces showing a different count from the same rows is the exact failure
    // this singleton exists to prevent.
    unread.set(userId, feed.unreadCount)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load your notifications.'
  } finally {
    isLoading.value = false
    hasLoaded.value = true
  }
}

/**
 * Re-read the feed after a write rather than patching the row in place.
 *
 * The unread count is derived from the rows, so editing one row by hand and
 * decrementing a number is how a count and the list beneath it drift apart.
 */
async function refresh(userId: string): Promise<void> {
  const feed = await listNotifications(userId)
  notifications.value = feed.notifications
  unreadCount.value = feed.unreadCount
  unread.set(userId, feed.unreadCount)
}

async function markRead(id: string): Promise<void> {
  const userId = auth.profile?.id
  if (!userId) return
  actionError.value = ''
  markingId.value = id
  try {
    await markNotificationRead(id, userId)
    await refresh(userId)
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : 'Could not mark that as read. Try again.'
  } finally {
    markingId.value = null
  }
}

async function markAllRead(): Promise<void> {
  const userId = auth.profile?.id
  if (!userId) return
  actionError.value = ''
  markingId.value = 'all'
  try {
    await markAllNotificationsRead(userId)
    await refresh(userId)
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : 'Could not mark them as read. Try again.'
  } finally {
    markingId.value = null
  }
}

/**
 * Mark as read, then follow the notification's link.
 *
 * `link` is written by a server-side `notify` call and the service already
 * discards anything that is not a slash-prefixed path, so it stays inside the
 * router rather than reloading the app.
 */
async function open(notification: StudentNotification): Promise<void> {
  closeDropdown()
  if (!notification.isRead) {
    await markRead(notification.id)
  }
  if (notification.link) {
    await router.push(notification.link)
  }
}

function toggleDropdown(): void {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown(): void {
  dropdownOpen.value = false
}

function handleClickOutside(event: MouseEvent): void {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !dropdownOpen.value) return
  event.stopPropagation()
  closeDropdown()
}

// Loaded on mount rather than on first open: the unread dot sits on the button
// and has to be true before anyone clicks it.
onMounted(() => {
  void load()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

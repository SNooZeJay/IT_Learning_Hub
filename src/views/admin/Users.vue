<template>
  <div>
    <PageHeader
      title="Users and roles"
      subtitle="Every account on the platform, and the two things an administrator can change about it."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Users' }]"
    >
      <template #actions>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface"
          :disabled="isLoading"
          @click="load"
        >
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading users" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load the user list"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total accounts"
          :value="String(users.length)"
          :icon="Users"
          :hint="`${users.length === 1 ? '1 person' : `${users.length} people`} on the platform`"
        />
        <StatCard
          label="Students"
          :value="String(roleCount('student'))"
          :icon="GraduationCap"
          hint="Default role for a new sign-up"
        />
        <StatCard
          label="Instructors"
          :value="String(roleCount('instructor'))"
          :icon="Presentation"
          hint="Can be assigned to a course"
        />
        <StatCard
          label="Admins"
          :value="String(roleCount('admin'))"
          :icon="ShieldCheck"
          :hint="`${suspendedCount} suspended`"
        />
      </div>

      <!--
        An audit row that failed to write is shown once, at the top, rather than
        folded away per row: the change itself succeeded, and the only thing lost
        is the record that it happened.
      -->
      <Alert
        v-if="auditWarning"
        variant="warning"
        title="The change was saved, but the activity log was not"
        :message="auditWarning"
        class="mt-6"
      />

      <!--
        Client-side filtering. The whole roster is already in memory, so a filter
        per keystroke would be a round trip to answer a question the browser can
        answer for free.
      -->
      <div class="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="relative w-full lg:max-w-xs">
          <Search
            class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted"
            aria-hidden="true"
          />
          <input
            v-model.trim="search"
            type="search"
            placeholder="Search name or email"
            :class="searchClass"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate">Role</span>
            <select v-model="roleFilter" :class="selectClass">
              <option value="all">All roles</option>
              <option v-for="role in ROLES" :key="role" :value="role">
                {{ ROLE_LABELS[role] }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate">Status</span>
            <select v-model="statusFilter" :class="selectClass">
              <option value="all">All statuses</option>
              <option v-for="status in ACCOUNT_STATUSES" :key="status" :value="status">
                {{ ACCOUNT_STATUS_LABELS[status] }}
              </option>
            </select>
          </label>

          <p class="self-end pb-2 text-sm text-slate sm:text-end">
            {{ filtered.length }} of {{ users.length }}
          </p>
        </div>
      </div>

      <EmptyState
        v-if="users.length === 0"
        class="mt-6"
        title="No accounts yet"
        description="Accounts appear here the moment somebody registers. New sign-ups start as students."
        :icon="Users"
      />

      <EmptyState
        v-else-if="filtered.length === 0"
        class="mt-6"
        title="Nothing matches those filters"
        description="Try a different search word, or set the role and status filters back to all."
        :icon="Search"
      />

      <div v-else class="mt-6 overflow-hidden rounded-lg border border-hairline bg-canvas">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="min-w-full text-start text-sm">
            <caption class="sr-only">
              Every account, with role and account status controls
            </caption>
            <thead>
              <tr class="bg-surface text-xs tracking-wide text-slate uppercase">
                <th scope="col" class="px-5 py-3 text-start font-medium">Person</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Role</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Account</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Joined</th>
                <th scope="col" class="px-5 py-3 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline">
              <template v-for="user in filtered" :key="user.id">
                <tr class="align-top transition-colors hover:bg-surface-soft">
                  <td class="px-5 py-4">
                    <div class="flex items-center gap-3">
                      <span
                        class="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                      >
                        <img
                          v-if="user.avatarUrl"
                          :src="user.avatarUrl"
                          :alt="user.fullName"
                          class="size-full object-cover"
                        />
                        <template v-else>{{ initials(user.fullName) }}</template>
                      </span>
                      <div class="min-w-0">
                        <p class="flex flex-wrap items-center gap-2 font-medium text-ink">
                          <span class="truncate">{{ user.fullName }}</span>
                          <span
                            v-if="user.id === auth.profile?.id"
                            class="rounded-full bg-brand-50 px-2 py-0.5 text-theme-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                          >
                            You
                          </span>
                        </p>
                        <p class="truncate text-slate">{{ user.email }}</p>
                      </div>
                    </div>
                  </td>

                  <td class="px-5 py-4">
                    <select
                      :value="user.role"
                      :disabled="isBusy(user.id)"
                      :aria-label="`Role for ${user.fullName}`"
                      :class="[inlineSelectClass, roleToneClass[user.role]]"
                      @change="onRoleChange(user, $event)"
                    >
                      <option v-for="role in ROLES" :key="role" :value="role">
                        {{ ROLE_LABELS[role] }}
                      </option>
                    </select>
                  </td>

                  <td class="px-5 py-4">
                    <span
                      :class="[
                        'rounded-full px-2.5 py-1 text-xs font-medium',
                        statusToneClass[user.status],
                      ]"
                    >
                      {{ ACCOUNT_STATUS_LABELS[user.status] }}
                    </span>
                  </td>

                  <td class="px-5 py-4 text-slate">{{ formatDate(user.createdAt) }}</td>

                  <td class="px-5 py-4 text-end">
                    <button
                      v-if="user.status !== 'suspended'"
                      type="button"
                      :disabled="isBusy(user.id)"
                      :class="[
                        actionButtonClass,
                        'hover:border-error-500 hover:text-error-600 dark:hover:text-error-400',
                      ]"
                      @click="onStatusChange(user, 'suspended')"
                    >
                      <LoaderCircle
                        v-if="busyRowId === `${user.id}:suspended`"
                        class="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      <Ban v-else class="size-3.5" aria-hidden="true" />
                      Suspend
                    </button>
                    <button
                      v-else
                      type="button"
                      :disabled="isBusy(user.id)"
                      :class="actionButtonClass"
                      @click="onStatusChange(user, 'active')"
                    >
                      <LoaderCircle
                        v-if="busyRowId === `${user.id}:active`"
                        class="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      <CircleCheck v-else class="size-3.5" aria-hidden="true" />
                      Activate
                    </button>
                  </td>
                </tr>

                <!--
                  The database's refusal, shown on the row that caused it. The
                  self-role-change and last-administrator guards both raise plain
                  sentences, and a generic toast would throw both away.
                -->
                <tr v-if="rowNotices[user.id]" class="bg-surface-soft">
                  <td :colspan="5" class="px-5 py-3">
                    <p
                      class="flex items-start gap-2 text-sm"
                      :class="
                        rowNoticeTone[user.id] === 'success'
                          ? 'text-success-700 dark:text-success-400'
                          : 'text-error-700 dark:text-error-400'
                      "
                    >
                      <CircleCheck
                        v-if="rowNoticeTone[user.id] === 'success'"
                        class="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <CircleAlert v-else class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{{ rowNotices[user.id] }}</span>
                    </p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <p class="mt-4 text-sm text-slate">
        The last administrator cannot be removed or demoted. That refusal is shown on the row that
        caused it rather than hidden, so nobody is left wondering why a change did not save.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  GraduationCap,
  LoaderCircle,
  Presentation,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  AdminError,
  ROLE_LABELS,
  ROLES,
  changeUserRole,
  changeUserStatus,
  listAllUsers,
  logAdminAction,
} from '@/services/admin.service'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/types'
import type { AdminUser } from '@/services/admin.service'
import { selectClass } from '@/components/ui/controlClasses'
import type { AccountStatus, Role } from '@/types'

const auth = useAuthStore()

const users = ref<AdminUser[]>([])
const search = ref('')
const roleFilter = ref<Role | 'all'>('all')
const statusFilter = ref<AccountStatus | 'all'>('all')

const isLoading = ref(true)
const errorMessage = ref('')
/** `userId:action`, so a role change and a status change cannot both look busy. */
const busyRowId = ref<string | null>(null)
const rowNotices = ref<Record<string, string>>({})
const rowNoticeTone = ref<Record<string, 'success' | 'error'>>({})
const auditWarning = ref('')

const searchClass =
  'w-full rounded border border-hairline-strong bg-canvas py-2.5 ps-9 pe-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden'

const inlineSelectClass =
  'rounded-md border border-hairline-strong bg-canvas py-1.5 ps-2.5 pe-2 text-xs font-medium focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'

const actionButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50'

const roleToneClass: Record<Role, string> = {
  admin: 'text-brand-700 dark:text-brand-400',
  instructor: 'text-ink',
  student: 'text-ink',
}

const statusToneClass: Record<AccountStatus, string> = {
  active: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  invited: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  suspended: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
}

const filtered = computed(() => {
  const term = search.value.toLowerCase()

  return users.value.filter((user) => {
    if (roleFilter.value !== 'all' && user.role !== roleFilter.value) return false
    if (statusFilter.value !== 'all' && user.status !== statusFilter.value) return false
    if (!term) return true
    return user.fullName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
  })
})

const suspendedCount = computed(
  () => users.value.filter((user) => user.status === 'suspended').length,
)

function roleCount(role: Role): number {
  return users.value.filter((user) => user.role === role).length
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function isBusy(userId: string): boolean {
  return busyRowId.value !== null && busyRowId.value.startsWith(`${userId}:`)
}

function notice(userId: string, message: string, tone: 'success' | 'error'): void {
  rowNotices.value = { ...rowNotices.value, [userId]: message }
  rowNoticeTone.value = { ...rowNoticeTone.value, [userId]: tone }
}

/** Drops a row's previous message so the next outcome is the only one on screen. */
function clearNotice(userId: string): void {
  const notices = { ...rowNotices.value }
  const tones = { ...rowNoticeTone.value }
  delete notices[userId]
  delete tones[userId]
  rowNotices.value = notices
  rowNoticeTone.value = tones
}

/**
 * Records the attempt either way.
 *
 * A failed audit write must not undo a successful change, so the reason is
 * returned rather than thrown and is shown as a single warning above the table.
 */
async function audit(
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
  succeeded: boolean,
): Promise<void> {
  const message = await logAdminAction(
    `${action}.${succeeded ? 'succeeded' : 'refused'}`,
    'profile',
    entityId,
    metadata,
  )
  auditWarning.value = message ?? ''
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  rowNotices.value = {}
  rowNoticeTone.value = {}
  try {
    users.value = await listAllUsers()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load the user list.'
  } finally {
    isLoading.value = false
  }
}

/**
 * Re-reads the roster after a change without unmounting the table.
 *
 * A full `load()` would swap in the loading skeleton and drop every per-row
 * message, so the confirmation that the change landed would never be seen. This
 * keeps the table on screen and lets the notice set afterwards survive.
 *
 * A failure here sets the page-level error rather than being swallowed: the row
 * already says what happened, and hiding a second failure would be the kind of
 * quiet that makes a settings screen untrustworthy.
 */
async function refresh(): Promise<void> {
  try {
    users.value = await listAllUsers()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not refresh the user list.'
  }
}

async function onRoleChange(user: AdminUser, event: Event): Promise<void> {
  const next = (event.target as HTMLSelectElement).value as Role
  if (next === user.role) return

  busyRowId.value = `${user.id}:role`
  clearNotice(user.id)

  try {
    await changeUserRole(user.id, next)
    await audit('role.change', user.id, { from: user.role, to: next }, true)
    await refresh()
    notice(user.id, `${user.fullName} is now ${ROLE_LABELS[next].toLowerCase()}.`, 'success')
  } catch (error) {
    // AdminError messages are written to be shown to a person — "Cannot demote
    // the last administrator." — so they pass through untouched. Anything else is
    // an unexpected failure and gets our own wording instead.
    const message = error instanceof AdminError ? error.message : 'Could not change this role.'
    await audit('role.change', user.id, { from: user.role, to: next }, false)
    // Refreshed so the select is repainted from the database. The role did not
    // change, and leaving the control on the value that was just refused would be
    // a claim the database has already denied.
    await refresh()
    notice(user.id, message, 'error')
  } finally {
    busyRowId.value = null
  }
}

async function onStatusChange(user: AdminUser, status: AccountStatus): Promise<void> {
  busyRowId.value = `${user.id}:${status}`
  clearNotice(user.id)

  try {
    await changeUserStatus(user.id, status)
    await audit('account.status.change', user.id, { to: status }, true)
    await refresh()
    notice(
      user.id,
      status === 'suspended'
        ? `${user.fullName} is suspended and can no longer start a course.`
        : `${user.fullName} is active again.`,
      'success',
    )
  } catch (error) {
    const message =
      error instanceof AdminError ? error.message : 'Could not change this account status.'
    await audit('account.status.change', user.id, { to: status }, false)
    notice(user.id, message, 'error')
  } finally {
    busyRowId.value = null
  }
}

onMounted(load)
</script>

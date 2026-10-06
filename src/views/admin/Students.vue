<template>
  <div>
    <PageHeader
      title="Students"
      subtitle="Every learner on the platform, with how much of the catalogue they have actually started."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Students' }]"
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

    <LoadingState v-if="isLoading" label="Loading students" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load the student list"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          :value="String(students.length)"
          :icon="GraduationCap"
          :hint="`${students.length === 1 ? 'one account' : 'accounts'} with the student role`"
        />
        <StatCard
          label="Enrolled"
          :value="String(enrolledCount)"
          :icon="BookOpen"
          :hint="`${enrolledPercent}% of students have started a course`"
        />
        <StatCard
          label="Completed"
          :value="String(completedEnrolments)"
          :icon="CircleCheck"
          hint="Enrollments the database marks completed"
        />
        <StatCard
          label="Suspended"
          :value="String(suspendedCount)"
          :icon="Ban"
          :hint="`${suspendedCount === 0 ? 'nobody' : 'cannot start a course'}`"
        />
      </div>

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

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate">Account status</span>
            <select v-model="statusFilter" :class="selectClass">
              <option value="all">All statuses</option>
              <option v-for="status in ACCOUNT_STATUSES" :key="status" :value="status">
                {{ ACCOUNT_STATUS_LABELS[status] }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate">Enrollments</span>
            <select v-model="enrolmentFilter" :class="selectClass">
              <option value="all">Any number</option>
              <option value="none">None yet</option>
              <option value="some">At least one</option>
              <option value="completed">Finished one</option>
            </select>
          </label>
        </div>
      </div>

      <p class="mt-3 text-sm text-slate lg:text-end">
        {{ filtered.length }} of {{ students.length }}
      </p>

      <EmptyState
        v-if="students.length === 0"
        class="mt-6"
        title="No students yet"
        description="Accounts created through the sign-up form arrive here automatically, with the student role."
        :icon="GraduationCap"
      />

      <EmptyState
        v-else-if="filtered.length === 0"
        class="mt-6"
        title="No students match those filters"
        description="Try a different search word, or widen the account status and enrollment filters."
        :icon="Search"
      />

      <div v-else class="mt-4 overflow-hidden rounded-lg border border-hairline bg-canvas">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="min-w-full text-start text-sm">
            <caption class="sr-only">
              Students with their enrollment counts
            </caption>
            <thead>
              <tr class="bg-surface text-xs tracking-wide text-slate uppercase">
                <th scope="col" class="px-5 py-3 text-start font-medium">Student</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Account</th>
                <th scope="col" class="px-5 py-3 text-end font-medium">Enrolled</th>
                <th scope="col" class="px-5 py-3 text-end font-medium">Active</th>
                <th scope="col" class="px-5 py-3 text-end font-medium">Completed</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Last enrolled</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Joined</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline">
              <tr
                v-for="student in filtered"
                :key="student.id"
                class="transition-colors hover:bg-surface-soft"
              >
                <td class="px-5 py-4">
                  <p class="truncate font-medium text-ink">{{ student.fullName }}</p>
                  <p class="truncate text-slate">{{ student.email }}</p>
                </td>
                <td class="px-5 py-4">
                  <span
                    :class="[
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      statusToneClass[student.status],
                    ]"
                  >
                    {{ ACCOUNT_STATUS_LABELS[student.status] }}
                  </span>
                </td>
                <td class="px-5 py-4 text-end tabular-nums text-ink">
                  {{ student.enrolmentCount }}
                </td>
                <td class="px-5 py-4 text-end tabular-nums text-ink">{{ student.activeCount }}</td>
                <td class="px-5 py-4 text-end tabular-nums text-ink">
                  {{ student.completedCount }}
                </td>
                <td class="px-5 py-4 text-slate">
                  {{ student.lastEnrolledAt ? formatDate(student.lastEnrolledAt) : '—' }}
                </td>
                <td class="px-5 py-4 text-slate">{{ formatDate(student.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="mt-4 text-sm text-slate">
        Counts come from the <code class="font-mono text-xs">enrollments</code> table as it stands
        right now. A row with a zero here has never opened a course, not a course with no students —
        the second case is the courses screen.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Ban, BookOpen, CircleCheck, GraduationCap, RotateCcw, Search } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, listAllStudents } from '@/services/admin.service'
import { formatDate } from '@/types'
import type { AdminStudent } from '@/services/admin.service'
import type { AccountStatus } from '@/types'

type EnrolmentFilter = 'all' | 'none' | 'some' | 'completed'

const students = ref<AdminStudent[]>([])
const search = ref('')
const statusFilter = ref<AccountStatus | 'all'>('all')
const enrolmentFilter = ref<EnrolmentFilter>('all')

const isLoading = ref(true)
const errorMessage = ref('')

const searchClass =
  'w-full rounded border border-hairline-strong bg-canvas py-2.5 ps-9 pe-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden'

const selectClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden'

const statusToneClass: Record<AccountStatus, string> = {
  active: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  invited: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  suspended: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
}

const filtered = computed(() => {
  const term = search.value.toLowerCase()

  return students.value.filter((student) => {
    if (statusFilter.value !== 'all' && student.status !== statusFilter.value) return false

    if (enrolmentFilter.value === 'none' && student.enrolmentCount > 0) return false
    if (enrolmentFilter.value === 'some' && student.enrolmentCount === 0) return false
    if (enrolmentFilter.value === 'completed' && student.completedCount === 0) return false

    if (!term) return true
    return (
      student.fullName.toLowerCase().includes(term) || student.email.toLowerCase().includes(term)
    )
  })
})

const enrolledCount = computed(
  () => students.value.filter((student) => student.enrolmentCount > 0).length,
)

const enrolledPercent = computed(() =>
  students.value.length === 0 ? 0 : Math.round((enrolledCount.value / students.value.length) * 100),
)

const completedEnrolments = computed(() =>
  students.value.reduce((total, student) => total + student.completedCount, 0),
)

const suspendedCount = computed(
  () => students.value.filter((student) => student.status === 'suspended').length,
)

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    students.value = await listAllStudents()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load the student list.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

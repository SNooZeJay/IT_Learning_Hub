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
          hint="Enrollments recorded as completed"
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
          <Input
            v-model.trim="search"
            type="search"
            aria-label="Search student name or email"
            placeholder="Search name or email"
            class="ps-9"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <Label for="stu-status-filter" class="mb-1 block text-xs font-medium text-slate">
              Account status
            </Label>
            <Select v-model="statusFilter">
              <SelectTrigger id="stu-status-filter" class="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem v-for="status in ACCOUNT_STATUSES" :key="status" :value="status">
                  {{ ACCOUNT_STATUS_LABELS[status] }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label for="stu-enrol-filter" class="mb-1 block text-xs font-medium text-slate">
              Enrollments
            </Label>
            <Select v-model="enrolmentFilter">
              <SelectTrigger id="stu-enrol-filter" class="w-full">
                <SelectValue placeholder="Any number" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any number</SelectItem>
                <SelectItem value="none">None yet</SelectItem>
                <SelectItem value="some">At least one</SelectItem>
                <SelectItem value="completed">Finished one</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

      <div v-else class="mt-4 surface-card-shell">
        <div class="overflow-x-auto custom-scrollbar">
          <Table class="min-w-full text-start text-sm">
            <TableCaption class="sr-only"> Students with their enrollment counts </TableCaption>
            <TableHeader>
              <TableRow
                class="bg-surface text-xs tracking-wide text-slate uppercase hover:bg-surface"
              >
                <TableHead scope="col" class="px-5 py-3 text-start font-medium">Student</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-start font-medium">Account</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium">Enrolled</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium">Active</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium">Completed</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-start font-medium"
                  >Last enrolled</TableHead
                >
                <TableHead scope="col" class="px-5 py-3 text-start font-medium">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody class="divide-y divide-hairline">
              <TableRow
                v-for="student in filtered"
                :key="student.id"
                class="transition-colors hover:bg-surface-soft"
              >
                <TableCell class="px-5 py-4">
                  <p class="truncate font-medium text-ink">{{ student.fullName }}</p>
                  <p class="truncate text-slate">{{ student.email }}</p>
                </TableCell>
                <TableCell class="px-5 py-4">
                  <Badge :class="statusToneClass[student.status]">
                    {{ ACCOUNT_STATUS_LABELS[student.status] }}
                  </Badge>
                </TableCell>
                <TableCell class="px-5 py-4 text-end tabular-nums text-ink">
                  {{ student.enrolmentCount }}
                </TableCell>
                <TableCell class="px-5 py-4 text-end tabular-nums text-ink">{{
                  student.activeCount
                }}</TableCell>
                <TableCell class="px-5 py-4 text-end tabular-nums text-ink">
                  {{ student.completedCount }}
                </TableCell>
                <TableCell class="px-5 py-4 text-slate">
                  {{ student.lastEnrolledAt ? formatDate(student.lastEnrolledAt) : '—' }}
                </TableCell>
                <TableCell class="px-5 py-4 text-slate">{{
                  formatDate(student.createdAt)
                }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <p class="mt-4 text-sm text-slate">
        Counts are the students' own records as they stand right now. A zero here means this student
        has never opened a course. A course with no students is a different fact, and belongs on the
        courses screen.
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
import { Input } from '@/components/public/ui/input'
import { Label } from '@/components/public/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/public/ui/select'
import { Badge } from '@/components/public/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/public/ui/table'
import type { AccountStatus } from '@/types'

type EnrolmentFilter = 'all' | 'none' | 'some' | 'completed'

const students = ref<AdminStudent[]>([])
const search = ref('')
const statusFilter = ref<AccountStatus | 'all'>('all')
const enrolmentFilter = ref<EnrolmentFilter>('all')

const isLoading = ref(true)
const errorMessage = ref('')

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

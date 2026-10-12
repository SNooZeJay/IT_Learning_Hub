<template>
  <div>
    <PageHeader
      title="My students"
      subtitle="Everyone enrolled in a course you teach, and how far through they are."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Students' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your students" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="rows.length === 0"
      title="No students yet"
      description="Students appear here as they enroll in one of your courses. Publish a course to let them find it."
      :icon="Users"
    />

    <template v-else>
      <!-- Filter row. Client-side: the full set is already in memory. -->
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative sm:max-w-xs sm:flex-1">
          <Search
            class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-gray-400"
          />
          <Input
            v-model.trim="search"
            type="search"
            aria-label="Search by name, email or course"
            placeholder="Search by name, email or course"
            class="ps-9"
          />
        </div>

        <div class="relative sm:w-64">
          <Label for="course-filter" class="sr-only">Filter by course</Label>
          <Select v-model="courseFilter">
            <SelectTrigger id="course-filter" class="w-full sm:w-64">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All courses</SelectItem>
              <SelectItem v-for="course in courseOptions" :key="course" :value="course">
                {{ course }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <EmptyState
        v-if="filtered.length === 0"
        title="Nobody matches those filters"
        description="Try a different name, or clear the course filter."
        :icon="Search"
      />

      <template v-else>
        <dl class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Enrollments
            </dt>
            <dd class="mt-1 text-xl font-semibold text-gray-900 dark:text-white/90">
              {{ filtered.length }}
            </dd>
          </div>
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Distinct students
            </dt>
            <dd class="mt-1 text-xl font-semibold text-gray-900 dark:text-white/90">
              {{ distinctStudents }}
            </dd>
          </div>
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Completed
            </dt>
            <dd class="mt-1 text-xl font-semibold text-gray-900 dark:text-white/90">
              {{ completedCount }}
            </dd>
          </div>
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Average progress
            </dt>
            <dd class="mt-1 text-xl font-semibold text-gray-900 dark:text-white/90">
              {{ averageProgress === null ? '—' : `${averageProgress}%` }}
            </dd>
          </div>
        </dl>

        <div class="overflow-x-auto surface-card-shell">
          <Table class="w-full min-w-3xl text-start">
            <TableCaption class="sr-only">
              Students with their course enrollments and progress
            </TableCaption>
            <TableHeader>
              <TableRow class="border-b border-gray-200 dark:border-gray-800 hover:bg-transparent">
                <TableHead
                  v-for="heading in HEADINGS"
                  :key="heading"
                  scope="col"
                  class="px-6 py-3 text-start text-xs font-medium tracking-wide text-slate uppercase"
                  :class="heading === 'Progress' ? 'w-56' : ''"
                >
                  {{ heading }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody class="divide-y divide-gray-200 dark:divide-gray-800">
              <TableRow
                v-for="row in filtered"
                :key="row.enrollmentId"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <TableCell class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <span
                      class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                    >
                      {{ initials(row.studentName) }}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-gray-900 dark:text-white/90">
                        {{ row.studentName }}
                      </p>
                      <!--
                        Empty rather than blank when the profile is hidden. RLS
                        permits an instructor to see students who share a course
                        with them, but a data mismatch can leave one name-less, and
                        an empty cell would read as a blank name.
                      -->
                      <p v-if="row.studentEmail" class="truncate text-xs text-slate">
                        {{ row.studentEmail }}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  <router-link
                    :to="`/instructor/courses/${row.courseId}`"
                    class="inline-block py-1 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {{ row.courseTitle }}
                  </router-link>
                </TableCell>

                <TableCell class="px-6 py-4">
                  <span
                    class="inline-flex rounded px-2 py-1 text-xs font-medium"
                    :class="statusClass(row.status)"
                  >
                    {{ enrollmentStatusLabel(row.status) }}
                  </span>
                </TableCell>

                <TableCell class="px-6 py-4">
                  <!--
                    A course with no lessons has no denominator, so it renders as
                    "no lessons yet" rather than a 0% bar. A progress bar at zero
                    is a claim about a student, and there is nothing to have
                    progressed through.
                  -->
                  <template v-if="row.progressPercent === null">
                    <p class="text-xs text-slate">No lessons yet</p>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-3">
                      <div
                        class="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]"
                        role="img"
                        :aria-label="`${row.studentName} is ${row.progressPercent}% through ${row.courseTitle}`"
                      >
                        <div
                          class="h-full rounded-full transition-all"
                          :class="
                            row.progressPercent === 100
                              ? 'bg-success-500'
                              : row.progressPercent > 0
                                ? 'bg-brand-500'
                                : 'bg-gray-300 dark:bg-gray-600'
                          "
                          :style="{ width: `${row.progressPercent}%` }"
                        />
                      </div>
                      <span
                        class="w-10 shrink-0 text-end text-sm font-medium text-gray-900 dark:text-white/90"
                      >
                        {{ row.progressPercent }}%
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-slate">
                      {{ row.lessonsCompleted }} of {{ row.lessonsTotal }} lessons
                    </p>
                  </template>
                </TableCell>

                <TableCell class="px-6 py-4 section-subheading">
                  {{ formatDate(row.enrolledAt) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search, Users } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { listInstructorStudents } from '@/services/instructor.service'
import type { InstructorStudentRow } from '@/services/instructor.service'
import type { EnrollmentStatus } from '@/types'
import { enrollmentStatusLabel, formatDate } from '@/types'
import { Input } from '@/components/public/ui/input'
import { Label } from '@/components/public/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/public/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/public/ui/table'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const rows = ref<InstructorStudentRow[]>([])
const search = ref('')
const courseFilter = ref('')
const isLoading = ref(true)
const errorMessage = ref('')

const HEADINGS = ['Student', 'Course', 'Status', 'Progress', 'Enrolled']

const filtered = computed(() => {
  const term = search.value.toLowerCase()
  return rows.value.filter((row) => {
    if (courseFilter.value && row.courseTitle !== courseFilter.value) return false
    if (!term) return true
    return (
      row.studentName.toLowerCase().includes(term) ||
      row.studentEmail.toLowerCase().includes(term) ||
      row.courseTitle.toLowerCase().includes(term)
    )
  })
})

// Options built from the loaded rows rather than from a separate course query,
// so a course with nobody enrolled in it cannot appear as a filter that always
// returns nothing.
const courseOptions = computed(() => [...new Set(rows.value.map((row) => row.courseTitle))].sort())

const distinctStudents = computed(() => new Set(filtered.value.map((row) => row.studentId)).size)

const completedCount = computed(
  () => filtered.value.filter((row) => row.status === 'completed').length,
)

const averageProgress = computed<number | null>(() => {
  // Rows with no denominator are excluded rather than counted as zero: a course
  // with no lessons would otherwise drag the average down for a reason that has
  // nothing to do with the students.
  const measurable = filtered.value.filter((row) => row.progressPercent !== null)
  if (measurable.length === 0) return null
  const total = measurable.reduce((sum, row) => sum + (row.progressPercent ?? 0), 0)
  return Math.round(total / measurable.length)
})

function statusClass(status: EnrollmentStatus): string {
  switch (status) {
    case 'active':
      return 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
    case 'completed':
      return 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
    case 'pending':
      return 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
  }
}

/**
 * Two initials for the avatar substitute.
 *
 * Falls back to "?" rather than an empty circle, because the row already says
 * "Student details unavailable" and a blank disc next to it reads as a missing
 * image rather than a missing profile.
 */
function initials(name: string): string {
  if (name.startsWith('Student details')) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    // Scoped to the signed-in instructor, so the profile has to resolve first.
    // Without the await the query runs with an empty id and returns nothing.
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so your students cannot be found.'
      return
    }
    rows.value = await listInstructorStudents(auth.profile.id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load your students.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

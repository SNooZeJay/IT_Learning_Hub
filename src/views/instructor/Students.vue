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
          <input
            v-model.trim="search"
            type="search"
            placeholder="Search by name, email or course"
            :class="searchClass"
          />
        </div>

        <div class="relative sm:w-64">
          <label for="course-filter" class="sr-only">Filter by course</label>
          <select id="course-filter" v-model="courseFilter" :class="selectClass">
            <option value="">All courses</option>
            <option v-for="course in courseOptions" :key="course" :value="course">
              {{ course }}
            </option>
          </select>
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
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90">
              {{ filtered.length }}
            </dd>
          </div>
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Distinct students
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90">
              {{ distinctStudents }}
            </dd>
          </div>
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Completed
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90">
              {{ completedCount }}
            </dd>
          </div>
          <div class="surface-card">
            <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Average progress
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90">
              {{ averageProgress === null ? '—' : `${averageProgress}%` }}
            </dd>
          </div>
        </dl>

        <div class="overflow-x-auto surface-card-shell">
          <table class="w-full min-w-3xl text-start">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-800">
                <th
                  v-for="heading in HEADINGS"
                  :key="heading"
                  scope="col"
                  class="px-6 py-3 text-start text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                  :class="heading === 'Progress' ? 'w-56' : ''"
                >
                  {{ heading }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr
                v-for="row in filtered"
                :key="row.enrollmentId"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <td class="px-6 py-4">
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
                      <p
                        v-if="row.studentEmail"
                        class="truncate text-xs text-gray-500 dark:text-gray-400"
                      >
                        {{ row.studentEmail }}
                      </p>
                    </div>
                  </div>
                </td>

                <td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  <router-link
                    :to="`/instructor/courses/${row.courseId}`"
                    class="hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {{ row.courseTitle }}
                  </router-link>
                </td>

                <td class="px-6 py-4">
                  <span
                    class="inline-flex rounded px-2 py-1 text-xs font-medium"
                    :class="statusClass(row.status)"
                  >
                    {{ enrollmentStatusLabel(row.status) }}
                  </span>
                </td>

                <td class="px-6 py-4">
                  <!--
                    A course with no lessons has no denominator, so it renders as
                    "no lessons yet" rather than a 0% bar. A progress bar at zero
                    is a claim about a student, and there is nothing to have
                    progressed through.
                  -->
                  <template v-if="row.progressPercent === null">
                    <p class="text-xs text-gray-500 dark:text-gray-400">No lessons yet</p>
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
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ row.lessonsCompleted }} of {{ row.lessonsTotal }} lessons
                    </p>
                  </template>
                </td>

                <td class="px-6 py-4 section-subheading">
                  {{ formatDate(row.enrolledAt) }}
                </td>
              </tr>
            </tbody>
          </table>
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
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const rows = ref<InstructorStudentRow[]>([])
const search = ref('')
const courseFilter = ref('')
const isLoading = ref(true)
const errorMessage = ref('')

const HEADINGS = ['Student', 'Course', 'Status', 'Progress', 'Enrolled']

const searchClass =
  'w-full rounded border border-gray-300 bg-white py-2.5 ps-9 pe-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const selectClass =
  'w-full rounded border border-gray-300 bg-white py-2.5 pe-3 ps-3 text-sm text-gray-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90'

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

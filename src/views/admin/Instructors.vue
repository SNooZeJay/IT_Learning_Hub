<template>
  <div>
    <PageHeader
      title="Instructors"
      subtitle="Everyone who can teach, and exactly which courses the database has assigned them to."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Instructors' }]"
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

    <LoadingState v-if="isLoading" label="Loading instructors" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load the instructor list"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Instructors"
          :value="String(instructors.length)"
          :icon="Users"
          :hint="`${instructors.length === 1 ? 'one account' : 'accounts'} with the instructor role`"
        />
        <StatCard
          label="Teaching"
          :value="String(teachingCount)"
          :icon="Library"
          hint="Course assignments across everyone"
        />
        <StatCard
          label="Published"
          :value="String(publishedCount)"
          :icon="CircleCheck"
          hint="Assignments on a published course"
        />
        <StatCard
          label="Unassigned"
          :value="String(unassignedCount)"
          :icon="UserX"
          :hint="`${unassignedCount === 0 ? 'everyone' : 'instructors'} have at least one course`"
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
            placeholder="Search name, email or course"
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
            <span class="mb-1 block text-xs font-medium text-slate">Course load</span>
            <select v-model="loadFilter" :class="selectClass">
              <option value="all">Any load</option>
              <option value="none">No courses</option>
              <option value="some">At least one</option>
            </select>
          </label>
        </div>
      </div>

      <p class="mt-3 text-sm text-slate lg:text-end">
        {{ filtered.length }} of {{ instructors.length }}
      </p>

      <EmptyState
        v-if="instructors.length === 0"
        class="mt-6"
        title="No instructors yet"
        description="Nobody holds the instructor role. Promote somebody from the users screen, then assign them a course."
        :icon="Users"
      />

      <EmptyState
        v-else-if="filtered.length === 0"
        class="mt-6"
        title="No instructors match those filters"
        description="Try a different search word, or widen the account status and course load filters."
        :icon="Search"
      />

      <div v-else class="mt-4 space-y-4">
        <article
          v-for="instructor in filtered"
          :key="instructor.id"
          class="rounded-lg border border-hairline bg-canvas p-5"
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
              >
                <img
                  v-if="instructor.avatarUrl"
                  :src="instructor.avatarUrl"
                  :alt="instructor.fullName"
                  class="size-full object-cover"
                />
                <template v-else>{{ initials(instructor.fullName) }}</template>
              </span>
              <div class="min-w-0">
                <h2 class="truncate text-theme-xl font-semibold text-ink">
                  {{ instructor.fullName }}
                </h2>
                <p class="truncate text-sm text-slate">{{ instructor.email }}</p>
                <p class="mt-1 text-sm text-slate">
                  <span v-if="instructor.phone">{{ instructor.phone }} · </span>
                  Joined {{ formatDate(instructor.createdAt) }}
                </p>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <span
                :class="[
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  statusToneClass[instructor.status],
                ]"
              >
                {{ ACCOUNT_STATUS_LABELS[instructor.status] }}
              </span>
              <span class="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-slate">
                {{ instructor.courseCount }}
                {{ instructor.courseCount === 1 ? 'course' : 'courses' }}
              </span>
            </div>
          </div>

          <!--
            The assignment list is the point of this screen. It is read-only here
            because assignment is made from the courses screen, next to the course
            it belongs to, so a single edit does not need two tabs.
          -->
          <div class="mt-4 border-t border-hairline pt-4">
            <h3 class="text-xs font-medium tracking-wide text-slate uppercase">Teaching</h3>

            <p v-if="instructor.courses.length === 0" class="mt-2 text-sm text-slate">
              Not assigned to any course yet. An instructor with no assignment cannot edit anything,
              because the database checks
              <code class="font-mono text-xs">course_instructors</code> before every course write.
            </p>

            <ul v-else class="mt-2 flex flex-wrap gap-2">
              <li v-for="course in instructor.courses" :key="course.courseId">
                <RouterLink
                  :to="`/courses/${course.slug}`"
                  class="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-2.5 py-1.5 text-sm text-ink transition hover:bg-surface"
                >
                  <component
                    :is="courseIcon(course.status)"
                    class="size-3.5 shrink-0"
                    :class="courseToneClass[course.status]"
                    aria-hidden="true"
                  />
                  <span class="max-w-[16rem] truncate">{{ course.title }}</span>
                  <span class="text-xs text-slate">
                    {{ COURSE_STATUS_LABELS[course.status] }}
                  </span>
                </RouterLink>
              </li>
            </ul>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Archive,
  CircleCheck,
  FileEdit,
  Library,
  RotateCcw,
  Search,
  Users,
  UserX,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  COURSE_STATUS_LABELS,
  listAllInstructors,
} from '@/services/admin.service'
import { formatDate } from '@/types'
import type { AdminInstructor } from '@/services/admin.service'
import type { AccountStatus, CourseStatus } from '@/types'
import type { Component } from 'vue'

type LoadFilter = 'all' | 'none' | 'some'

const instructors = ref<AdminInstructor[]>([])
const search = ref('')
const statusFilter = ref<AccountStatus | 'all'>('all')
const loadFilter = ref<LoadFilter>('all')

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

const courseToneClass: Record<CourseStatus, string> = {
  published: 'text-success-600 dark:text-success-400',
  draft: 'text-stone',
  archived: 'text-slate',
}

function courseIcon(status: CourseStatus): Component {
  if (status === 'published') return CircleCheck
  if (status === 'archived') return Archive
  return FileEdit
}

/**
 * Matches the instructor's own fields and their course titles.
 *
 * Searching the course list too is deliberate: the question an administrator
 * usually has is "who teaches the networking course", and searching only names
 * would make that a two-step task for no benefit.
 */
const filtered = computed(() => {
  const term = search.value.toLowerCase()

  return instructors.value.filter((instructor) => {
    if (statusFilter.value !== 'all' && instructor.status !== statusFilter.value) return false
    if (loadFilter.value === 'none' && instructor.courseCount > 0) return false
    if (loadFilter.value === 'some' && instructor.courseCount === 0) return false

    if (!term) return true
    return (
      instructor.fullName.toLowerCase().includes(term) ||
      instructor.email.toLowerCase().includes(term) ||
      instructor.courses.some((course) => course.title.toLowerCase().includes(term))
    )
  })
})

const teachingCount = computed(() =>
  instructors.value.reduce((total, instructor) => total + instructor.courseCount, 0),
)

const publishedCount = computed(() =>
  instructors.value.reduce((total, instructor) => total + instructor.publishedCourseCount, 0),
)

const unassignedCount = computed(
  () => instructors.value.filter((instructor) => instructor.courseCount === 0).length,
)

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    instructors.value = await listAllInstructors()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the instructor list.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

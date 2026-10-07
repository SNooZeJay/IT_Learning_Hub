<template>
  <div>
    <PageHeader
      title="My courses"
      subtitle="Everything you teach, drafts included."
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Courses' }]"
    >
      <template #actions>
        <router-link
          to="/instructor/courses/create"
          class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus class="size-4" />
          New course
        </router-link>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading your courses" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else>
      <!-- Filter row. Client-side only: the whole set is already in memory, so
           filtering here avoids a round trip per keystroke. -->
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative sm:max-w-xs sm:flex-1">
          <Search
            class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-gray-400"
          />
          <input
            v-model.trim="search"
            type="search"
            placeholder="Search your courses"
            :class="searchClass"
          />
        </div>
        <div class="flex items-center gap-2">
          <button
            v-for="option in STATUS_FILTERS"
            :key="option.value"
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              status === option.value
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.12]'
            "
            @click="status = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <EmptyState
        v-if="courses.length === 0"
        title="You are not teaching anything yet"
        description="Create your first course and build it up module by module. It stays a private draft until you publish it."
        :icon="Library"
      >
        <router-link
          to="/instructor/courses/create"
          class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          Create a course
        </router-link>
      </EmptyState>

      <template v-else>
        <EmptyState
          v-if="filtered.length === 0"
          title="Nothing matches those filters"
          description="Try a different word, or set the status back to All."
          :icon="Search"
        />

        <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="course in filtered" :key="course.id" class="flex flex-col surface-card">
            <div class="flex items-start justify-between gap-3">
              <span
                class="inline-flex rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
              >
                {{ course.categoryName ?? 'Uncategorised' }}
              </span>
              <!--
                Status as colour. Draft is deliberately the quieter of the two
                "live-ish" states, because the thing an instructor needs to see
                at a glance is which of their courses students can actually find.
              -->
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium"
                :class="{
                  'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400':
                    course.status === 'published',
                  'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400':
                    course.status === 'draft',
                  'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300':
                    course.status === 'archived',
                }"
              >
                <CircleDot v-if="course.status === 'published'" class="size-3" />
                <PencilLine v-else-if="course.status === 'draft'" class="size-3" />
                <Archive v-else class="size-3" />
                {{ course.status }}
              </span>
            </div>

            <h2 class="mt-3 text-theme-sm font-medium text-gray-900 dark:text-white/90">
              <router-link
                :to="`/instructor/courses/${course.id}`"
                class="hover:text-brand-600 dark:hover:text-brand-400"
              >
                {{ course.title }}
              </router-link>
            </h2>

            <p class="mt-2 line-clamp-2 flex-1 section-subheading">
              {{ course.description ?? 'No description yet.' }}
            </p>

            <!--
              A draft with no lessons shows the counts and an empty curriculum
              rather than a "0 lessons" line, because the two are different
              problems: the first is finished and quiet, the second is unfinished.
            -->
            <dl class="mt-4 grid grid-cols-3 gap-3 text-xs text-gray-500 dark:text-gray-400">
              <div>
                <dt>Lessons</dt>
                <dd class="mt-0.5 text-sm font-medium text-gray-900 dark:text-white/90">
                  {{ course.lessonCount }}
                </dd>
              </div>
              <div>
                <dt>Students</dt>
                <dd class="mt-0.5 text-sm font-medium text-gray-900 dark:text-white/90">
                  {{ course.enrolledCount }}
                </dd>
              </div>
              <div>
                <dt>Quizzes</dt>
                <dd class="mt-0.5 text-sm font-medium text-gray-900 dark:text-white/90">
                  {{ course.quizCount }}
                </dd>
              </div>
            </dl>

            <div class="mt-4 flex items-center gap-2">
              <router-link
                :to="`/instructor/courses/${course.id}/edit`"
                class="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                <Pencil class="size-4" />
                Edit
              </router-link>
              <router-link
                :to="`/instructor/courses/${course.id}`"
                class="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                Details
              </router-link>
            </div>
          </article>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Archive, CircleDot, Library, Pencil, PencilLine, Plus, Search } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { listInstructorCourses } from '@/services/instructor.service'
import type { InstructorCourse } from '@/services/instructor.service'
import type { CourseStatus } from '@/types'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const courses = ref<InstructorCourse[]>([])

/**
 * Seeded from `?q=`, and written back as it changes.
 *
 * The header's search box navigates here with the term in the query. It arrived
 * correctly and this page ignored the parameter, so the box appeared to do nothing.
 *
 * Written back with `router.replace` rather than `push`, so typing does not push a
 * history entry per keystroke - Back should leave the page, not walk through every
 * letter of the word that was typed.
 */
const route = useRoute()
const router = useRouter()
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')

watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : ''
    if (next !== search.value) search.value = next
  },
)

watch(search, (value) => {
  const current = typeof route.query.q === 'string' ? route.query.q : ''
  if (value === current) return
  void router.replace({
    query: value ? { ...route.query, q: value } : { ...route.query, q: undefined },
  })
})

const status = ref<CourseStatus | 'all'>('all')
const isLoading = ref(true)
const errorMessage = ref('')

const searchClass =
  'w-full rounded border border-gray-300 bg-white py-2.5 ps-9 pe-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const STATUS_FILTERS: Array<{ value: CourseStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const filtered = computed(() => {
  const term = search.value.toLowerCase()
  return courses.value.filter((course) => {
    if (status.value !== 'all' && course.status !== status.value) return false
    if (!term) return true
    return (
      course.title.toLowerCase().includes(term) ||
      (course.description ?? '').toLowerCase().includes(term)
    )
  })
})

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    // The course list is scoped to the signed-in instructor, so the profile has
    // to be resolved first. Without this await the query runs with no id and
    // resolves to an empty list rather than an error.
    await auth.ensureReady()
    if (!auth.profile) {
      errorMessage.value = 'Your profile has not loaded yet, so your courses cannot be found.'
      return
    }
    courses.value = await listInstructorCourses(auth.profile.id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load your courses.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

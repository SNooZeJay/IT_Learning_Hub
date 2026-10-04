<template>
  <div>
    <PageHeader
      title="Course catalogue"
      subtitle="Everything published on IT Learning Hub."
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Courses' }]"
    />

    <LoadingState v-if="isLoading" label="Loading courses" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="courses.length === 0"
      title="No courses published yet"
      description="Courses appear here as soon as an instructor publishes them. Check back soon, or ask your instructor what is coming."
      :icon="BookOpen"
    />

    <template v-else>
      <!-- Catalogue filter. Client-side only: the whole catalogue is already in
           memory, so filtering here avoids a round trip per keystroke. -->
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative sm:max-w-xs sm:flex-1">
          <Search
            class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-gray-400"
          />
          <input
            v-model.trim="search"
            type="search"
            placeholder="Search courses"
            :class="searchClass"
          />
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ filtered.length }} of {{ courses.length }} course{{ courses.length === 1 ? '' : 's' }}
        </p>
      </div>

      <EmptyState
        v-if="filtered.length === 0"
        title="Nothing matches that search"
        description="Try a different word, or clear the search to see everything."
        :icon="Search"
      />

      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CourseCard
          v-for="course in filtered"
          :key="course.id"
          :course="course"
          :enrolled="isEnrolled(course.id)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpen, Search } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import { listCourses } from '@/services/course.service'
import { listMyEnrollments } from '@/services/enrollment.service'
import { useAuthStore } from '@/stores/auth'
import type { Course } from '@/types'

const auth = useAuthStore()

const courses = ref<Course[]>([])
const enrolledIds = ref<Set<string>>(new Set())
const search = ref('')
const isLoading = ref(true)
const errorMessage = ref('')

const searchClass =
  'w-full rounded border border-gray-300 bg-white py-2.5 ps-9 pe-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const filtered = computed(() => {
  const term = search.value.toLowerCase()
  if (!term) return courses.value
  return courses.value.filter(
    (course) =>
      course.title.toLowerCase().includes(term) ||
      (course.description ?? '').toLowerCase().includes(term),
  )
})

function isEnrolled(courseId: string): boolean {
  return enrolledIds.value.has(courseId)
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const [all, mine] = await Promise.all([
      listCourses(),
      auth.profile ? listMyEnrollments(auth.profile.id) : Promise.resolve([]),
    ])
    courses.value = all.filter((course) => course.status === 'published')
    enrolledIds.value = new Set(
      mine.filter((e) => e.status === 'active').map((e) => e.courseId),
    )
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the course catalogue.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

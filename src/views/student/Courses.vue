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
            aria-label="Search courses"
            placeholder="Search courses"
            :class="searchClass"
          />
        </div>
        <p class="section-subheading">
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpen, Search } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import { searchInputClass } from '@/components/ui/controlClasses'
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

/**
 * Seeded from `?q=`, and written back as it changes.
 *
 * The header's search box navigates here with the term in the query rather than
 * filtering in place, because a search that only works from one screen is not a
 * search. It arrived correctly and this page ignored the parameter, so the box
 * appeared to do nothing.
 *
 * Written back with `router.replace` so the term is shareable and survives a reload,
 * and so typing does not push a history entry per keystroke - Back should leave the
 * page, not walk through every letter of the word that was typed.
 */
const route = useRoute()
const router = useRouter()
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')

// In: arriving from the header, or from a Back that changed the query.
watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : ''
    if (next !== search.value) search.value = next
  },
)

// Out: typing, so the field and the URL never disagree.
watch(search, (value) => {
  const current = typeof route.query.q === 'string' ? route.query.q : ''
  if (value === current) return
  void router.replace({
    query: value ? { ...route.query, q: value } : { ...route.query, q: undefined },
  })
})

const isLoading = ref(true)
const errorMessage = ref('')

const searchClass = searchInputClass

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
    // The enrolment lookup needs the profile. On a cold load the store may still
    // be fetching it, and without this the catalogue would show every course as
    // unenrolled until the next visit.
    await auth.ensureReady()

    const [all, mine] = await Promise.all([
      listCourses(),
      auth.profile ? listMyEnrollments(auth.profile.id) : Promise.resolve([]),
    ])
    courses.value = all.filter((course) => course.status === 'published')
    // `completed` counts as enrolled. A finished course is the one a student most
    // wants back into - to read their certificate, revisit a lesson, or see their
    // result - and this filter was the only thing standing between them and it.
    // Filtering on `active` alone rendered a certified course as "View course"
    // with no Enrolled badge, while the detail page, reading a different source,
    // correctly said "You are enrolled" at 100%. Two screens, both reading the
    // database, disagreeing because one of them dropped a status.
    //
    // `pending` and `dropped` are deliberately still excluded: a pending seat is an
    // abandoned checkout and a dropped one was left on purpose, and neither is a
    // place the student holds.
    enrolledIds.value = new Set(
      mine.filter((e) => e.status === 'active' || e.status === 'completed').map((e) => e.courseId),
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

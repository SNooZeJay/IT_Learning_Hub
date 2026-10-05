<script setup lang="ts">
/**
 * Quiz management for one course.
 *
 * Its own page rather than another panel on the course screen, because this is
 * where the answer key is. `quiz_with_answers` returns every correct answer in the
 * course in one payload, and the old system showed that key on the page an
 * instructor keeps open all day. Loading it on demand, in a place reached
 * deliberately, is the difference between reading the key and holding it.
 *
 * The course row is read only for its title and to decide whether this instructor
 * teaches it at all. The quizzes themselves come from the quiz manager, which does
 * not need the course object and would not be able to build a quiz without the id
 * it already has in the route.
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Library } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QuizManagerPanel from '@/components/quiz/QuizManagerPanel.vue'
import { getInstructorCourse } from '@/services/instructor.service'
import type { InstructorCourse } from '@/services/instructor.service'

const route = useRoute()

const course = ref<InstructorCourse | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

const courseId = computed(() => String(route.params.id ?? ''))

/** `?quiz=<id>` opens straight onto one quiz, so a link can name a quiz. */
const initialQuizId = computed(() => {
  const requested = route.query.quiz
  return typeof requested === 'string' && requested !== '' ? requested : null
})

const crumbs = computed(() => {
  const trail: Array<{ label: string; to?: string }> = [
    { label: 'Instructor', to: '/instructor/dashboard' },
    { label: 'Courses', to: '/instructor/courses' },
  ]
  if (course.value) {
    trail.push({ label: course.value.title, to: `/instructor/courses/${course.value.id}` })
  }
  trail.push({ label: 'Quizzes' })
  return trail
})

async function load(): Promise<void> {
  if (courseId.value === '') {
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    course.value = await getInstructorCourse(courseId.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load this course.'
  } finally {
    isLoading.value = false
  }
}

watch(courseId, load, { immediate: true })
</script>

<template>
  <div>
    <PageHeader
      title="Quizzes"
      :subtitle="
        course
          ? `Build and grade the quizzes for ${course.title}.`
          : 'Build and grade the quizzes for this course.'
      "
      :crumbs="crumbs"
    >
      <template #actions>
        <router-link
          :to="`/instructor/courses/${courseId}`"
          class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <ArrowLeft class="size-4 rtl:rotate-180" />
          Back to the course
        </router-link>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading course" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="!course"
      title="That course does not exist"
      description="It may have been deleted, or you may not teach it. Only courses assigned to you by an administrator appear here."
      :icon="Library"
    />

    <QuizManagerPanel v-else :course-id="course.id" :initial-quiz-id="initialQuizId" />
  </div>
</template>

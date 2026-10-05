<template>
  <div>
    <LoadingState v-if="isLoading" label="Loading course" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="!course"
      title="That course does not exist"
      description="It may have been deleted, or you may not teach it. Only courses assigned to you by an administrator appear here."
      :icon="Library"
    />

    <template v-else>
      <PageHeader
        :title="course.title"
        :subtitle="course.description ?? undefined"
        :crumbs="[
          { label: 'Instructor', to: '/instructor/dashboard' },
          { label: 'Courses', to: '/instructor/courses' },
          { label: course.title },
        ]"
      >
        <template #actions>
          <router-link
            :to="`/instructor/courses/${course.id}/edit`"
            class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <Pencil class="size-4" />
            Edit course
          </router-link>
        </template>
      </PageHeader>

      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Curriculum -->
        <div class="space-y-6 lg:col-span-2">
          <div
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div
              class="flex items-baseline justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
            >
              <h2 class="text-title-sm text-gray-900 dark:text-white/90">Curriculum</h2>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ modules.length }} module{{ modules.length === 1 ? '' : 's' }} ·
                {{ lessonCount }} lesson{{ lessonCount === 1 ? '' : 's' }}
              </span>
            </div>

            <EmptyState
              v-if="modules.length === 0"
              title="No modules yet"
              description="Add a module from the course editor, then fill it with lessons. Nothing reaches a student until you publish."
              :icon="BookOpen"
            />

            <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
              <section v-for="module in modules" :key="module.id" class="px-6 py-5">
                <div class="flex items-baseline justify-between gap-3">
                  <h3 class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
                    {{ module.position }}. {{ module.title }}
                  </h3>
                  <span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {{ module.lessons.length }} lesson{{ module.lessons.length === 1 ? '' : 's' }}
                  </span>
                </div>
                <p v-if="module.description" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ module.description }}
                </p>

                <!-- An empty module is stated rather than left blank: from the
                     instructor's side it is a gap to fill, and a row of nothing
                     reads as a rendering fault. -->
                <p
                  v-if="module.lessons.length === 0"
                  class="mt-3 rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
                >
                  No lessons in this module yet.
                </p>

                <ul v-else class="mt-3 space-y-1">
                  <li
                    v-for="lesson in module.lessons"
                    :key="lesson.id"
                    class="flex items-center gap-2.5 px-2 py-2 text-sm"
                  >
                    <PlayCircle
                      v-if="lesson.lessonType === 'video'"
                      class="size-4 shrink-0 text-gray-400"
                    />
                    <FileText v-else class="size-4 shrink-0 text-gray-400" />
                    <span class="text-gray-700 dark:text-gray-300">{{ lesson.title }}</span>
                    <span
                      v-if="lesson.isPreview"
                      class="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                    >
                      Preview
                    </span>
                    <span v-if="lesson.durationMinutes" class="ms-auto text-xs text-gray-400">
                      {{ lesson.durationMinutes }}m
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <!-- Quizzes -->
          <div
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 class="text-title-sm text-gray-900 dark:text-white/90">Quizzes</h2>
            </div>

            <div v-if="isLoadingQuizzes" class="p-6">
              <LoadingState label="Loading quizzes" />
            </div>

            <ErrorState
              v-else-if="quizError"
              title="Could not load the quizzes"
              :message="quizError"
              @retry="loadQuizzes"
            />

            <EmptyState
              v-else-if="quizzes.length === 0"
              title="No quizzes on this course"
              description="A quiz needs at least two options per question and exactly one correct answer before it can be published."
              :icon="ClipboardList"
            />

            <ul v-else class="divide-y divide-gray-200 dark:divide-gray-800">
              <li v-for="quiz in quizzes" :key="quiz.id" class="px-6 py-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
                      {{ quiz.title }}
                    </h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {{ quiz.questionCount }} question{{ quiz.questionCount === 1 ? '' : 's' }} ·
                      {{ quiz.totalPoints }} point{{ quiz.totalPoints === 1 ? '' : 's' }} ·
                      {{ quiz.passingScore }}% to pass · {{ quiz.attemptsAllowed }} attempt{{
                        quiz.attemptsAllowed === 1 ? '' : 's'
                      }}
                      allowed
                      <template v-if="quiz.timeLimitMinutes">
                        · {{ quiz.timeLimitMinutes }} min limit
                      </template>
                    </p>
                  </div>
                  <span
                    class="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium"
                    :class="
                      quiz.status === 'published'
                        ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
                        : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                    "
                  >
                    {{ quiz.status }}
                  </span>
                </div>

                <!--
                  The answer key is behind `quiz_with_answers`, because
                  `quiz_options.is_correct` and `quiz_questions.explanation` have
                  no SELECT grant for a signed-in user. Loaded on demand rather
                  than with the page: it is a per-quiz payload an instructor
                  wants occasionally, not one to fetch for every quiz on every
                  course page view.
                -->
                <button
                  type="button"
                  class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                  @click="toggleKey(quiz.id)"
                >
                  <ChevronRight
                    class="size-4 transition-transform rtl:rotate-180"
                    :class="expandedKey === quiz.id ? 'rotate-90' : ''"
                  />
                  {{ expandedKey === quiz.id ? 'Hide' : 'Show' }} answer key
                </button>

                <div v-if="expandedKey === quiz.id" class="mt-3">
                  <LoadingState v-if="keyLoading === quiz.id" label="Loading answer key" />

                  <ErrorState
                    v-else-if="keyError === quiz.id"
                    title="Could not load the answer key"
                    :message="keyErrorMessage"
                    @retry="loadKey(quiz.id)"
                  />

                  <template v-else-if="answerKey && answerKey.quizId === quiz.id">
                    <p
                      v-if="answerKey.questions.length === 0"
                      class="rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
                    >
                      This quiz has no questions yet.
                    </p>

                    <ol v-else class="space-y-3">
                      <li
                        v-for="(question, index) in answerKey.questions"
                        :key="question.id"
                        class="rounded border border-gray-200 px-4 py-3 dark:border-gray-800"
                      >
                        <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                          <span class="text-gray-500 dark:text-gray-400">{{ index + 1 }}.</span>
                          {{ question.prompt }}
                          <span class="ms-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                            ({{ question.points }} {{ question.points === 1 ? 'point' : 'points' }})
                          </span>
                        </p>

                        <ul v-if="question.options.length" class="mt-2 space-y-1">
                          <li
                            v-for="option in question.options"
                            :key="option.id"
                            class="flex items-center gap-2 text-sm"
                          >
                            <Check
                              v-if="option.isCorrect"
                              class="size-4 shrink-0 text-success-600 dark:text-success-400"
                            />
                            <X v-else class="size-4 shrink-0 text-gray-300 dark:text-gray-600" />
                            <span
                              :class="
                                option.isCorrect
                                  ? 'font-medium text-gray-900 dark:text-white/90'
                                  : 'text-gray-600 dark:text-gray-400'
                              "
                            >
                              {{ option.optionText }}
                            </span>
                          </li>
                        </ul>

                        <ul v-if="question.acceptedAnswers.length" class="mt-2 space-y-1">
                          <li
                            v-for="answer in question.acceptedAnswers"
                            :key="answer"
                            class="flex items-center gap-2 text-sm"
                          >
                            <Check class="size-4 shrink-0 text-success-600 dark:text-success-400" />
                            <span class="font-medium text-gray-900 dark:text-white/90">
                              {{ answer }}
                            </span>
                          </li>
                        </ul>

                        <p
                          v-if="question.explanation"
                          class="mt-2 border-s-2 border-hairline ps-3 text-sm text-slate"
                        >
                          {{ question.explanation }}
                        </p>
                      </li>
                    </ol>
                  </template>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Enrolment</h2>

            <dl class="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Students
                </dt>
                <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90">
                  {{ course.enrolledCount }}
                </dd>
              </div>
              <div>
                <dt class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Completed
                </dt>
                <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90">
                  {{ course.completedCount }}
                </dd>
              </div>
            </dl>

            <!--
              Completion as a bar. With no students the bar stays empty and the
              caption says so, rather than rendering a full or an empty track
              that could be read either way.
            -->
            <div class="mt-5">
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500 dark:text-gray-400">Completion rate</span>
                <span class="font-medium text-gray-900 dark:text-white/90">
                  {{ completionRate }}%
                </span>
              </div>
              <div
                class="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]"
                role="img"
                :aria-label="`${completionRate}% of enrolled students completed this course`"
              >
                <div
                  class="h-full rounded-full bg-brand-500 transition-all"
                  :style="{ width: `${completionRate}%` }"
                />
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {{
                  course.enrolledCount === 0
                    ? 'No students enrolled yet, so there is nothing to complete.'
                    : `${course.completedCount} of ${course.enrolledCount} enrolled students finished.`
                }}
              </p>
            </div>
          </div>

          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Details</h2>

            <dl class="mt-4 space-y-2.5 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Status</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">
                  {{ course.status }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Level</dt>
                <dd class="font-medium capitalize text-gray-900 dark:text-white/90">
                  {{ course.level }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Category</dt>
                <dd class="truncate font-medium text-gray-900 dark:text-white/90">
                  {{ course.categoryName ?? 'Uncategorised' }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Price</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">
                  {{ course.priceCentavos > 0 ? formatPeso(course.priceCentavos) : 'Free' }}
                </dd>
              </div>
              <div v-if="course.durationMinutes" class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Duration</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">{{ durationLabel }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Published</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">
                  {{ course.publishedAt ? formatDate(course.publishedAt) : 'Not yet' }}
                </dd>
              </div>
            </dl>

            <!--
              The slug is the course's public address, so it is shown even
              though nothing here edits it: a published course whose slug
              changes stops working at the old link, and an instructor should be
              able to read it without opening the editor.
            -->
            <p class="mt-5 text-xs break-all text-gray-500 dark:text-gray-400">
              /courses/{{ course.slug }}
            </p>
          </div>

          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Assignments</h2>

            <div v-if="isLoadingAssignments" class="mt-4">
              <LoadingState label="Loading assignments" />
            </div>

            <ErrorState
              v-else-if="assignmentError"
              title="Could not load the assignments"
              :message="assignmentError"
              @retry="loadAssignments"
            />

            <EmptyState
              v-else-if="assignments.length === 0"
              title="No assignments yet"
              description="Assignment deadlines appear here and on your calendar once one is created."
              :icon="ClipboardCheck"
            />

            <ul v-else class="mt-4 space-y-3">
              <li
                v-for="assignment in assignments"
                :key="assignment.id"
                class="rounded border border-gray-200 px-4 py-3 dark:border-gray-800"
              >
                <div class="flex items-start justify-between gap-3">
                  <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                    {{ assignment.title }}
                  </p>
                  <span
                    class="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                    :class="
                      assignment.status === 'published'
                        ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
                        : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                    "
                  >
                    {{ assignment.status }}
                  </span>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ assignment.maxPoints }} points ·
                  {{ assignment.dueAt ? `due ${formatDateTime(assignment.dueAt)}` : 'no deadline' }}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Library,
  Pencil,
  PlayCircle,
  X,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import {
  getInstructorCourse,
  getQuizAnswerKey,
  listAssignments,
  listCourseCurriculum,
  listCourseQuizzes,
} from '@/services/instructor.service'
import type {
  Assignment,
  CourseModule,
  InstructorCourse,
  QuizAnswerKey,
  QuizSummary,
} from '@/services/instructor.service'
import { formatDate, formatDateTime, formatPeso } from '@/types'

const route = useRoute()

const course = ref<InstructorCourse | null>(null)
const modules = ref<CourseModule[]>([])
const quizzes = ref<QuizSummary[]>([])
const assignments = ref<Assignment[]>([])

const isLoading = ref(true)
const errorMessage = ref('')

// The quizzes, assignments and answer keys load after the course itself. Each
// has its own flag so a failure in one does not blank the whole page, and each
// error says what specifically could not be read.
const isLoadingQuizzes = ref(false)
const quizError = ref('')
const isLoadingAssignments = ref(false)
const assignmentError = ref('')

const expandedKey = ref<string | null>(null)
const answerKey = ref<QuizAnswerKey | null>(null)
const keyLoading = ref<string | null>(null)
const keyError = ref<string | null>(null)
const keyErrorMessage = ref('')

const courseId = computed(() => String(route.params.id ?? ''))

const lessonCount = computed(() =>
  modules.value.reduce((total, module) => total + module.lessons.length, 0),
)

const completionRate = computed(() => {
  if (!course.value || course.value.enrolledCount === 0) return 0
  return Math.round((course.value.completedCount / course.value.enrolledCount) * 100)
})

const durationLabel = computed(() => {
  const minutes = course.value?.durationMinutes ?? 0
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
})

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    course.value = await getInstructorCourse(courseId.value)
    if (!course.value) return
    modules.value = await listCourseCurriculum(course.value.id)
    // Deliberately not awaited with the curriculum: the page is useful without
    // the quiz list, and a quiz-side failure should not hide the curriculum.
    void loadQuizzes()
    void loadAssignments()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load this course.'
  } finally {
    isLoading.value = false
  }
}

async function loadQuizzes(): Promise<void> {
  if (!course.value) return
  isLoadingQuizzes.value = true
  quizError.value = ''
  try {
    quizzes.value = await listCourseQuizzes(course.value.id)
  } catch (error) {
    quizError.value = error instanceof Error ? error.message : 'Could not load the quizzes.'
  } finally {
    isLoadingQuizzes.value = false
  }
}

async function loadAssignments(): Promise<void> {
  if (!course.value) return
  isLoadingAssignments.value = true
  assignmentError.value = ''
  try {
    assignments.value = await listAssignments({ courseId: course.value.id })
  } catch (error) {
    assignmentError.value =
      error instanceof Error ? error.message : 'Could not load the assignments.'
  } finally {
    isLoadingAssignments.value = false
  }
}

/**
 * Toggling the answer key loads it on open and drops it on close, so the
 * payload is fetched once per look rather than once per page view.
 */
async function toggleKey(quizId: string): Promise<void> {
  if (expandedKey.value === quizId) {
    expandedKey.value = null
    answerKey.value = null
    return
  }

  expandedKey.value = quizId
  answerKey.value = null
  keyError.value = null
  keyErrorMessage.value = ''
  await loadKey(quizId)
}

async function loadKey(quizId: string): Promise<void> {
  keyLoading.value = quizId
  try {
    answerKey.value = await getQuizAnswerKey(quizId)
  } catch (error) {
    keyError.value = quizId
    keyErrorMessage.value =
      error instanceof Error ? error.message : 'Could not load the answer key.'
  } finally {
    keyLoading.value = null
  }
}

onMounted(load)
</script>

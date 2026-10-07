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
          <div class="surface-card">
            <div class="mb-5 border-b border-gray-200 pb-4 dark:border-gray-800">
              <h2 class="section-heading">Curriculum</h2>
              <p class="mt-1 section-subheading">
                Build the course as modules, then lessons, then materials. New content is saved as a
                draft; publish it when you are ready for students to see it.
              </p>
            </div>

            <Alert
              v-if="curriculumError"
              variant="error"
              title="Could not load the curriculum"
              :message="curriculumError"
              class="mb-4"
            />

            <Alert
              v-else-if="actionMessage"
              :variant="actionVariant"
              :title="actionVariant === 'error' ? 'That did not work' : 'Saved'"
              :message="actionMessage"
              class="mb-4"
            />

            <CurriculumOutline
              :modules="curriculumModules"
              :summary="curriculumSummary"
              editable
              @add-module="openModuleForm()"
              @add-lesson="openNewLessonForm"
              @add-material="openNewMaterialForm"
              @edit-module="openModuleForm"
              @edit-lesson="openEditLessonForm"
              @edit-material="openEditMaterialForm"
              @remove-module="confirmRemoveModule"
              @remove-lesson="confirmRemoveLesson"
              @remove-material="confirmRemoveMaterial"
            />

            <!-- Inline forms. The old system used a native <details> disclosure per
                 module and per lesson, holding one create form each, so adding a
                 lesson never meant a page change. That is kept: it is the difference
                 between a workflow that feels fast and one that does not. -->
            <ModuleForm
              v-if="moduleForm.open"
              class="mt-5"
              :module="moduleForm.module"
              :saving="moduleForm.saving"
              :error="moduleForm.error"
              @cancel="closeModuleForm"
              @submit="saveModule"
            />

            <LessonForm
              v-if="lessonForm.open"
              class="mt-5"
              :lesson="lessonForm.lesson"
              :module-title="lessonForm.moduleTitle"
              :saving="lessonForm.saving"
              :error="lessonForm.error"
              @cancel="closeLessonForm"
              @submit="saveLesson"
            />

            <MaterialForm
              v-if="materialForm.open"
              class="mt-5"
              :material="materialForm.material"
              :lesson-title="materialForm.lessonTitle"
              :saving="materialForm.saving"
              :error="materialForm.error"
              @cancel="closeMaterialForm"
              @submit="saveMaterial"
            />
          </div>

          <!-- Quizzes -->
          <div class="surface-card-shell">
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
            >
              <h2 class="section-heading">Quizzes</h2>

              <!--
                Building the quizzes is its own page. This list is a read-only
                glance at what exists; adding, editing, reordering and publishing
                questions is the manager, one deliberate step away.
              -->
              <router-link
                :to="`/instructor/courses/${course.id}/quiz`"
                class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                <ClipboardList class="size-4" />
                Build quizzes
              </router-link>
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
                    <p class="mt-1 section-subheading">
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

          <!-- Assignments. Authoring lives here rather than in the sidebar this
               list used to sit in: a form with six fields does not belong in a
               third of the page, and it belongs beside the quizzes, which are
               the other thing a student is assessed on. -->
          <div class="surface-card-shell">
            <div
              class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
            >
              <div class="min-w-0">
                <h2 class="section-heading">Assignments</h2>
                <p class="mt-1 section-subheading">
                  Work a student hands in. A published assignment is shown to everyone enrolled, and
                  a course that requires hand-ins does not complete until they are marked.
                </p>
              </div>

              <Button
                variant="primary"
                class="shrink-0"
                :disabled="assignmentForm.saving"
                @click="openAssignmentForm()"
              >
                <Plus class="size-4" />
                Add assignment
              </Button>
            </div>

            <div class="p-6">
              <LoadingState v-if="isLoadingAssignments" label="Loading assignments" />

              <ErrorState
                v-else-if="assignmentError"
                title="Could not load the assignments"
                :message="assignmentError"
                @retry="loadAssignments"
              />

              <EmptyState
                v-else-if="assignments.length === 0"
                title="No assignments on this course"
                description="Add one above. Once it has a deadline it shows on your calendar, and once it is published students can hand it in."
                :icon="ClipboardCheck"
              />

              <ul v-else role="list" class="space-y-3">
                <li
                  v-for="assignment in assignments"
                  :key="assignment.id"
                  class="rounded-lg border border-gray-200 px-4 py-3.5 dark:border-gray-800"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
                        {{ assignment.title }}
                      </p>
                      <p class="mt-0.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                        {{ assignment.maxPoints }} points ·
                        {{
                          assignment.dueAt
                            ? `due ${formatDateTime(assignment.dueAt)}`
                            : 'no deadline'
                        }}
                        <template v-if="moduleTitleOf(assignment.moduleId)">
                          · {{ moduleTitleOf(assignment.moduleId) }}
                        </template>
                      </p>
                      <p
                        v-if="assignment.instructions"
                        class="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
                      >
                        {{ assignment.instructions }}
                      </p>
                    </div>

                    <div class="flex shrink-0 flex-wrap items-center gap-1">
                      <span
                        class="rounded px-2 py-0.5 text-xs font-medium"
                        :class="
                          assignment.status === 'published'
                            ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
                            : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                        "
                      >
                        {{ assignment.status }}
                      </span>
                      <button
                        type="button"
                        class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                        @click="openAssignmentForm(assignment.id)"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-error-600 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-error-400"
                        @click="confirmRemoveAssignment(assignment.id)"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              </ul>

              <AssignmentForm
                v-if="assignmentForm.open"
                class="mt-6"
                :assignment="assignmentForm.assignment"
                :modules="assignmentModules"
                :saving="assignmentForm.saving"
                :error="assignmentForm.error"
                @cancel="closeAssignmentForm"
                @submit="saveAssignment"
              />
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <div class="surface-card">
            <h2 class="section-heading">Enrollment</h2>

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

          <div class="surface-card">
            <h2 class="section-heading">Details</h2>

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
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Library,
  Pencil,
  Plus,
  X,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import CurriculumOutline from '@/components/curriculum/CurriculumOutline.vue'
import ModuleForm from '@/components/curriculum/ModuleForm.vue'
import LessonForm from '@/components/curriculum/LessonForm.vue'
import MaterialForm from '@/components/curriculum/MaterialForm.vue'
import AssignmentForm from '@/components/curriculum/AssignmentForm.vue'
import {
  createAssignment,
  deleteAssignment,
  getInstructorCourse,
  getQuizAnswerKey,
  InstructorError,
  listAssignments,
  listCourseQuizzes,
  updateAssignment,
} from '@/services/instructor.service'
import type {
  Assignment,
  AssignmentStatus,
  InstructorCourse,
  QuizAnswerKey,
  QuizSummary,
} from '@/services/instructor.service'
import {
  createLesson,
  createMaterial,
  createModule,
  CurriculumError,
  deleteLesson,
  deleteMaterial,
  deleteModule,
  loadCurriculum,
  updateLesson,
  updateMaterial,
  updateModule,
  type Curriculum,
} from '@/services/curriculum.service'
import { supabase } from '@/services/supabase/client'
import { materialTypeLabel } from '@/services/curriculum.service'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
// The student dashboard caches module ids per course, so an instructor's
// curriculum write has to drop it or a student sees the old module list.
import { forgetModuleCache } from '@/services/dashboard.service'
import { formatDate, formatDateTime, formatPeso } from '@/types'
import type {
  ContentStatus,
  CurriculumLesson,
  CurriculumModule,
  Lesson,
  LessonMaterial,
  MaterialType,
  Module,
} from '@/types'

const route = useRoute()
const auth = useAuthStore()
const confirm = useConfirm()

const course = ref<InstructorCourse | null>(null)
const quizzes = ref<QuizSummary[]>([])
const assignments = ref<Assignment[]>([])

const isLoading = ref(true)
const errorMessage = ref('')

// ---------------------------------------------------------------------------
// Curriculum state
// ---------------------------------------------------------------------------

const curriculum = ref<Curriculum | null>(null)
const isLoadingCurriculum = ref(false)
const curriculumError = ref('')

/** One banner for the outcome of the last write, rather than a toast per action. */
const actionMessage = ref('')
const actionVariant = ref<'success' | 'error'>('success')

const curriculumModules = computed(() => curriculum.value?.modules ?? [])
const curriculumSummary = computed(() => curriculum.value?.summary ?? null)

/** Every lesson across every module, so a form can be opened from a flat lookup. */
const lessonIndex = computed(() => {
  const index = new Map<string, CurriculumLesson>()
  for (const module of curriculumModules.value) {
    for (const lesson of module.lessons) index.set(lesson.id, lesson)
  }
  return index
})

const moduleIndex = computed(() => {
  const index = new Map<string, CurriculumModule>()
  for (const module of curriculumModules.value) index.set(module.id, module)
  return index
})

/**
 * Every material across every lesson, so a removal can name what it removes.
 *
 * Built from `lessonIndex` rather than by walking the tree again, so there is
 * one source of truth for the curriculum shape on this page.
 */
const materialIndex = computed(() => {
  const index = new Map<string, LessonMaterial>()
  for (const lesson of lessonIndex.value.values()) {
    for (const material of lesson.materials) index.set(material.id, material)
  }
  return index
})

// ---------------------------------------------------------------------------
// Inline form state
// ---------------------------------------------------------------------------

const moduleForm = reactive({
  open: false,
  module: null as Module | null,
  saving: false,
  error: null as string | null,
})

const lessonForm = reactive({
  open: false,
  lesson: null as Lesson | null,
  moduleId: '',
  moduleTitle: '',
  saving: false,
  error: null as string | null,
})

const materialForm = reactive({
  open: false,
  material: null as LessonMaterial | null,
  lessonId: '',
  lessonTitle: '',
  saving: false,
  error: null as string | null,
})

const assignmentForm = reactive({
  open: false,
  assignment: null as Assignment | null,
  saving: false,
  error: null as string | null,
})

/**
 * The modules the assignment form offers, and the lookup that names one in the
 * list. Taken from the curriculum already on the page rather than fetched again:
 * the form needs exactly the modules of this course, and that is what the
 * curriculum is.
 */
const assignmentModules = computed(() =>
  curriculumModules.value.map((module) => ({ id: module.id, title: module.title })),
)

/**
 * The module an assignment is filed under, as a name.
 *
 * Null for an assignment that belongs to the course as a whole, and null for one
 * filed under a module that has since been deleted - `module_id` is `ON DELETE
 * SET NULL` - so the caller renders nothing rather than an empty separator.
 */
function moduleTitleOf(moduleId: string | null): string | null {
  if (!moduleId) return null
  return moduleIndex.value.get(moduleId)?.title ?? null
}

/** New assignment, or edit the one with this id. `undefined` means create. */
function openAssignmentForm(assignmentId?: string): void {
  assignmentForm.assignment = assignmentId
    ? (assignments.value.find((row) => row.id === assignmentId) ?? null)
    : null
  assignmentForm.error = null
  assignmentForm.open = true
}

function closeAssignmentForm(): void {
  assignmentForm.open = false
  assignmentForm.assignment = null
  assignmentForm.error = null
}

async function saveAssignment(draft: {
  title: string
  instructions: string | null
  moduleId: string | null
  dueAt: string | null
  maxPoints: number
  status: AssignmentStatus
}): Promise<void> {
  const courseId = course.value?.id
  // `assignments.created_by` is not nullable, so a write needs somebody to
  // attribute it to. Refusing with a sentence beats inserting a row that belongs
  // to nobody.
  const instructorId = auth.profile?.id
  if (!courseId || !instructorId) {
    assignmentForm.error =
      'Your account is still loading, so the assignment was not saved. Try again in a moment.'
    return
  }

  assignmentForm.saving = true
  assignmentForm.error = null
  try {
    if (assignmentForm.assignment) {
      await updateAssignment(assignmentForm.assignment.id, draft)
      actionVariant.value = 'success'
      actionMessage.value = `Saved "${draft.title}".`
    } else {
      await createAssignment(courseId, draft, instructorId)
      actionVariant.value = 'success'
      actionMessage.value = `Added assignment "${draft.title}".`
    }
    await loadAssignments()
    closeAssignmentForm()
  } catch (error) {
    assignmentForm.error = describeInstructor(error, 'Could not save the assignment.')
  } finally {
    assignmentForm.saving = false
  }
}

/**
 * Confirm before removing an assignment, by name.
 *
 * Named because the rows are otherwise interchangeable on screen, and destructive
 * for a reason that has to be stated: `assignments` cascades to
 * `assignment_submissions`, so every hand-in against this assignment - graded work
 * included - goes with it. There is no soft delete on either table.
 */
async function confirmRemoveAssignment(assignmentId: string): Promise<void> {
  const assignment = assignments.value.find((row) => row.id === assignmentId)
  if (!assignment) return

  const message =
    'Remove "' +
    assignment.title +
    '"? Every hand-in against it is deleted with it, including any that has already ' +
    'been marked. This cannot be undone.'
  const confirmed = await confirm.ask({
    title: 'Remove assignment?',
    message,
    confirmText: 'Remove',
    variant: 'danger',
  })
  if (!confirmed) return

  actionVariant.value = 'success'
  void (async () => {
    try {
      await deleteAssignment(assignmentId)
      actionMessage.value = `Removed "${assignment.title}".`
      await loadAssignments()
    } catch (error) {
      actionVariant.value = 'error'
      actionMessage.value = describeInstructor(error, 'Could not remove that assignment.')
    }
  })()
}

function closeModuleForm(): void {
  moduleForm.open = false
  moduleForm.module = null
  moduleForm.error = null
}

function closeLessonForm(): void {
  lessonForm.open = false
  lessonForm.lesson = null
  lessonForm.error = null
}

function closeMaterialForm(): void {
  materialForm.open = false
  materialForm.material = null
  materialForm.error = null
}

/**
 * Open the module form, for editing an existing module or creating a new one.
 *
 * The emitted payload is the id of whatever was clicked, so one handler serves
 * both. `undefined` means "create".
 */
function openModuleForm(moduleId?: string): void {
  moduleForm.module = moduleId ? (moduleIndex.value.get(moduleId) ?? null) : null
  moduleForm.error = null
  moduleForm.open = true
}

/**
 * Open the lesson form for a NEW lesson in `moduleId`.
 *
 * Separate from the edit path on purpose. These were one function with two
 * optional parameters, and the outline emits a *module* id for "add" and a
 * *lesson* id for "edit" - so a single signature received a module id in the
 * lesson slot, the lookup missed, and the form silently never opened. Splitting
 * them makes the payload type obvious at each call site.
 */
function openNewLessonForm(moduleId: string): void {
  lessonForm.lesson = null
  lessonForm.moduleId = moduleId
  lessonForm.moduleTitle = moduleIndex.value.get(moduleId)?.title ?? ''
  lessonForm.error = null
  lessonForm.open = true
}

function openEditLessonForm(lessonId: string): void {
  const lesson = lessonIndex.value.get(lessonId)
  if (!lesson) return
  lessonForm.lesson = lesson
  lessonForm.moduleId = lesson.moduleId
  lessonForm.moduleTitle = moduleIndex.value.get(lesson.moduleId)?.title ?? ''
  lessonForm.error = null
  lessonForm.open = true
}

/** New material on `lessonId`, or edit the material with `materialId`. */
function openNewMaterialForm(lessonId: string): void {
  materialForm.material = null
  materialForm.lessonId = lessonId
  materialForm.lessonTitle = lessonIndex.value.get(lessonId)?.title ?? ''
  materialForm.error = null
  materialForm.open = true
}

function openEditMaterialForm(materialId: string): void {
  for (const module of curriculumModules.value) {
    for (const lesson of module.lessons) {
      const found = lesson.materials.find((m) => m.id === materialId)
      if (found) {
        materialForm.material = found
        materialForm.lessonId = lesson.id
        materialForm.lessonTitle = lesson.title
        materialForm.error = null
        materialForm.open = true
        return
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function describe(error: unknown, fallback: string): string {
  if (error instanceof CurriculumError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

/**
 * The same, for the writes that go through `instructor.service` rather than
 * `curriculum.service`. Both throw an `Error` subclass carrying the database's own
 * refusal, so the message is what a person needs; the fallback is only reached
 * when something that is not an Error was thrown.
 */
function describeInstructor(error: unknown, fallback: string): string {
  if (error instanceof InstructorError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

async function refreshCurriculum(): Promise<void> {
  if (!course.value) return
  isLoadingCurriculum.value = true
  curriculumError.value = ''
  try {
    const result = await loadCurriculum({
      courseId: course.value.id,
      // The instructor's view is the whole point of this page, so drafts and
      // archived rows are included. RLS keeps this to the course's own instructor.
      includeUnpublished: true,
    })
    curriculum.value = result
  } catch (error) {
    curriculumError.value = describe(error, 'Could not load the curriculum.')
  } finally {
    isLoadingCurriculum.value = false
  }
}

async function saveModule(draft: {
  title: string
  description: string | null
  status: ContentStatus
}): Promise<void> {
  if (!course.value) return
  moduleForm.saving = true
  moduleForm.error = null
  try {
    if (moduleForm.module) {
      await updateModule(moduleForm.module.id, draft)
      // Invalidated after the write succeeds, not before and not on failure: a
      // cache dropped by a failed write costs a re-read for nothing.
      forgetModuleCache(course.value.id)
      actionMessage.value = `Saved "${draft.title}".`
    } else {
      await createModule(course.value.id, draft)
      forgetModuleCache(course.value.id)
      actionMessage.value = `Added module "${draft.title}".`
    }
    await refreshCurriculum()
    closeModuleForm()
  } catch (error) {
    moduleForm.error = describe(error, 'Could not save the module.')
  } finally {
    moduleForm.saving = false
  }
}

async function saveLesson(draft: {
  title: string
  summary: string | null
  content: string | null
  lessonType: 'article' | 'video'
  durationMinutes: number | null
  videoUrl: string | null
  isPreview: boolean
  isRequired: boolean
  status: ContentStatus
}): Promise<void> {
  lessonForm.saving = true
  lessonForm.error = null
  try {
    if (lessonForm.lesson) {
      await updateLesson(lessonForm.lesson.id, draft)
      actionMessage.value = `Saved "${draft.title}".`
    } else {
      await createLesson(lessonForm.moduleId, draft)
      actionMessage.value = `Added lesson "${draft.title}".`
    }
    await refreshCurriculum()
    closeLessonForm()
  } catch (error) {
    lessonForm.error = describe(error, 'Could not save the lesson.')
  } finally {
    lessonForm.saving = false
  }
}

/**
 * Upload a file, then record the material.
 *
 * The row is written after the upload succeeds rather than before, so a failed
 * upload does not leave a material pointing at a path that holds nothing. The
 * path includes the lesson id and a random suffix, so two uploads of the same
 * filename never collide - the same convention the old system used.
 */
async function saveMaterial(draft: {
  title: string
  materialType: MaterialType
  contentText: string | null
  externalUrl: string | null
  file: File | null
}): Promise<void> {
  materialForm.saving = true
  materialForm.error = null
  try {
    let filePath: string | null = materialForm.material?.filePath ?? null
    let fileSize: number | null = materialForm.material?.fileSize ?? null
    let fileType: string | null = materialForm.material?.fileType ?? null

    if (draft.file) {
      const safeName = draft.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      // The first path segment MUST be the course id. The bucket's policies call
      // `course_id_from_object_name(name)`, which casts `storage.foldername(name)[1]`
      // to uuid and returns null when that fails - so a key starting with the bucket
      // name was refused by RLS for every instructor, and file-type materials could
      // never be uploaded at all. See the path-shape comment in
      // `20261004170825_foundation.sql`.
      // `course` is non-null for the whole of this handler: the save button only exists
      // inside the loaded view, and every sibling handler here already dereferences it.
      const courseId = course.value?.id
      if (!courseId) {
        throw new CurriculumError(
          'This course has not finished loading, so the file was not uploaded.',
        )
      }
      const path = `${courseId}/${materialForm.lessonId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('lesson-materials')
        .upload(path, draft.file, { upsert: false })

      if (uploadError) {
        throw new CurriculumError(`The file did not upload: ${uploadError.message}`, uploadError)
      }
      filePath = path
      fileSize = draft.file.size
      fileType = draft.file.type === '' ? null : draft.file.type
    }

    const payload = {
      title: draft.title,
      materialType: draft.materialType,
      contentText: draft.contentText,
      externalUrl: draft.externalUrl,
      filePath,
      fileSize,
      fileType,
    }

    if (materialForm.material) {
      await updateMaterial(materialForm.material.id, payload)
      actionMessage.value = `Saved "${draft.title}".`
    } else {
      await createMaterial(materialForm.lessonId, payload)
      actionMessage.value = `Added ${materialTypeLabel(draft.materialType).toLowerCase()} "${draft.title}".`
    }
    await refreshCurriculum()
    closeMaterialForm()
  } catch (error) {
    materialForm.error = describe(error, 'Could not save the material.')
  } finally {
    materialForm.saving = false
  }
}

/**
 * Confirm before removing.
 *
 * Removal cascades: deleting a module deletes its lessons, and deleting a lesson
 * deletes its materials and every student's progress on it. That is the correct
 * behaviour for the same reason the old system archived rather than deleted, but
 * this schema uses ON DELETE CASCADE, so the warning has to say what is actually
 * lost. "Are you sure" without that would be a lie.
 */
async function confirmRemoveModule(moduleId: string): Promise<void> {
  const module = moduleIndex.value.get(moduleId)
  if (!module) return
  const lessonCount = module.lessons.length
  const confirmed = await confirm.ask({
    title: 'Remove module?',
    message:
      lessonCount === 0
        ? `Remove the module "${module.title}"?`
        : `Remove "${module.title}" and its ${lessonCount} lesson${lessonCount === 1 ? '' : 's'}? Every student's progress on ${lessonCount === 1 ? 'it' : 'them'} is deleted with it. Archiving keeps the record instead.`,
    confirmText: 'Remove',
    variant: 'danger',
  })
  if (!confirmed) return
  // A removed module changes the module list a student's dashboard reads, and
  // that list is cached per course. Without this the dashboard keeps serving the
  // deleted module until a full reload.
  void runRemoval(async () => {
    await deleteModule(moduleId)
    forgetModuleCache(course.value?.id)
  }, 'Module removed.')
}

async function confirmRemoveLesson(lessonId: string): Promise<void> {
  const lesson = lessonIndex.value.get(lessonId)
  if (!lesson) return
  const message =
    lesson.materials.length > 0
      ? `Remove "${lesson.title}" and its ${lesson.materials.length} material${lesson.materials.length === 1 ? '' : 's'}? Progress students recorded on it is deleted too.`
      : `Remove "${lesson.title}"? Progress students recorded on it is deleted too.`
  const confirmed = await confirm.ask({
    title: 'Remove lesson?',
    message,
    confirmText: 'Remove',
    variant: 'danger',
  })
  if (!confirmed) return
  void runRemoval(() => deleteLesson(lessonId), 'Lesson removed.')
}

async function confirmRemoveMaterial(materialId: string): Promise<void> {
  // Confirmed, like its two siblings above.
  //
  // This one had none, so a single stray click on Remove destroyed the material
  // and there was no point at which an instructor could have stopped it. The
  // message names the material because "Remove?" against a list of identically
  // styled rows is a guess: the instructor is choosing between three rows that
  // look alike, and the browser's dialog is the only place to say which one.
  const material = materialIndex.value.get(materialId)
  if (!material) return
  const confirmed = await confirm.ask({
    title: 'Remove material?',
    message: `Remove "${material.title}"?`,
    confirmText: 'Remove',
    variant: 'danger',
  })
  if (!confirmed) return
  void runRemoval(() => deleteMaterial(materialId), 'Material removed.')
}

async function runRemoval(work: () => Promise<void>, success: string): Promise<void> {
  actionVariant.value = 'success'
  try {
    await work()
    actionMessage.value = success
    await refreshCurriculum()
  } catch (error) {
    actionVariant.value = 'error'
    actionMessage.value = describe(error, 'Could not remove that.')
  }
}

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
    // `auth.profile` supplies `assignments.created_by`. Awaited rather than read
    // directly, so the save button is never pressed against a half-loaded store
    // and refused for a reason that is about the page not being ready yet.
    await auth.ensureReady()
    // The curriculum has its own error surface. A failure to read it must not
    // blank the page - the quiz and assignment panels are still useful - and it
    // must be visible, because an instructor looking at an empty outline would
    // reasonably conclude they had no content.
    await refreshCurriculum()
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

<template>
  <div>
    <PageHeader
      title="Quizzes"
      subtitle="Everything you can take, and where you stand on each one."
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Quizzes' }]"
    >
      <template #actions>
        <Button variant="outline" :disabled="isLoading" @click="load">
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </Button>
      </template>
    </PageHeader>

    <Alert
      v-if="errorMessage"
      variant="error"
      title="Your quizzes could not be loaded"
      :message="errorMessage"
      class="mb-6"
    />

    <LoadingState v-else-if="isLoading" label="Loading your quizzes" />

    <EmptyState
      v-else-if="quizzes.length === 0"
      title="No quizzes yet"
      description="Quizzes appear here when an instructor publishes one for a course you are enrolled in. Nothing is needed from you until then."
      :icon="NotebookPen"
    >
      <template #action>
        <RouterLink
          to="/student/courses"
          class="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <BookOpen class="size-4" aria-hidden="true" />
          Browse courses
        </RouterLink>
      </template>
    </EmptyState>

    <template v-else>
      <!--
        Grouped by course, not one flat list. A learner with four courses open does not
        think "I have nine quizzes"; they think "where am I in this course". One heading
        per course, with its own progress, answers the question they actually have.
      -->
      <section v-for="group in groups" :key="group.courseId" class="mb-8">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 class="text-title-sm text-ink">
            <RouterLink
              :to="`/student/courses/${group.courseSlug}`"
              class="transition-colors hover:text-brand-600 dark:hover:text-brand-400"
            >
              {{ group.courseTitle }}
            </RouterLink>
          </h2>
          <p class="shrink-0 text-sm text-slate">{{ group.summary }}</p>
        </div>

        <ul role="list" class="mt-3 grid gap-3 sm:grid-cols-2">
          <li v-for="quiz in group.quizzes" :key="quiz.quizId">
            <article
              class="flex h-full flex-col rounded-lg border p-4 transition-colors"
              :class="
                quiz.passed
                  ? 'border-success-200 bg-success-50/40 dark:border-success-500/30 dark:bg-success-500/[0.06]'
                  : 'border-hairline bg-canvas hover:border-hairline-strong dark:bg-white/[0.03] dark:hover:border-white/20'
              "
            >
              <div class="flex items-start gap-3">
                <component
                  :is="statusIcon(quiz)"
                  class="mt-0.5 size-5 shrink-0"
                  :class="statusIconClass(quiz)"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                  <h3 class="text-theme-sm text-ink">{{ quiz.title }}</h3>
                  <p v-if="quiz.lessonTitle" class="mt-0.5 text-xs text-slate">
                    {{ quiz.moduleTitle ? `${quiz.moduleTitle} · ` : '' }}{{ quiz.lessonTitle }}
                  </p>
                  <p v-else-if="quiz.moduleTitle" class="mt-0.5 text-xs text-slate">
                    {{ quiz.moduleTitle }}
                  </p>
                </div>
              </div>

              <!--
                The state line, in the learner's words. "Passed", "In progress", "Not
                started" are what they need; the attempt counters are the supporting fact
                that tells them whether starting again is possible.
              -->
              <p class="mt-3 text-sm font-medium" :class="statusTextClass(quiz)">
                {{ statusLabel(quiz) }}
                <span v-if="quiz.bestPercentage !== null" class="font-normal text-slate">
                  · {{ quiz.bestPercentage }}%
                </span>
              </p>

              <dl class="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate">
                <div class="flex gap-1">
                  <dt>Questions</dt>
                  <dd class="font-medium text-ink">{{ quiz.questionCount }}</dd>
                </div>
                <div class="flex gap-1">
                  <dt>Pass mark</dt>
                  <dd class="font-medium text-ink">{{ quiz.passingScore }}%</dd>
                </div>
                <div v-if="quiz.timeLimitMinutes" class="flex gap-1">
                  <dt>Time limit</dt>
                  <dd class="font-medium text-ink">{{ quiz.timeLimitMinutes }} min</dd>
                </div>
                <div class="flex gap-1">
                  <dt>Attempts left</dt>
                  <dd class="font-medium text-ink">{{ quiz.attemptsRemaining }}</dd>
                </div>
              </dl>

              <!--
                One call to action, and it changes with the state rather than sitting
                disabled beside the learner. A resume button for an open attempt, a start
                button when one is available, a results link once it is worth reading, and
                nothing at all when the attempts are spent - a disabled button on a screen
                of dead controls is worse than no button.
              -->
              <div class="mt-4 flex flex-wrap gap-2 pt-1">
                <RouterLink
                  v-if="quiz.hasOpenAttempt"
                  :to="`/student/quizzes/${quiz.quizId}`"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  <PlayCircle class="size-4" aria-hidden="true" />
                  Resume
                </RouterLink>

                <RouterLink
                  v-else-if="quiz.attemptsRemaining > 0"
                  :to="`/student/quizzes/${quiz.quizId}`"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface dark:bg-white/[0.03]"
                >
                  <PlayCircle class="size-4" aria-hidden="true" />
                  {{ quiz.attemptsUsed === 0 ? 'Start quiz' : 'Try again' }}
                </RouterLink>

                <RouterLink
                  v-if="quiz.bestPercentage !== null"
                  :to="'/student/grades'"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                >
                  <ChartColumn class="size-4" aria-hidden="true" />
                  See results
                </RouterLink>
              </div>
            </article>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  BadgeCheck,
  BookOpen,
  ChartColumn,
  CircleDashed,
  Clock,
  NotebookPen,
  PlayCircle,
  RotateCcw,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import { listStudentQuizzes, type StudentQuizSummary } from '@/services/quiz.service'
import { useToast } from '@/composables/useToast'

/**
 * Every quiz this student can take, grouped by course.
 *
 * The data comes from one service that already exists and already enforces the rules:
 * `listStudentQuizzes` reads through the quizzes policy, so a course this account holds no
 * place on returns nothing at all. There is no enrolment filter in this file, and adding
 * one would be a second, weaker copy of a decision the database already made.
 *
 * The screen answers one question per card - can I start this, and where do I stand - and
 * puts the counts underneath rather than in the heading. A learner opening this page is
 * looking for the thing to do next, not for a summary of their own record.
 */
const toast = useToast()

const quizzes = ref<StudentQuizSummary[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

interface QuizGroup {
  courseId: string
  courseTitle: string
  courseSlug: string
  summary: string
  quizzes: StudentQuizSummary[]
}

/**
 * Grouped by course, in the order the service returned them, which is the order the
 * quizzes were created. A learner's own ordering is more useful than an alphabetical one,
 * so nothing here re-sorts the courses.
 */
const groups = computed<QuizGroup[]>(() => {
  const byCourse = new Map<string, QuizGroup>()

  for (const quiz of quizzes.value) {
    let group = byCourse.get(quiz.courseId)
    if (!group) {
      group = {
        courseId: quiz.courseId,
        courseTitle: quiz.courseTitle,
        courseSlug: quiz.courseSlug,
        summary: '',
        quizzes: [],
      }
      byCourse.set(quiz.courseId, group)
    }
    group.quizzes.push(quiz)
  }

  for (const group of byCourse.values()) {
    const passed = group.quizzes.filter((quiz) => quiz.passed).length
    const inProgress = group.quizzes.filter((quiz) => quiz.hasOpenAttempt).length
    const notStarted = group.quizzes.filter(
      (quiz) => !quiz.passed && !quiz.hasOpenAttempt && quiz.attemptsUsed === 0,
    ).length

    const parts: string[] = [
      `${group.quizzes.length} quiz${group.quizzes.length === 1 ? '' : 'zes'}`,
    ]
    if (passed) parts.push(`${passed} passed`)
    if (inProgress) parts.push(`${inProgress} in progress`)
    if (notStarted) parts.push(`${notStarted} not started`)
    group.summary = parts.join(' · ')
  }

  return [...byCourse.values()]
})

/**
 * The one fact a learner needs from a card, in their words.
 *
 * Order matters and is deliberate: a passed quiz is never "not started", and an open
 * attempt outranks a previous score because the thing to do is finish, not review.
 */
function statusLabel(quiz: StudentQuizSummary): string {
  if (quiz.hasOpenAttempt) return 'In progress'
  if (quiz.passed) return 'Passed'
  if (quiz.bestPercentage !== null) return 'Not passed yet'
  if (quiz.attemptsRemaining === 0) return 'No attempts left'
  return 'Not started'
}

function statusIcon(quiz: StudentQuizSummary): Component {
  if (quiz.hasOpenAttempt) return Clock
  if (quiz.passed) return BadgeCheck
  return CircleDashed
}

function statusIconClass(quiz: StudentQuizSummary): string {
  if (quiz.hasOpenAttempt) return 'text-warning-600 dark:text-warning-400'
  if (quiz.passed) return 'text-success-600 dark:text-success-400'
  return 'text-slate'
}

function statusTextClass(quiz: StudentQuizSummary): string {
  if (quiz.hasOpenAttempt) return 'text-warning-700 dark:text-warning-400'
  if (quiz.passed) return 'text-success-700 dark:text-success-400'
  return 'text-ink'
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    quizzes.value = await listStudentQuizzes()
  } catch (error) {
    quizzes.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Try again in a moment.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await load()
  if (quizzes.value.length > 0) {
    toast.info(
      `${quizzes.value.length} quiz${quizzes.value.length === 1 ? '' : 'zes'} available`,
      'Pick one to start or resume.',
    )
  }
})
</script>

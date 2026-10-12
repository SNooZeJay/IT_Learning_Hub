<script setup lang="ts">
/**
 * Read-only results review for one quiz.
 *
 * No answer key is read here, and none is needed: an instructor asking "who sat
 * this, and how did they do" is answered by names, scores, warnings and how each
 * attempt ended. Reading the key to draw a panel of results would put every
 * correct answer in the browser for a screen that never renders one.
 *
 * Every column stays. A review that hides a column on a phone is a review whose
 * meaning changes with the width of the screen, so the table scrolls sideways
 * instead - `overflow-x-auto` on the wrapper, `min-w` on the table, and a caption
 * so the columns are named when a screen reader reaches them.
 */
import { computed } from 'vue'
import type { AttemptSummary } from '@/services/quizAuthoring.service'
import { formatDateTime } from '@/types'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/public/ui/table'

const props = defineProps<{
  quizId: string
  attempts: AttemptSummary[]
}>()

/** `quiz_attempts.ended_via` is a checked text column; only these three values reach it. */
const endedLabels: Record<string, string> = {
  student_submit: 'Student submitted',
  time_expired: 'Time ran out',
  warnings_exhausted: 'Warnings used up',
}

function endedLabel(attempt: AttemptSummary): string {
  if (attempt.endedVia && endedLabels[attempt.endedVia]) return endedLabels[attempt.endedVia]
  return attempt.status === 'in_progress' ? 'Still open' : 'Not recorded'
}

/** Distinct students, not distinct rows: a student may have sat it more than once. */
const studentCount = computed(() => new Set(props.attempts.map((a) => a.studentId)).size)

const passedCount = computed(() => props.attempts.filter((a) => a.passed === true).length)

/**
 * The mean of the graded percentages.
 *
 * Null when nothing has been graded, rather than 0. An average of zero would be
 * read as "everybody scored nothing", which is a claim about students rather than
 * an admission that there is no data yet.
 */
const averagePercentage = computed(() => {
  const graded = props.attempts.filter((a) => a.percentage !== null)
  if (graded.length === 0) return null
  const total = graded.reduce((sum, a) => sum + (a.percentage ?? 0), 0)
  return Math.round(total / graded.length)
})

function scoreLabel(attempt: AttemptSummary): string {
  if (attempt.score === null || attempt.maxScore === null) return 'Not graded'
  return `${attempt.score} / ${attempt.maxScore}`
}
</script>

<template>
  <section :aria-labelledby="`attempts-heading-${quizId}`">
    <h3 :id="`attempts-heading-${quizId}`" class="text-theme-sm text-gray-900 dark:text-white/90">
      Results
    </h3>

    <div v-if="attempts.length === 0" class="mt-3">
      <p
        class="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
      >
        Nobody has sat this quiz yet. Attempts appear here as soon as a student starts one, with
        their score once they submit.
      </p>
    </div>

    <template v-else>
      <p class="mt-1 section-subheading">
        <span class="font-medium text-gray-900 dark:text-white/90">{{ studentCount }}</span>
        {{ studentCount === 1 ? 'student has' : 'students have' }} sat this quiz
        <span aria-hidden="true">·</span>
        <span class="font-medium text-gray-900 dark:text-white/90">{{ passedCount }}</span>
        {{ passedCount === 1 ? 'attempt passed' : 'attempts passed' }}
        <template v-if="averagePercentage !== null">
          <span aria-hidden="true">·</span>
          average
          <span class="font-medium text-gray-900 dark:text-white/90">{{ averagePercentage }}%</span>
        </template>
      </p>

      <div class="mt-3 overflow-x-auto">
        <Table class="w-full min-w-3xl border-collapse text-start text-sm">
          <TableCaption class="sr-only">
            Every attempt on this quiz: who sat it, which attempt it was, the score, whether it
            passed, the warnings raised, how it ended and when it was submitted.
          </TableCaption>

          <TableHeader>
            <TableRow class="border-b border-gray-200 hover:bg-transparent dark:border-gray-800">
              <TableHead
                scope="col"
                class="py-2 pe-4 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                Student
              </TableHead>
              <TableHead
                scope="col"
                class="py-2 pe-4 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                Attempt
              </TableHead>
              <TableHead
                scope="col"
                class="py-2 pe-4 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                Score
              </TableHead>
              <TableHead
                scope="col"
                class="py-2 pe-4 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                Result
              </TableHead>
              <TableHead
                scope="col"
                class="py-2 pe-4 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                Warnings
              </TableHead>
              <TableHead
                scope="col"
                class="py-2 pe-4 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                How it ended
              </TableHead>
              <TableHead
                scope="col"
                class="py-2 text-start font-medium text-gray-500 dark:text-gray-400"
              >
                Submitted
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody class="divide-y divide-gray-200 dark:divide-gray-800">
            <TableRow v-for="attempt in attempts" :key="attempt.id">
              <TableCell class="py-2.5 pe-4 font-medium text-gray-900 dark:text-white/90">
                {{ attempt.studentName ?? 'Name not recorded' }}
              </TableCell>
              <TableCell class="py-2.5 pe-4 text-gray-600 dark:text-gray-400">
                <span class="sr-only">Attempt number </span>{{ attempt.attemptNumber }}
              </TableCell>
              <TableCell class="py-2.5 pe-4 text-gray-600 dark:text-gray-400">
                {{ scoreLabel(attempt) }}
                <span v-if="attempt.percentage !== null" class="block text-xs text-slate">
                  {{ attempt.percentage }}%
                </span>
                <span v-else class="block text-xs text-slate">—</span>
              </TableCell>
              <TableCell class="py-2.5 pe-4">
                <span
                  v-if="attempt.passed === true"
                  class="font-medium text-success-600 dark:text-success-400"
                >
                  Passed
                </span>
                <span v-else-if="attempt.passed === false" class="text-gray-600 dark:text-gray-400">
                  Not passed
                </span>
                <span v-else class="text-gray-400 dark:text-gray-500">Not graded</span>
              </TableCell>
              <TableCell class="py-2.5 pe-4 text-gray-600 dark:text-gray-400">
                <span class="sr-only">Warnings raised: </span>
                {{ attempt.warningCount }}
              </TableCell>
              <TableCell class="py-2.5 pe-4 text-gray-600 dark:text-gray-400">
                {{ endedLabel(attempt) }}
              </TableCell>
              <TableCell class="py-2.5 text-gray-600 dark:text-gray-400">
                {{ attempt.submittedAt ? formatDateTime(attempt.submittedAt) : 'Not submitted' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </template>
  </section>
</template>

<template>
  <div>
    <PageHeader
      title="My grades"
      subtitle="Every quiz attempt, every marked assignment, and every certificate you hold."
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Grades' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your grades" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else-if="grades">
      <!-- ============================ SUMMARY ============================ -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Quiz average"
          :value="averageLabel(summary.quizAverage, '%')"
          :icon="Award"
          :hint="
            summary.quizzesAttempted === 0
              ? 'No submitted attempts yet'
              : `${summary.quizzesPassed} of ${summary.quizzesAttempted} quiz${summary.quizzesAttempted === 1 ? '' : 'zes'} passed`
          "
        />
        <StatCard
          label="Assignment average"
          :value="averageLabel(summary.assignmentAverage, '%')"
          :icon="ClipboardCheck"
          :hint="
            summary.assignmentsGraded === 0
              ? 'Nothing marked yet'
              : `${summary.assignmentsGraded} of ${summary.assignmentsSubmitted} submitted marked`
          "
        />
        <StatCard
          label="Courses completed"
          :value="`${summary.coursesCompleted} of ${summary.coursesEnrolled}`"
          :icon="GraduationCap"
          :hint="
            summary.coursesEnrolled === 0
              ? 'You are not enrolled in anything yet'
              : 'Confirmed against the course requirements'
          "
        />
        <StatCard
          label="Certificates"
          :value="String(summary.certificatesEarned)"
          :icon="BadgeCheck"
          :hint="
            summary.certificatesRevoked > 0
              ? `${summary.certificatesRevoked} revoked — see below`
              : 'Valid certificates you can claim'
          "
        />
      </div>

      <!-- An average is only meaningful next to what went into it, so the counts
           that produced it are stated rather than implied. -->
      <p
        v-if="summary.quizzesAttempted === 0 && summary.assignmentsGraded === 0"
        class="mt-4 rounded-lg border border-hairline bg-surface px-4 py-3 text-sm text-slate"
      >
        No graded work yet. Quiz results appear once you submit an attempt, and assignment marks
        appear once an instructor has graded the submission.
      </p>

      <!-- ============================ QUIZZES ============================ -->
      <section class="mt-6">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 class="section-heading">Quiz attempts</h2>
          <p class="shrink-0 text-sm text-slate">
            {{ grades.quizAttempts.length }}
            {{ grades.quizAttempts.length === 1 ? 'attempt' : 'attempts' }}
          </p>
        </div>

        <div v-if="grades.quizAttempts.length" class="mt-3 surface-card-shell">
          <!--
            A list rather than a table. On a phone a table of six columns is
            unreadable, and the two things that matter per attempt — the score
            and the pass mark — are already the two ends of one row.
          -->
          <ul class="divide-y divide-hairline">
            <li
              v-for="attempt in grades.quizAttempts"
              :key="attempt.attemptId"
              class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <component
                    :is="
                      attempt.passed === true
                        ? CircleCheck
                        : attempt.passed === false
                          ? CircleX
                          : Clock
                    "
                    class="size-4 shrink-0"
                    :class="
                      attempt.passed === true
                        ? 'text-success-600 dark:text-success-400'
                        : attempt.passed === false
                          ? 'text-error-600 dark:text-error-400'
                          : 'text-slate'
                    "
                    aria-hidden="true"
                  />
                  <p class="truncate text-sm font-medium text-ink">{{ attempt.quizTitle }}</p>
                </div>
                <p class="mt-1 text-xs text-slate">
                  {{ attempt.courseTitle }} · attempt {{ attempt.attemptNumber }}
                  <template v-if="attempt.submittedAt">
                    · {{ formatDate(attempt.submittedAt) }}
                  </template>
                  <template v-else> · not submitted yet</template>
                </p>
              </div>

              <div class="text-end">
                <p class="text-sm font-semibold text-ink">
                  {{ attempt.percentage === null ? '—' : `${attempt.percentage}%` }}
                </p>
                <p class="mt-0.5 text-xs text-slate">
                  {{ attempt.passingScore }}% to pass
                  <template v-if="attempt.score !== null && attempt.maxScore !== null">
                    · {{ attempt.score }}/{{ attempt.maxScore }}
                  </template>
                </p>
              </div>

              <RouterLink
                class="inline-flex min-h-9 shrink-0 items-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                :to="`/student/quizzes/${attempt.quizId}`"
              >
                {{ attempt.status === 'in_progress' ? 'Resume' : 'Open quiz' }}
              </RouterLink>
            </li>
          </ul>
        </div>

        <EmptyState
          v-else
          class="mt-3"
          title="No quiz attempts yet"
          description="Take a quiz from a course you are enrolled in and your score appears here."
          :icon="ClipboardList"
        >
          <RouterLink
            class="inline-flex h-11 items-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
            to="/student/courses"
          >
            Find a course
          </RouterLink>
        </EmptyState>
      </section>

      <!-- ========================== ASSIGNMENTS ========================== -->
      <section class="mt-8">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 class="section-heading">Assignments</h2>
          <p class="shrink-0 text-sm text-slate">
            {{ grades.assignments.length }}
            {{ grades.assignments.length === 1 ? 'assignment' : 'assignments' }}
          </p>
        </div>

        <div v-if="grades.assignments.length" class="mt-3 surface-card-shell">
          <ul class="divide-y divide-hairline">
            <li v-for="item in grades.assignments" :key="item.assignmentId" class="px-5 py-4">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <component
                      :is="assignmentIcon(item)"
                      class="size-4 shrink-0"
                      :class="assignmentIconClass(item)"
                      aria-hidden="true"
                    />
                    <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
                  </div>
                  <p class="mt-1 text-xs text-slate">
                    {{ item.courseTitle }}
                    <template v-if="item.dueAt"> · due {{ formatDate(item.dueAt) }}</template>
                    <template v-else> · no due date</template>
                    · {{ item.maxPoints }} points
                  </p>
                </div>

                <!--
                  The mark is shown as a percentage, because two assignments
                  worth different numbers of points are not otherwise
                  comparable. The raw mark stays visible next to it.
                -->
                <div class="text-end">
                  <template v-if="item.grade !== null">
                    <p class="text-sm font-semibold text-ink">{{ assignmentPercent(item) }}%</p>
                    <p class="mt-0.5 text-xs text-slate">{{ item.grade }}/{{ item.maxPoints }}</p>
                  </template>
                  <template v-else-if="item.submissionStatus === 'submitted'">
                    <p class="text-sm font-medium text-slate">Awaiting marking</p>
                    <p class="mt-0.5 text-xs text-slate">
                      Handed in {{ item.submittedAt ? formatDate(item.submittedAt) : 'earlier' }}
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-sm font-medium text-slate">Not submitted</p>
                    <p class="mt-0.5 text-xs text-slate">Nothing handed in</p>
                  </template>
                </div>
              </div>

              <p
                v-if="item.feedback"
                class="mt-3 rounded-md bg-surface px-4 py-3 text-sm text-slate dark:bg-white/[0.05]"
              >
                <span class="font-medium text-ink">Instructor feedback:</span>
                {{ item.feedback }}
              </p>
            </li>
          </ul>
        </div>

        <EmptyState
          v-else
          class="mt-3"
          title="No assignments on your courses"
          description="When an instructor publishes an assignment for a course you are taking, it appears here with its due date."
          :icon="ClipboardCheck"
        />
      </section>

      <!-- ========================= CERTIFICATES ========================= -->
      <section class="mt-8">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 class="section-heading">Certificates</h2>
          <p class="shrink-0 text-sm text-slate">
            {{ grades.certificates.length }}
            {{ grades.certificates.length === 1 ? 'certificate' : 'certificates' }}
          </p>
        </div>

        <div v-if="grades.certificates.length" class="mt-3 grid gap-4 sm:grid-cols-2">
          <article
            v-for="certificate in grades.certificates"
            :key="certificate.id"
            class="rounded-lg border p-5"
            :class="
              certificate.revoked
                ? 'border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10'
                : 'border-hairline bg-canvas dark:bg-white/[0.03]'
            "
          >
            <div class="flex items-start gap-3">
              <component
                :is="certificate.revoked ? ShieldX : BadgeCheck"
                class="mt-0.5 size-6 shrink-0"
                :class="
                  certificate.revoked
                    ? 'text-error-600 dark:text-error-400'
                    : 'text-success-600 dark:text-success-400'
                "
                aria-hidden="true"
              />
              <div class="min-w-0">
                <h3 class="text-theme-sm text-ink">{{ certificate.courseTitle }}</h3>
                <p class="mt-1 font-mono text-xs text-slate">{{ certificate.certificateNumber }}</p>
              </div>
            </div>

            <dl class="mt-4 space-y-1.5 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-slate">Final score</dt>
                <dd class="font-medium text-ink">{{ certificate.finalPercentage }}%</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-slate">Issued</dt>
                <dd class="font-medium text-ink">{{ formatDate(certificate.issuedAt) }}</dd>
              </div>
            </dl>

            <!--
              The certificate is a document, and a document needs somewhere to open from.
              This used to be a row in a list with no way to see what it looked like or keep
              a copy; the whole certificate now renders on its own route and prints to a
              file. Labelled with the course rather than a bare "View", because the card
              itself may be showing three of these at once.
            -->
            <RouterLink
              :to="`/student/certificates/${certificate.id}`"
              class="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              <FileText class="size-4" aria-hidden="true" />
              Open certificate
              <span class="sr-only">for {{ certificate.courseTitle }}</span>
            </RouterLink>

            <!--
              A revoked certificate stays on screen. Section 19.5 of the spec
              requires it, and hiding the row would tell the student a
              certificate they were issued never existed — while
              `issue_certificate` refuses to issue another one, so silence
              would be an unexplainable dead end.
            -->
            <div
              v-if="certificate.revoked"
              class="mt-4 rounded-md border border-error-200 bg-canvas px-4 py-3 dark:border-error-500/30 dark:bg-white/[0.05]"
            >
              <p class="text-sm font-medium text-error-700 dark:text-error-400">
                Revoked on {{ formatDate(certificate.revokedAt ?? certificate.issuedAt) }}
              </p>
              <p class="mt-1 text-sm text-slate">
                {{ certificate.revokeReason ?? 'No reason was recorded.' }}
              </p>
              <p class="mt-2 text-xs text-slate">
                This certificate is no longer valid and cannot be replaced. Contact your instructor
                if you think this is a mistake.
              </p>
            </div>
          </article>
        </div>

        <EmptyState
          v-else
          class="mt-3"
          title="No certificates yet"
          description="A certificate is issued when every requirement on a course is met. Until then, a course page will tell you exactly what is left."
          :icon="BadgeCheck"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Award,
  BadgeCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CircleCheck,
  CircleX,
  FileClock,
  FileText,
  GraduationCap,
  ShieldX,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import StatCard from '@/components/common/StatCard.vue'
import { getStudentGrades } from '@/services/learning.service'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/types'
import type { AssignmentGrade, GradeSummary, StudentGrades } from '@/services/learning.service'

const auth = useAuthStore()

const grades = ref<StudentGrades | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

/**
 * The summary, with a zeroed stand-in so the template never has to narrow.
 *
 * Every average in `EMPTY_SUMMARY` is null rather than 0, which is the distinction
 * that matters: "no attempts yet" and "scored zero" are different facts and the
 * cards render them differently.
 */
const EMPTY_SUMMARY: GradeSummary = {
  coursesEnrolled: 0,
  coursesCompleted: 0,
  quizzesAttempted: 0,
  quizzesPassed: 0,
  quizAverage: null,
  assignmentsSubmitted: 0,
  assignmentsGraded: 0,
  assignmentAverage: null,
  certificatesEarned: 0,
  certificatesRevoked: 0,
}

const summary = computed<GradeSummary>(() => grades.value?.summary ?? EMPTY_SUMMARY)

/**
 * An average with no attempts behind it is not zero. It is unknown, and saying
 * "0%" would tell a student they had failed everything they have not yet taken.
 */
function averageLabel(value: number | null | undefined, suffix: string): string {
  return value === null || value === undefined ? '—' : `${value}${suffix}`
}

/** Grade as a percentage of the points available. Null when nothing is marked. */
function assignmentPercent(item: AssignmentGrade): string {
  if (item.grade === null || item.maxPoints <= 0) return '—'
  return String(Math.round((item.grade / item.maxPoints) * 100))
}

function assignmentIcon(item: AssignmentGrade) {
  if (item.grade !== null) return CircleCheck
  if (item.submissionStatus === 'submitted') return Clock
  return FileClock
}

function assignmentIconClass(item: AssignmentGrade): string {
  if (item.grade !== null) return 'text-success-600 dark:text-success-400'
  if (item.submissionStatus === 'submitted') return 'text-warning-600 dark:text-warning-400'
  return 'text-slate'
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    // Everything on this page is scoped to the signed-in student, so the profile
    // id is the query key. Without this the store may still be resolving it on a
    // cold load and the page would show an empty transcript.
    await auth.ensureReady()
    const studentId = auth.profile?.id
    if (!studentId) {
      errorMessage.value = 'Your profile has not loaded yet. Give it a moment and try again.'
      return
    }
    grades.value = await getStudentGrades(studentId)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load your grades. Try again.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

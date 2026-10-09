<template>
  <div>
    <LoadingState v-if="isLoading" label="Loading course" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else-if="course">
      <PageHeader
        :title="course.title"
        :subtitle="course.description ?? undefined"
        :crumbs="[
          { label: 'Student', to: '/student/dashboard' },
          { label: 'Courses', to: '/student/courses' },
          { label: course.title },
        ]"
      />

      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Curriculum -->
        <div class="min-w-0 lg:col-span-2">
          <div class="surface-card-shell">
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 class="section-heading">Curriculum</h2>
              <p class="mt-1 section-subheading">
                {{
                  isEnrolledHere
                    ? 'Course, modules, lessons and materials, in the order you will work through them.'
                    : 'What this course covers.'
                }}
              </p>
            </div>

            <div class="p-6">
              <!--
                Two different causes produce an empty curriculum, and telling a
                student the wrong one is worse than showing nothing. Row Level
                Security hides modules from anyone not enrolled, so for a
                prospective student an empty curriculum means "enrol to see it",
                not "the instructor has not written it yet".

                This panel used to carry its own green enrol button, which made the
                page show the SAME action twice - here and again in the summary rail
                on the right. That was not a cosmetic duplication. The two buttons
                were not the same button: the rail one branched on price (a
                `RouterLink` to the checkout page when the course is paid), while
                this one called `handleEnrol` unconditionally. `handleEnrol` only
                knows how to enrol for free, so on a paid course it threw
                "This course is paid. Payment is required before enrolling." from
                behind a button labelled "Enroll for PHP 1,500.00". The learner saw
                a dead end at the top of the page and a working button further
                down, and the top one is the one they pressed.

                So the panel is a state, not a second call to action, and it points
                at the one button that actually knows what the course costs. The
                guard in `handleEnrol` below is the belt to this braces: even if a
                future change puts this button back, a paid course can no longer
                reach `enrollInFreeCourse`.
              -->
              <EmptyState
                v-if="!isEnrolledHere"
                :title="
                  isPaidCourse ? 'Enroll to unlock the curriculum' : 'Enroll to see the lessons'
                "
                :description="
                  isPaidCourse
                    ? `The module list for this course is only visible once you have a place. Enroll for ${formatPeso(course.priceCentavos)} using the button in the summary to unlock every lesson.`
                    : 'The module list for this course is only visible once you have a place. Enroll free using the button in the summary to unlock every lesson.'
                "
                :icon="Lock"
              />

              <CurriculumOutline v-else :modules="curriculumModules" :summary="curriculumSummary" />

              <!--
                Assessments sit after the curriculum, because that is the order they
                belong in: learn the material, then be assessed on it.

                Before this there was no link from a course page to its quiz at
                all. The only route was a past-attempt link on the grades screen,
                so a student who had never sat the quiz could not find it.

                Gated on enrolment, like the curriculum above it. Row Level Security
                would have refused the content anyway - quiz_briefing and the
                question policies both require an enrolment - but showing the link
                next to "Enrol to see the lessons" contradicts what the page says
                two inches above it.
              -->
              <section
                v-if="isEnrolledHere && quizzes.length > 0"
                class="mt-8 border-t border-gray-200 pt-6 dark:border-gray-800"
                aria-labelledby="course-quizzes-heading"
              >
                <h2
                  id="course-quizzes-heading"
                  class="section-heading"
                >
                  Assessments
                </h2>
                <p class="mt-1 section-subheading">
                  Read the instructions before you start. Each one tells you what to expect.
                </p>

                <ul role="list" class="mt-4 flex flex-col gap-2">
                  <li v-for="quiz in quizzes" :key="quiz.id">
                    <router-link
                      :to="`/student/quizzes/${quiz.id}`"
                      class="flex items-center gap-4 rounded-lg border border-gray-200 px-4 py-3.5 transition-colors hover:border-brand-400 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-brand-500 dark:hover:bg-white/[0.02]"
                    >
                      <span
                        class="icon-chip"
                      >
                        <ClipboardList class="size-4" aria-hidden="true" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium text-gray-900 dark:text-white/90">
                          {{ quiz.title }}
                        </span>
                        <span
                          class="mt-0.5 block text-xs text-slate tabular-nums"
                        >
                          {{ quiz.questions.length }}
                          {{ quiz.questions.length === 1 ? 'question' : 'questions' }} · pass at
                          {{ quiz.passingScore }}%
                          <template v-if="quiz.timeLimitMinutes">
                            · {{ quiz.timeLimitMinutes }} min limit
                          </template>
                        </span>
                      </span>
                      <ChevronRight
                        class="size-4 shrink-0 text-gray-400 rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </router-link>
                  </li>
                </ul>
              </section>

              <!--
                Assignments sit after the quizzes for the same reason: they are
                the work, so they come after the reading.

                Gated on enrolment, like everything above it. The write policy is
                `student_id = auth.uid() and is_enrolled_in(course_id)`, so a
                prospective student's hand-in would be refused by the database
                anyway - but offering a box that cannot save is worse than not
                offering one.
              -->
              <section
                v-if="isEnrolledHere && assignments.length > 0"
                class="mt-8 border-t border-gray-200 pt-6 dark:border-gray-800"
                aria-labelledby="course-assignments-heading"
              >
                <h2
                  id="course-assignments-heading"
                  class="section-heading"
                >
                  Assignments
                </h2>
                <p class="mt-1 section-subheading">
                  Read the brief, then write your answer below. A hand-in can be replaced until it
                  has been marked.
                </p>

                <Alert
                  v-if="assignmentError"
                  variant="error"
                  title="Could not load the assignments"
                  :message="assignmentError"
                  class="mt-4"
                />

                <ul role="list" class="mt-4 flex flex-col gap-3">
                  <AssignmentSubmitCard
                    v-for="assignment in assignments"
                    :key="assignment.id"
                    :assignment="assignment"
                    :saving="isSubmitting === assignment.id"
                    :error="submitErrors[assignment.id] ?? null"
                    @submit="handleSubmit"
                  />
                </ul>
              </section>
            </div>
          </div>
        </div>

        <!-- Enrolment panel -->
        <div>
          <div class="sticky top-6 surface-card">
            <p class="text-xl font-semibold tracking-tight text-gray-900 dark:text-white/90">
              {{ priceLabel }}
            </p>
            <p class="mt-1 text-xs text-slate">
              {{ isPaidCourse ? 'One-off, in Philippine pesos' : 'Free to enroll' }}
            </p>

            <dl class="mt-5 space-y-2.5 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Level</dt>
                <dd class="font-medium capitalize text-gray-900 dark:text-white/90">
                  {{ course.level }}
                </dd>
              </div>
              <div v-if="course.durationMinutes" class="flex items-center justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Duration</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">{{ durationLabel }}</dd>
              </div>
              <div v-if="course.passingScore" class="flex items-center justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Pass mark</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">
                  {{ course.passingScore }}%
                </dd>
              </div>
            </dl>

            <div class="mt-6">
              <Alert
                v-if="paymentNotice"
                variant="success"
                title="Payment"
                :message="paymentNotice"
                class="mb-3"
              />

              <Alert
                v-if="actionError"
                variant="error"
                title="Could not enroll"
                :message="actionError"
                class="mb-3"
              />

              <p
                v-if="isEnrolledHere"
                class="flex items-center justify-center gap-2 rounded bg-success-50 px-4 py-3 text-sm font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400"
              >
                <CircleCheck class="size-4" />
                You are enrolled
              </p>

              <!--
                A paid course goes to the checkout page, not straight to PayMongo.

                This button used to call `startCheckout` and navigate out of the app
                itself, which meant the learner never saw an order summary, and landed
                wherever the provider sent them with no page of ours waiting to confirm
                the result. The checkout page is now the place a payment is reviewed and
                the place the learner returns to.
              -->
              <RouterLink
                v-else-if="isPaidCourse"
                :to="{ name: 'student-checkout', params: { slug: course.slug } }"
                class="block"
              >
                <Button variant="primary" class="w-full justify-center">
                  Enroll for {{ formatPeso(course.priceCentavos) }}
                </Button>
              </RouterLink>

              <Button
                v-else
                variant="primary"
                class="w-full justify-center"
                :disabled="isActing"
                @click="handleEnrol"
              >
                <LoaderCircle v-if="isActing" class="size-4 animate-spin" />
                {{ isActing ? 'Enrolling...' : 'Enroll for free' }}
              </Button>
            </div>

            <p
              v-if="isPaidCourse && !isEnrolledHere"
              class="mt-3 text-xs text-slate"
            >
              Payment is processed by PayMongo. Your place is created once payment is confirmed, so
              closing this page will not lose it.
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, CircleCheck, ClipboardList, LoaderCircle, Lock } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import CurriculumOutline from '@/components/curriculum/CurriculumOutline.vue'
import AssignmentSubmitCard from '@/components/curriculum/AssignmentSubmitCard.vue'
import { getCourseWithCurriculum, isPaid } from '@/services/course.service'
import { findEnrollment, enrollInFreeCourse } from '@/services/enrollment.service'
import { loadCurriculum, type Curriculum } from '@/services/curriculum.service'
import { listQuizzesForCourse } from '@/services/quiz.service'
import {
  listStudentAssignments,
  submitAssignment,
  uploadSubmissionFile,
  type StudentAssignment,
} from '@/services/learning.service'
import { useAuthStore } from '@/stores/auth'
import { formatPeso } from '@/types'
import type { Course, Quiz } from '@/types'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const course = ref<Course | null>(null)
const enrolledHere = ref(false)
const isLoading = ref(true)
const isActing = ref(false)
const errorMessage = ref('')
const actionError = ref('')
/**
 * Set after returning from PayMongo, so the page can say what happened instead of
 * silently reloading as if nothing occurred. The learner comes back here whether
 * they paid or gave up, and the two need to read differently.
 */
const paymentNotice = ref('')

const slug = computed(() => String(route.params.id ?? ''))

const isPaidCourse = computed(() => (course.value ? isPaid(course.value) : false))
const isEnrolledHere = computed(() => enrolledHere.value)

/**
 * The full hierarchy for this course, materials included, with the student's own
 * progress attached.
 *
 * The enrolment id is resolved first because progress is scoped to it. It is
 * fetched rather than assumed: an enrolled student must not be shown a course
 * with no progress on it just because the lookup ran before the store was ready.
 */
const curriculum = ref<Curriculum | null>(null)
const enrollmentId = ref<string | null>(null)

/**
 * Published quizzes on this course.
 *
 * Separate from the curriculum rather than part of it: a quiz is not a module, and
 * folding it into the outline would imply it is something to work through in
 * sequence. It is shown after the content instead.
 */
const quizzes = ref<Quiz[]>([])

/**
 * Published assignments on this course, each already carrying this student's own
 * hand-in.
 *
 * Loaded after the enrolment is known and only then, because a hand-in box is
 * only offered to somebody the database will accept a write from. The list is
 * gated on `isEnrolledHere` in the template for the same reason.
 */
const assignments = ref<StudentAssignment[]>([])
const assignmentError = ref('')

/** The assignment currently being written, so only its button is disabled. */
const isSubmitting = ref<string | null>(null)

/** Per-assignment failure text, so one refusal does not blank the other boxes. */
const submitErrors = ref<Record<string, string>>({})

const curriculumModules = computed(() => curriculum.value?.modules ?? [])
const curriculumSummary = computed(() => curriculum.value?.summary ?? null)

const priceLabel = computed(() =>
  !course.value ? '' : isPaidCourse.value ? formatPeso(course.value.priceCentavos) : 'Free',
)

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
    // The profile is needed to resolve this student's own enrolment, but on a
    // cold load the store may still be fetching it. Without this await the
    // check below silently skips, and an enrolled student is told to enrol in a
    // course they are already taking.
    await auth.ensureReady()

    const result = await getCourseWithCurriculum(slug.value)
    if (!result) {
      errorMessage.value = 'That course does not exist, or it has not been published yet.'
      return
    }
    course.value = result.course

    // Best-effort. A failure here must not hide the curriculum, so the assessment
    // section simply does not appear rather than the page failing.
    quizzes.value = await listQuizzesForCourse(result.course.id).catch(() => [])

    if (auth.profile) {
      const enrolment = await findEnrollment(result.course.id, auth.profile.id)
      enrolledHere.value = enrolment?.status === 'active' || enrolment?.status === 'completed'
      enrollmentId.value = enrolledHere.value ? (enrolment?.id ?? null) : null
    }

    // The hierarchy is loaded once, after the enrolment is known, so progress is
    // attached on the first render rather than appearing a moment later.
    curriculum.value = await loadCurriculum({
      courseId: result.course.id,
      enrollmentId: enrollmentId.value,
    })

    // Same ordering for the assignments: a failure here shows one sentence above
    // the list rather than failing the page, because the curriculum and the
    // quizzes are still worth reading.
    await loadAssignments(result.course.id, isEnrolledHere.value)

    // The learner returning from the provider. The webhook settles asynchronously,
    // so the enrolment may not be active yet on the very first render - which is
    // why this says "confirming" rather than claiming success.
    // The return from the provider. What the query parameter is NOT is evidence of
    // anything - `?payment=success` is a string in the address bar that anyone
    // can type, and it arrives whether the payment settled, was abandoned, or
    // was never made at all. Only two things on this page are server-side
    // facts: `enrolledHere`, read from the enrolment table above, and the
    // webhook's own record, which the browser cannot see.
    //
    // So neither branch says the payment was received. When the enrolment is
    // active the server itself put it there after the webhook settled, so the
    // place is genuinely unlocked and saying that is honest - but the sentence
    // is about the place, not about the payment, which is the distinction that
    // matters when the two can come apart.
    const payment = route.query.payment
    if (payment === 'success') {
      paymentNotice.value = enrolledHere.value
        ? 'Your place on this course is active, so your lessons are unlocked.'
        : 'We are confirming your payment with the provider. Your lessons unlock as soon as it is confirmed.'
    } else if (payment === 'cancelled') {
      paymentNotice.value =
        'Checkout cancelled. You have not been charged. You can try again whenever you like.'
    }

    // Drop the query so a refresh does not replay the notice, and so the browser
    // back button does not walk through it twice.
    if (payment) {
      void router.replace({ query: { ...route.query, payment: undefined } })
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load this course.'
  } finally {
    isLoading.value = false
  }
}

/**
 * Load this course's published assignments, with this student's own hand-in on
 * each.
 *
 * Skipped entirely when the visitor holds no place: `is_enrolled_in` is part of
 * the write policy, so a prospective student can read nothing they could act on,
 * and the section is hidden anyway. Asking anyway would be a query whose only
 * possible outcome is a refusal.
 */
async function loadAssignments(courseId: string, enrolled: boolean): Promise<void> {
  if (!enrolled) {
    assignments.value = []
    return
  }

  assignmentError.value = ''
  try {
    assignments.value = await listStudentAssignments(courseId)
  } catch (error) {
    assignments.value = []
    assignmentError.value =
      error instanceof Error ? error.message : 'Could not load the assignments.'
  }
}

/**
 * Hand in an assignment, then re-read the list.
 *
 * Re-read rather than patching the row in place: the write returns the row, but
 * the list also carries the assignment's own metadata and the read is what proves
 * the state the server now holds - which is the only state worth showing a
 * student. A hand-in that reports success and renders as "not submitted" is
 * worse than an error.
 */
async function handleSubmit(
  assignmentId: string,
  submissionText: string,
  file: File | null,
): Promise<void> {
  if (!course.value) return

  isSubmitting.value = assignmentId
  const next = { ...submitErrors.value }
  delete next[assignmentId]
  submitErrors.value = next

  try {
    // Upload first, then write the row. The reverse order would leave a submission
    // pointing at a path holding nothing if the insert failed, and an orphan object
    // is cheaper to reconcile than a hand-in that cannot be opened.
    const path = file ? await uploadSubmissionFile(assignmentId, file) : null
    await submitAssignment(assignmentId, submissionText, path)
    await loadAssignments(course.value.id, isEnrolledHere.value)
  } catch (error) {
    submitErrors.value = {
      ...submitErrors.value,
      [assignmentId]: error instanceof Error ? error.message : 'Could not hand that in.',
    }
    toast.error(
      'Submission failed',
      error instanceof Error ? error.message : 'Could not hand that in.',
    )
  } finally {
    isSubmitting.value = null
  }
}

/**
 * Enrol, by whichever route the course actually needs.
 *
 * A free course is enrolled directly. A paid one opens a hosted checkout and
 * sends the learner to the provider - the browser never decides a payment
 * succeeded, and `enrolledHere` is not set on this path. It becomes true only
 * after the webhook has settled the payment and a reload re-reads the enrolment.
 *
 * This previously called `enrollInFreeCourse` for both, so a paid course threw
 * "This course is paid. Payment is required before enrolling." from behind a
 * button labelled "Enrol for ₱1,500.00". The price rendered correctly and the
 * copy mentioned PayMongo, so the paid path read as implemented - but nothing in
 * the frontend called `create-checkout` at all.
 *
 * The duplication is gone: the locked-curriculum panel above no longer renders a
 * button, so this one is reachable only for a free course. The guard below is
 * kept anyway, because the failure it prevented was a dead green button that
 * looked like the primary action, and that is not a failure worth relying on
 * markup to prevent. If a paid course ever reaches here it goes to the checkout
 * page - the same destination the rail button uses - rather than attempting a
 * free enrolment and reporting the database's refusal as a failure.
 */
async function handleEnrol(): Promise<void> {
  if (!course.value || !auth.profile) return

  // Never attempt a free enrolment on a paid course. `enrollInFreeCourse` refuses
  // this at the database level and the refusal surfaces as an error toast, which
  // reads to a learner as "the app is broken" rather than "you must pay first".
  if (isPaidCourse.value) {
    await router.push({ name: 'student-checkout', params: { slug: course.value.slug } })
    return
  }

  actionError.value = ''
  paymentNotice.value = ''
  isActing.value = true
  try {
    await enrollInFreeCourse(course.value, auth.profile.id)
    enrolledHere.value = true
    toast.success('Enrolled', 'You are now enrolled in this course.')

    // The curriculum is re-read rather than trusted from the old fetch.
    //
    // Before this, enrolling set the flag and left the outline alone, so the page
    // said "You are enrolled" directly above an empty curriculum: Row Level
    // Security had hidden the lessons on the first load because at that moment
    // there was no enrolment, and nothing re-ran the query. A learner saw "no
    // lessons yet" for a course that has six, until they refreshed.
    //
    // Verified in a browser: click Enrol for free -> enrolled badge shown,
    // curriculum still "3 modules, 0 lessons" -> after reload, 3/6/6.
    await load()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not enroll in this course.'
    actionError.value = message
    toast.error('Enrollment failed', message)
  } finally {
    isActing.value = false
  }
}

onMounted(load)
</script>

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
        <div class="lg:col-span-2">
          <div
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 class="text-title-sm text-gray-900 dark:text-white/90">Curriculum</h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
              -->
              <EmptyState
                v-if="!isEnrolledHere"
                :title="
                  isPaidCourse ? 'Enrol to unlock the curriculum' : 'Enrol to see the lessons'
                "
                :description="
                  isPaidCourse
                    ? `The module list for this course is only visible once you have a place. Enrol for ${formatPeso(course.priceCentavos)} to unlock every lesson.`
                    : 'The module list for this course is only visible once you have a place. Enrol free to unlock every lesson.'
                "
                :icon="Lock"
              >
                <Button variant="primary" :disabled="isActing" @click="handleEnrol">
                  <LoaderCircle v-if="isActing" class="size-4 animate-spin" />
                  {{
                    isPaidCourse
                      ? `Enrol for ${formatPeso(course.priceCentavos)}`
                      : 'Enrol for free'
                  }}
                </Button>
              </EmptyState>

              <CurriculumOutline v-else :modules="curriculumModules" :summary="curriculumSummary" />
            </div>
          </div>
        </div>

        <!-- Enrolment panel -->
        <div>
          <div
            class="sticky top-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p class="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white/90">
              {{ priceLabel }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ isPaidCourse ? 'One-off, in Philippine pesos' : 'Free to enrol' }}
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
                title="Could not enrol"
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

              <Button
                v-else-if="isPaidCourse"
                variant="primary"
                class="w-full justify-center"
                :disabled="isActing"
                @click="handleEnrol"
              >
                <LoaderCircle v-if="isActing" class="size-4 animate-spin" />
                {{
                  isActing ? 'Opening checkout...' : `Enrol for ${formatPeso(course.priceCentavos)}`
                }}
              </Button>

              <Button
                v-else
                variant="primary"
                class="w-full justify-center"
                :disabled="isActing"
                @click="handleEnrol"
              >
                <LoaderCircle v-if="isActing" class="size-4 animate-spin" />
                {{ isActing ? 'Enrolling...' : 'Enrol for free' }}
              </Button>
            </div>

            <p
              v-if="isPaidCourse && !isEnrolledHere"
              class="mt-3 text-xs text-gray-500 dark:text-gray-400"
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
import { CircleCheck, LoaderCircle, Lock } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import CurriculumOutline from '@/components/curriculum/CurriculumOutline.vue'
import { getCourseWithCurriculum, isPaid } from '@/services/course.service'
import { findEnrollment, enrollInFreeCourse } from '@/services/enrollment.service'
import { startCheckout } from '@/services/checkout.service'
import { loadCurriculum, type Curriculum } from '@/services/curriculum.service'
import { useAuthStore } from '@/stores/auth'
import { formatPeso } from '@/types'
import type { Course } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

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

    // The learner returning from the provider. The webhook settles asynchronously,
    // so the enrolment may not be active yet on the very first render - which is
    // why this says "confirming" rather than claiming success.
    const payment = route.query.payment
    if (payment === 'success') {
      paymentNotice.value = enrolledHere.value
        ? 'Payment received. Your place on this course is active.'
        : 'Payment received. We are confirming it with the provider - your lessons unlock in a moment.'
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
 */
async function handleEnrol(): Promise<void> {
  if (!course.value || !auth.profile) return
  actionError.value = ''
  paymentNotice.value = ''
  isActing.value = true
  try {
    if (isPaidCourse.value) {
      // The slug, not the id: this page resolves `/student/courses/:id` by slug,
      // so a return URL built from the UUID lands the learner - freshly paid - on
      // "That course does not exist".
      const result = await startCheckout(course.value.id, course.value.slug)

      if (!result.requiresPayment) {
        // The function says this course is free, which contradicts the price on
        // this page. Enrolling directly is the useful response to a backend and
        // frontend disagreeing about a price, rather than sending the learner to
        // a checkout for something that costs nothing.
        await enrollInFreeCourse(course.value, auth.profile.id)
        enrolledHere.value = true
        return
      }

      if (!result.checkoutUrl) {
        // A reused pending payment with no open session behind it. The learner
        // already tried to pay and did not finish, so the way forward is to let
        // them start again rather than to show a button that does nothing.
        actionError.value = result.reused
          ? 'You have an unfinished payment for this course. Please try again to open a new checkout - you have not been charged.'
          : 'The payment provider did not return a checkout link. Please try again.'
        return
      }

      // Full navigation, not a router push: this leaves the app for PayMongo's
      // hosted page. window.location is correct here and router.push is not.
      window.location.href = result.checkoutUrl
      return
    }

    await enrollInFreeCourse(course.value, auth.profile.id)
    enrolledHere.value = true

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
    actionError.value = error instanceof Error ? error.message : 'Could not enrol in this course.'
  } finally {
    isActing.value = false
  }
}

onMounted(load)
</script>

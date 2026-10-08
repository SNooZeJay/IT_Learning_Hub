<template>
  <div>
    <LoadingState v-if="isLoading" label="Loading checkout" />

    <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else-if="course">
      <PageHeader
        :title="settled ? 'Payment successful' : 'Checkout'"
        :subtitle="
          settled
            ? 'You are enrolled. Your lessons are unlocked.'
            : 'One-off payment. Your place is created once the payment is confirmed.'
        "
        :crumbs="[
          { label: 'Student', to: '/student/dashboard' },
          { label: 'Courses', to: '/student/courses' },
          { label: course.title, to: `/student/courses/${course.slug}` },
          { label: settled ? 'Complete' : 'Checkout' },
        ]"
      />

      <!--
        The success message is shown on `settled`, which the server computes from the
        payment row the webhook wrote. It is deliberately not driven by `?payment=success`
        in the address bar: that string is typed by anyone, so a page that believed it
        would congratulate a learner who had just cancelled.
      -->
      <div v-if="settled" class="mx-auto max-w-2xl">
        <div class="surface-card-shell">
          <div class="flex flex-col items-center p-6 text-center">
            <span
              class="flex size-14 items-center justify-center rounded-full bg-success-50 dark:bg-success-500/15"
            >
              <CircleCheck class="size-7 text-success-600 dark:text-success-400" />
            </span>

            <h2 class="mt-4 section-heading">
              Payment successful — you are enrolled
            </h2>

            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {{ course.title }} is now on your dashboard, with every lesson, quiz and assignment
              unlocked.
            </p>

            <dl
              v-if="referenceNumber"
              class="mt-6 w-full space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-start dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-4">
                <dt class="text-xs text-gray-500 dark:text-gray-400">Reference</dt>
                <dd class="font-mono text-xs text-gray-900 dark:text-white/90">
                  {{ referenceNumber }}
                </dd>
              </div>
              <div
                v-if="paidAt"
                class="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 dark:border-gray-800"
              >
                <dt class="text-xs text-gray-500 dark:text-gray-400">Paid</dt>
                <dd class="text-xs text-gray-900 dark:text-white/90">
                  {{ formatDateTime(paidAt) }}
                </dd>
              </div>
            </dl>

            <div class="mt-6 flex w-full flex-col gap-3 sm:flex-row">
              <RouterLink :to="`/student/courses/${course.slug}`" class="flex-1">
                <Button variant="primary" class="w-full">Go to the course</Button>
              </RouterLink>
              <RouterLink to="/student/courses" class="flex-1">
                <Button variant="outline" class="w-full">My courses</Button>
              </RouterLink>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="surface-card-shell">
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 class="section-heading">Confirm your purchase</h2>
              <p class="mt-1 section-subheading">Check the course and the price before you pay.</p>
            </div>
            <div class="p-6">
              <Alert
                v-if="notice"
                :variant="noticeVariant"
                :title="noticeTitle"
                :message="notice"
                class="mb-5"
              />

              <Alert
                v-if="actionError"
                variant="error"
                title="Checkout could not be opened"
                :message="actionError"
                class="mb-5"
              />

              <!--
              The other half of the bounded wait above. When the wait runs out the learner
              is told the truth and given a way to act on it, rather than a spinner that
              never ends or a page reload that discards the reference number.
            -->
              <div
                v-if="isUnconfirmed && !settled"
                class="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-25 p-4 dark:border-brand-800 dark:bg-brand-900/20"
              >
                <RotateCw
                  class="size-5 shrink-0 text-brand-600 dark:text-brand-400"
                  :class="isRechecking ? 'animate-spin' : ''"
                  aria-hidden="true"
                />
                <p class="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-400">
                  Still waiting on PayMongo. Checking again costs nothing and will not charge you
                  twice.
                </p>
                <button
                  type="button"
                  class="btn btn-sm shrink-0 border border-brand-300 bg-white text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/70"
                  :disabled="isRechecking"
                  @click="checkAgain"
                >
                  {{ isRechecking ? 'Checking…' : 'Check again' }}
                </button>
              </div>

              <!--
              Returning from PayMongo with `?payment=success` only means the provider
              thinks the payment went through. The webhook has not necessarily run yet,
              so this waits for the server rather than claiming an outcome.
            -->
              <div
                v-if="isAwaitingConfirmation"
                class="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-25 p-4 dark:border-brand-800 dark:bg-brand-900/20"
              >
                <LoaderCircle
                  class="mt-0.5 size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-400"
                />
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white/90">
                    Confirming your payment with PayMongo
                  </p>
                  <p class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    This normally takes a few seconds. Your place is already reserved, and you do
                    not need to pay again.
                  </p>
                </div>
              </div>

              <template v-else>
                <dl class="space-y-3 text-sm">
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-gray-600 dark:text-gray-400">Course</dt>
                    <dd class="text-end font-medium text-gray-900 dark:text-white/90">
                      {{ course.title }}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-gray-600 dark:text-gray-400">Level</dt>
                    <dd class="text-end text-gray-900 dark:text-white/90">{{ course.level }}</dd>
                  </div>

                  <div class="border-t border-gray-200 pt-3 dark:border-gray-800">
                    <div class="flex items-start justify-between gap-4">
                      <dt class="text-gray-600 dark:text-gray-400">Course price</dt>
                      <dd class="text-end font-semibold text-gray-900 dark:text-white/90">
                        {{ formatPeso(course.priceCentavos) }}
                      </dd>
                    </div>
                  </div>
                </dl>

                <p class="mt-5 text-xs text-gray-500 dark:text-gray-400">
                  You will be taken to PayMongo to complete the payment, then brought straight back
                  here. Payment is processed by PayMongo; nothing on this page charges your card.
                </p>

                <div class="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="primary"
                    class="sm:flex-1"
                    :disabled="isActing"
                    @click="handlePay"
                  >
                    <LoaderCircle v-if="isActing" class="mr-2 size-4 animate-spin" />
                    {{
                      isActing ? 'Opening PayMongo...' : `Pay ${formatPeso(course.priceCentavos)}`
                    }}
                  </Button>
                  <RouterLink :to="`/student/courses/${course.slug}`" class="sm:flex-1">
                    <Button variant="outline" class="w-full">Back to the course</Button>
                  </RouterLink>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div>
          <div class="surface-card-shell">
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 class="section-heading">What happens next</h2>
            </div>
            <div class="p-6">
              <ol class="space-y-4 text-sm">
                <li v-for="(step, index) in steps" :key="step.title" class="flex gap-3">
                  <span
                    class="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    {{ index + 1 }}
                  </span>
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white/90">{{ step.title }}</p>
                    <p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{{ step.body }}</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CircleCheck, LoaderCircle, RotateCw } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import { getCourseBySlug } from '@/services/course.service'
import { paymentStatus, startCheckout, CheckoutError } from '@/services/checkout.service'
import { formatPeso, formatDateTime } from '@/types'
import type { Course } from '@/types'

/**
 * Checkout, and the page PayMongo returns to.
 *
 * It answers one question honestly: has this payment actually settled? That is not
 * knowable from the URL. `?payment=success` says the provider redirected us; the
 * webhook is what actually moves a payment to `paid` and activates the enrolment. So
 * this page asks the server, and shows the success state only when the server says the
 * money is in.
 *
 * Two return paths exist. On `?payment=success` it polls for a few seconds, because the
 * webhook is a separate request and may not have landed when the browser arrives. On
 * `?payment=cancelled` it explains that nothing was charged. Anything else — including
 * someone typing `?payment=success` into the address bar by hand — lands on the ordinary
 * checkout form, where the Pay button is the only thing that can start a payment.
 */

const POLL_INTERVAL_MS = 1500
const POLL_ATTEMPTS = 8

const route = useRoute()

const course = ref<Course | null>(null)
const isLoading = ref(true)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const noticeVariant = ref<'success' | 'warning' | 'error'>('warning')
const noticeTitle = ref('')
const isActing = ref(false)

const settled = ref(false)
const referenceNumber = ref<string | null>(null)
const paidAt = ref<string | null>(null)
const isAwaitingConfirmation = ref(false)

/**
 * We came back from PayMongo saying `?payment=success`, and the server still does not
 * agree that the money arrived.
 *
 * A distinct state from "awaiting" on purpose. Awaiting is a spinner with a short,
 * self-ending wait. This is what is left when that wait ran out, and it must not look
 * like the same thing: the previous wording told the learner to refresh the page, which
 * threw away the only thing that had the answer in it - the reference number - and left
 * them with no way to try again short of reloading and hoping.
 */
const isUnconfirmed = ref(false)

/** Re-checking is in flight, so the button can disable itself. */
const isRechecking = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null

const steps = [
  {
    title: 'Pay with PayMongo',
    body: 'You are taken to PayMongo to complete the payment, then returned here.',
  },
  {
    title: 'We confirm it',
    body: 'PayMongo tells us directly that the payment went through.',
  },
  {
    title: 'Your lessons unlock',
    body: 'Your place is activated and the full course appears on your dashboard.',
  },
]

const load = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = ''
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    loadError.value = 'That checkout link is missing a course.'
    isLoading.value = false
    return
  }
  try {
    course.value = await getCourseBySlug(slug)
    if (!course.value) {
      loadError.value = 'That course does not exist.'
    }
  } catch {
    loadError.value = 'That course could not be loaded. Please try again.'
  } finally {
    isLoading.value = false
  }
}

/** One authoritative read. Never infers success from the URL. */
const readStatus = async (): Promise<void> => {
  if (!course.value) return
  const status = await paymentStatus(course.value.id)
  if (!status) return

  referenceNumber.value = status.referenceNumber
  paidAt.value = status.paidAt

  if (status.settled) {
    settled.value = true
    isAwaitingConfirmation.value = false
    return
  }

  // Not settled. Whether that is a problem depends on whether a payment is even in
  // flight: an abandoned payment is the learner's to retry, a failed one is worth
  // saying plainly.
  if (status.paymentStatus === 'failed') {
    isAwaitingConfirmation.value = false
    noticeVariant.value = 'error'
    noticeTitle.value = 'Payment failed'
    notice.value =
      'That payment did not go through, so you have not been charged. You can try again.'
  } else if (status.paymentStatus === 'cancelled') {
    isAwaitingConfirmation.value = false
    noticeVariant.value = 'warning'
    noticeTitle.value = 'Payment cancelled'
    notice.value = 'You cancelled at PayMongo, so nothing was charged. You can start again.'
  }
}

const stopPolling = (): void => {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/**
 * Wait for the webhook.
 *
 * The learner has already paid at this point, so the only job is to be patient and then
 * tell them the truth. Bounded at a dozen seconds: if the webhook has not run by then
 * something is genuinely wrong, and leaving a spinner forever would hide it.
 */
const pollForSettlement = async (attempt = 0): Promise<void> => {
  try {
    await readStatus()
  } catch {
    // Keep trying; the last failure is reported by the button path.
  }

  if (settled.value) {
    isUnconfirmed.value = false
    stopPolling()
    return
  }

  if (attempt >= POLL_ATTEMPTS) {
    isAwaitingConfirmation.value = false
    isUnconfirmed.value = true
    noticeVariant.value = 'warning'
    noticeTitle.value = 'Taking longer than expected'
    notice.value =
      'PayMongo has not confirmed this payment yet. Your place is reserved and you have not been charged twice. ' +
      'This usually clears on its own within a minute or two - press Check again, and if it does not, ' +
      'quote the reference number below.'
    stopPolling()
    return
  }

  pollTimer = setTimeout(() => void pollForSettlement(attempt + 1), POLL_INTERVAL_MS)
}

/**
 * Ask the server again, on demand.
 *
 * The bounded wait exists so a learner is never left watching a spinner, but ending the
 * wait is not the same as ending the question: the webhook may still be retrying, and a
 * duplicate delivery is absorbed rather than double-charged. So the exhausted state
 * offers another look instead of a dead end.
 */
const checkAgain = async (): Promise<void> => {
  if (isRechecking.value || settled.value) return
  isRechecking.value = true
  isUnconfirmed.value = false
  isAwaitingConfirmation.value = true
  try {
    await readStatus()
    if (settled.value) {
      isAwaitingConfirmation.value = false
      notice.value = ''
      noticeTitle.value = ''
    } else {
      isAwaitingConfirmation.value = false
      isUnconfirmed.value = true
      noticeVariant.value = 'warning'
      noticeTitle.value = 'Taking longer than expected'
      notice.value =
        'Still nothing from PayMongo. Your place is reserved and you have not been charged twice. ' +
        'Quote the reference number below if you need to raise it.'
    }
  } catch {
    isAwaitingConfirmation.value = false
    isUnconfirmed.value = true
    noticeVariant.value = 'warning'
    noticeTitle.value = 'Could not reach the server'
    notice.value =
      'We could not check your payment just now. Your place is reserved. Press Check again in a moment.'
  } finally {
    isRechecking.value = false
  }
}

const handlePay = async (): Promise<void> => {
  if (!course.value || isActing.value) return
  actionError.value = ''
  isActing.value = true
  try {
    const result = await startCheckout(course.value.id, course.value.slug)

    if (!result.requiresPayment) {
      // A free course reached checkout, which should not happen. Send them back rather
      // than inventing a payment flow for something that costs nothing.
      window.location.href = `/student/courses/${course.value.slug}`
      return
    }

    if (!result.checkoutUrl) {
      actionError.value = result.reused
        ? 'You have an unfinished payment for this course. Please try again to open a new checkout - you have not been charged.'
        : 'The payment provider did not return a checkout link. Please try again.'
      return
    }

    // Full navigation, not router.push: this leaves the app for PayMongo's hosted page.
    window.location.href = result.checkoutUrl
  } catch (error) {
    actionError.value =
      error instanceof CheckoutError
        ? error.message
        : 'Checkout could not be opened. Nothing has been charged.'
  } finally {
    isActing.value = false
  }
}

onMounted(async () => {
  await load()
  if (!course.value) return

  try {
    await readStatus()
  } catch {
    // The Pay button still works; the learner does not need this page to tell them
    // anything in order to buy.
  }

  if (settled.value) return

  if (route.query.payment === 'success') {
    // Only a real return enters the waiting state. A hand-typed query string does not.
    isAwaitingConfirmation.value = true
    void pollForSettlement()
  } else if (route.query.payment === 'cancelled') {
    noticeVariant.value = 'warning'
    noticeTitle.value = 'Checkout cancelled'
    notice.value = 'You have not been charged. You can start again whenever you like.'
  } else if (route.query.payment !== undefined) {
    // `?payment=anything-else` is not a state this page knows. Show the form rather
    // than acting on a value it does not understand.
    noticeVariant.value = 'warning'
    noticeTitle.value = 'Nothing to confirm'
    notice.value = 'That link did not come from a payment, so nothing has been charged.'
  }
})

onBeforeUnmount(stopPolling)
</script>

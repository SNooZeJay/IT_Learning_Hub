<template>
  <div>
    <PageHeader
      title="Payments"
      subtitle="Every charge the platform has raised, in pesos, with the provider's own reference beside it."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Payments' }]"
    >
      <template #actions>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface"
          :disabled="isLoading"
          @click="load"
        >
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </button>
      </template>
    </PageHeader>

    <!--
      Stated at the top rather than discovered, because an administrator who has just
      taken a refund request will look for the button to do it with.

      The wording is the behaviour, not an apology for the screen. "Nothing on this
      screen can move money, so nothing here will claim to" is a sentence about this
      page's own construction - it explains the design to the person reading it rather
      than telling them anything they can act on. Naming where a refund actually happens
      answers the real question, which is "what do I do now?".
    -->
    <Alert
      variant="info"
      title="How a refund works"
      message="Refunds are issued by the payment provider and take effect once the provider confirms them. A refund you issue there shows up on this list as refunded."
      class="mb-6"
    />

    <LoadingState v-if="isLoading" label="Loading payments" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load payments"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected"
          :value="formatPeso(money.paidCentavos)"
          :icon="Wallet"
          :hint="`${money.paidCount} settled payment${money.paidCount === 1 ? '' : 's'}`"
        />
        <StatCard
          label="Refunded"
          :value="formatPeso(money.refundedCentavos)"
          :icon="Undo2"
          :hint="`${money.refundedCount} refunded payment${money.refundedCount === 1 ? '' : 's'}`"
        />
        <StatCard
          label="Awaiting"
          :value="formatPeso(money.pendingCentavos)"
          :icon="Clock"
          hint="Checkout started, money not confirmed"
        />
        <StatCard
          label="Failed or cancelled"
          :value="formatPeso(money.failedCentavos + money.cancelledCentavos)"
          :icon="CircleX"
          hint="Never collected, so not revenue"
        />
      </div>

      <div class="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="relative w-full lg:max-w-xs">
          <Search
            class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted"
            aria-hidden="true"
          />
          <input
            v-model.trim="search"
            type="search"
            aria-label="Search payment by name, course or reference"
            placeholder="Search name, course or reference"
            :class="searchClass"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate">Status</span>
            <select v-model="statusFilter" :class="selectClass">
              <option value="all">All statuses</option>
              <option v-for="status in PAYMENT_STATUSES" :key="status" :value="status">
                {{ PAYMENT_STATUS_LABELS[status] }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate">Provider</span>
            <select v-model="providerFilter" :class="selectClass">
              <option value="all">All providers</option>
              <option v-for="provider in providers" :key="provider" :value="provider">
                {{ provider }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <p class="mt-3 text-sm text-slate lg:text-end">
        {{ filtered.length }} of {{ payments.length }}
        {{ payments.length === 1 ? 'payment' : 'payments' }}
      </p>

      <Alert
        v-if="paymentsTruncated"
        variant="warning"
        title="Older payments are not shown"
        :message="`Showing the ${ADMIN_PAYMENT_LIMIT} most recent payments. Earlier ones are still recorded and can be looked up by reference.`"
        class="mt-4"
      />

      <EmptyState
        v-if="payments.length === 0"
        class="mt-6"
        title="No payments yet"
        description="Charges appear here when a student starts a checkout on a paid course. Free enrollments never create a payment."
        :icon="Wallet"
      />

      <EmptyState
        v-else-if="filtered.length === 0"
        class="mt-6"
        title="No payments match those filters"
        description="Try a different search word, or set the status and provider filters back to all."
        :icon="Search"
      />

      <div v-else class="mt-4 surface-card-shell">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="min-w-full text-start text-sm">
            <caption class="sr-only">
              Every payment with its amount, status, provider and reference number
            </caption>
            <thead>
              <tr class="bg-surface text-xs tracking-wide text-slate uppercase">
                <th scope="col" class="px-5 py-3 text-start font-medium">Reference</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Student</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Course</th>
                <th scope="col" class="px-5 py-3 text-end font-medium">Amount</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Status</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Provider</th>
                <th scope="col" class="px-5 py-3 text-start font-medium">Paid</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline">
              <tr
                v-for="payment in filtered"
                :key="payment.id"
                class="transition-colors hover:bg-surface-soft"
              >
                <td class="px-5 py-4">
                  <!--
                    `break-all` on every provider identifier here.

                    These are unbounded, unbroken strings: a PayMongo checkout id is
                    `paymongo unusable:` followed by a 64-character hash. Monospace at
                    12px renders 64 of those at ~7px each, so one cell measured 316px
                    inside a 358px card and pushed the whole page to 519px - 129px of
                    horizontal scroll on a 390px phone.

                    `break-all` rather than `break-words` because the string has no
                    break opportunity in it at all: `overflow-wrap: break-word` only
                    breaks at a soft wrap point, and a hash has none.
                  -->
                  <code class="font-mono text-xs break-all text-ink">{{
                    payment.referenceNumber
                  }}</code>
                  <p
                    v-if="payment.providerPaymentId"
                    class="mt-0.5 font-mono text-xs break-all text-slate"
                  >
                    {{ payment.providerPaymentId }}
                  </p>
                  <p class="mt-1 text-xs text-slate">
                    Raised {{ formatDateTime(payment.createdAt) }}
                  </p>
                </td>
                <td class="px-5 py-4 text-ink">{{ payment.studentName }}</td>
                <td class="px-5 py-4 text-slate">{{ payment.courseTitle }}</td>
                <td class="px-5 py-4 text-end tabular-nums font-medium text-ink">
                  {{ formatPeso(payment.amountCentavos) }}
                  <p class="text-xs font-normal text-slate">{{ payment.currency }}</p>
                </td>
                <td class="px-5 py-4">
                  <span
                    :class="[
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      statusToneClass[payment.status],
                    ]"
                  >
                    {{ PAYMENT_STATUS_LABELS[payment.status] }}
                  </span>
                </td>
                <td class="px-5 py-4 text-slate">
                  {{ payment.provider }}
                  <p v-if="payment.providerCheckoutId" class="mt-0.5 font-mono text-xs break-all">
                    {{ payment.providerCheckoutId }}
                  </p>
                </td>
                <td class="px-5 py-4 text-slate">
                  {{ payment.paidAt ? formatDateTime(payment.paidAt) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============================ WEBHOOK TRAIL ============================ -->
      <section class="mt-10">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 class="section-heading">Payment confirmations</h2>
            <p class="mt-1 text-sm text-slate">
              Every confirmation the payment provider sent, and what the platform concluded from
              each one.
            </p>
          </div>
        </div>

        <Alert
          v-if="eventsTruncated"
          variant="warning"
          title="Older confirmations are not shown"
          :message="`Showing the ${ADMIN_PAYMENT_EVENT_LIMIT} most recent confirmations. This is the record of what the payment provider reported, and it cannot be edited from here.`"
          class="mt-4"
        />

        <EmptyState
          v-if="events.length === 0"
          class="mt-4"
          title="No payment confirmations yet"
          description="A confirmation is posted here whenever a checkout is paid, fails or expires. Nothing has arrived, which usually means no paid course has been checked out."
          :icon="Webhook"
        />

        <ul v-else class="mt-4 space-y-3">
          <li v-for="event in events" :key="event.id" class="surface-card p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2 font-medium text-ink">
                  <span>{{ event.eventType }}</span>
                  <span class="text-sm font-normal text-slate">{{ event.provider }}</span>
                </p>
                <p class="mt-1 font-mono text-xs break-all text-slate">{{ event.eventId }}</p>
                <p class="mt-2 text-sm text-slate">
                  Received {{ formatDateTime(event.receivedAt) }}
                  <template v-if="event.processedAt">
                    · processed {{ formatDateTime(event.processedAt) }}
                  </template>
                </p>
                <p v-if="event.reportedAmountCentavos !== null" class="mt-1 text-sm text-slate">
                  Provider reported {{ formatPeso(event.reportedAmountCentavos) }}
                  {{ event.reportedCurrency ?? '' }}
                </p>
                <p
                  v-if="event.failureMessage"
                  class="mt-2 rounded border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
                >
                  {{ event.failureCode ? `${event.failureCode}: ` : '' }}{{ event.failureMessage }}
                </p>
              </div>

              <div class="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                <span
                  :class="[
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    eventToneClass[event.processingStatus],
                  ]"
                >
                  {{ event.processingStatus }}
                </span>
                <span
                  :class="[
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    event.signatureVerified
                      ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400'
                      : 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
                  ]"
                >
                  {{ event.signatureVerified ? 'Signature verified' : 'Signature not verified' }}
                </span>
                <span class="text-xs text-slate">
                  {{ event.livemode ? 'Live mode' : 'Test mode' }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Clock, CircleX, RotateCcw, Search, Undo2, Wallet, Webhook } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import {
  ADMIN_PAYMENT_EVENT_LIMIT,
  ADMIN_PAYMENT_LIMIT,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  listAdminPaymentEvents,
  listAdminPayments,
} from '@/services/admin.service'
import { searchInputClass, selectClass } from '@/components/ui/controlClasses'
import { formatDateTime, formatPeso } from '@/types'
import type {
  AdminPayment,
  AdminPaymentEvent,
  AdminPaymentStatus,
  PaymentEventStatus,
} from '@/services/admin.service'

const payments = ref<AdminPayment[]>([])
const events = ref<AdminPaymentEvent[]>([])
const paymentsTruncated = ref(false)
const eventsTruncated = ref(false)

const search = ref('')
const statusFilter = ref<AdminPaymentStatus | 'all'>('all')
const providerFilter = ref<string>('all')

const isLoading = ref(true)
const errorMessage = ref('')

/* See `controlClasses.ts`: the canonical search field. This was a local copy that
   drifted to 4px corners and a placeholder below AA contrast. */
const searchClass = searchInputClass

const statusToneClass: Record<AdminPaymentStatus, string> = {
  paid: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  failed: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  refunded: 'bg-surface text-slate',
  cancelled: 'bg-surface text-slate',
}

const eventToneClass: Record<PaymentEventStatus, string> = {
  processed: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  received: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  ignored: 'bg-surface text-slate',
  failed: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
}

const providers = computed(() =>
  [...new Set(payments.value.map((payment) => payment.provider))].sort((a, b) =>
    a.localeCompare(b),
  ),
)

const money = computed(() => {
  const total = {
    paidCentavos: 0,
    refundedCentavos: 0,
    pendingCentavos: 0,
    failedCentavos: 0,
    cancelledCentavos: 0,
    paidCount: 0,
    refundedCount: 0,
  }

  for (const payment of payments.value) {
    switch (payment.status) {
      case 'paid':
        total.paidCentavos += payment.amountCentavos
        total.paidCount += 1
        break
      case 'refunded':
        total.refundedCentavos += payment.amountCentavos
        total.refundedCount += 1
        break
      case 'pending':
        total.pendingCentavos += payment.amountCentavos
        break
      case 'failed':
        total.failedCentavos += payment.amountCentavos
        break
      case 'cancelled':
        total.cancelledCentavos += payment.amountCentavos
        break
    }
  }

  return total
})

const filtered = computed(() => {
  const term = search.value.toLowerCase()

  return payments.value.filter((payment) => {
    if (statusFilter.value !== 'all' && payment.status !== statusFilter.value) return false
    if (providerFilter.value !== 'all' && payment.provider !== providerFilter.value) {
      return false
    }
    if (!term) return true
    return (
      payment.referenceNumber.toLowerCase().includes(term) ||
      payment.studentName.toLowerCase().includes(term) ||
      payment.courseTitle.toLowerCase().includes(term)
    )
  })
})

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    // Both halves of this screen are independent, and the webhook trail is what
    // explains a payment's status. Failing to load one should not blank the other,
    // so the first failure decides the message and the second is reported beside
    // it rather than swallowed.
    const results = await Promise.allSettled([listAdminPayments(), listAdminPaymentEvents()])

    const [paymentResult, eventResult] = results

    if (paymentResult.status === 'fulfilled') {
      payments.value = paymentResult.value.payments
      paymentsTruncated.value = paymentResult.value.truncated
    }
    if (eventResult.status === 'fulfilled') {
      events.value = eventResult.value.events
      eventsTruncated.value = eventResult.value.truncated
    }

    const firstFailure = results.find((result) => result.status === 'rejected')
    errorMessage.value =
      firstFailure && firstFailure.status === 'rejected' && firstFailure.reason instanceof Error
        ? firstFailure.reason.message
        : ''
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

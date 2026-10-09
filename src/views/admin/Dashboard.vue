<template>
  <div>
    <PageHeader
      title="Platform overview"
      subtitle="Whole-school health at a glance."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Dashboard' }]"
    />

    <!--
      Shown only when this deployment has no data connection at all. It says what is
      wrong in product terms. It used to name `VITE_SUPABASE_URL`, `.env` and the dev
      server, which is setup instructions addressed to whoever is deploying, not to the
      administrator reading the screen.
    -->
    <Alert
      v-if="!isSupabaseConfigured"
      variant="warning"
      title="This site cannot reach its data"
      message="Figures cannot be loaded right now. Try again shortly, and contact the site administrator if it keeps happening."
      class="mb-6"
    />

    <LoadingState v-if="isLoading" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          :value="String(stats.students)"
          :icon="GraduationCap"
          :hint="`${stats.admins} admin${stats.admins === 1 ? '' : 's'}`"
        />
        <StatCard
          label="Instructors"
          :value="String(stats.instructors)"
          :icon="Users"
          hint="Can teach courses"
        />
        <StatCard
          label="Courses"
          :value="String(stats.publishedCourses)"
          :icon="Library"
          :hint="`${stats.draftCourses} draft${stats.draftCourses === 1 ? '' : 's'}, ${stats.paidCourses} paid`"
        />
        <StatCard
          label="Revenue"
          :value="formatPeso(stats.revenueCentavos)"
          :icon="Wallet"
          :hint="`${stats.enrolments} active enrollment${stats.enrolments === 1 ? '' : 's'}`"
        />
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <!-- `min-w-0` so a fixed-width child is clipped by the track rather than
             widening it, which is what stops the dashboard scrolling sideways on a
             phone. The chart beside it is the reason this matters. -->
        <div class="min-w-0 lg:col-span-2">
          <TrendChart metric="admin_enrollment" />
        </div>

        <div class="min-w-0">
          <div class="surface-card">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 class="section-heading">Recent payments</h2>
              <router-link
                to="/admin/payments"
                class="inline-flex min-h-9 shrink-0 items-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                All payments
              </router-link>
            </div>
            <p class="mt-1 section-subheading">Course payments, in Philippine pesos.</p>

            <!--
              Its own read, its own loading and error states, and deliberately not
              gated on `stats`.

              This panel was a heading above an empty container: the empty state
              rendered only while revenue was zero, so the first real payment made
              it render a title and nothing under it. `listAdminPayments` has always
              existed and worked - the dashboard simply never called it. Deriving
              this list from `stats` would also be wrong, since `stats` carries a
              total and not the individual receipts that make it up.
            -->
            <div class="mt-4">
              <p v-if="paymentsLoading" class="section-subheading">Loading payments…</p>

              <Alert
                v-else-if="paymentsError"
                variant="warning"
                title="Payments could not be loaded"
                :message="paymentsError"
                class="mb-1"
              >
                <button
                  type="button"
                  class="mt-2 text-sm font-medium underline"
                  @click="loadPayments"
                >
                  Try again
                </button>
              </Alert>

              <EmptyState
                v-else-if="payments.length === 0"
                title="No payments yet"
                description="Receipts appear here as students enroll in paid courses."
                :icon="Wallet"
              />

              <ul v-else role="list" class="divide-y divide-gray-200 dark:divide-gray-800">
                <li v-for="payment in payments" :key="payment.id" class="py-3">
                  <!--
                    `items-start` and no wrapping. The amount is the figure this panel
                    exists to show, so it stays in a right-hand column where several of
                    them line up and can be compared. It was sharing a `flex-wrap`
                    pattern with the card headings above, which let a long course title
                    push the amount onto its own line - fine for a heading and wrong for
                    a money column, where the ragged edge is the whole problem.
                  -->
                  <div class="flex items-start justify-between gap-3">
                    <p
                      class="min-w-0 line-clamp-2 text-sm font-medium text-gray-900 dark:text-white/90"
                      :title="payment.courseTitle"
                    >
                      {{ payment.courseTitle }}
                    </p>
                    <p
                      class="shrink-0 text-sm font-semibold text-gray-900 tabular-nums dark:text-white/90"
                    >
                      {{ formatPeso(payment.amountCentavos) }}
                    </p>
                  </div>
                  <!--
                    `line-clamp-2` plus `title`, not `truncate`.

                    This line is name, status and timestamp, and at 375px a one-line
                    clip reliably cut the timestamp - "Shan Lee Kian Garmino ·
                    Cancelled · Oct 9, 2…" - which is the part an administrator is
                    actually scanning the list for. Two lines keep all three, and the
                    row is a table row on a page that scrolls anyway.

                    The course title above gets the same treatment for the same reason,
                    so both lines of a payment row are readable at phone width.
                  -->
                  <p
                    class="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400"
                    :title="`${payment.studentName} · ${PAYMENT_STATUS_LABELS[payment.status]} · ${formatDateTime(payment.paidAt ?? payment.createdAt)}`"
                  >
                    {{ payment.studentName }} · {{ PAYMENT_STATUS_LABELS[payment.status] }} ·
                    {{ formatDateTime(payment.paidAt ?? payment.createdAt) }}
                  </p>
                  <!--
                    The provider's reference, named.

                    An administrator reconciling a charge against the provider needs this,
                    so it stays - but it was `text-gray-400` at 11px, which measured
                    2.61:1 on white and 3.55:1 in dark: present, and unreadable in both.

                    It also read as an unexplained string. `slate` makes it legible and
                    "Reference" tells a reader what it is, so a row of them scans as
                    receipts rather than as identifiers nobody is expected to recognise.
                  -->
                  <p class="mt-1 text-[11px] text-slate">
                    Reference <span class="font-mono">{{ payment.referenceNumber }}</span>
                  </p>
                </li>
              </ul>

              <!--
                A truncated list that looks like the whole list is the failure mode
                that matters on a money screen, so the cap is stated rather than
                left for the reader to guess at.
              -->
              <p
                v-if="paymentsTruncated && payments.length > 0"
                class="mt-3 text-xs text-gray-500 dark:text-gray-400"
              >
                Showing the {{ payments.length }} most recent. Older charges are on the payments
                page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { GraduationCap, Library, Users, Wallet } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import TrendChart from '@/components/common/TrendChart.vue'
import Alert from '@/components/ui/Alert.vue'
import { getAdminStats, EMPTY_ADMIN_STATS } from '@/services/stats.service'
import {
  listAdminPayments,
  PAYMENT_STATUS_LABELS,
  type AdminPayment,
} from '@/services/admin.service'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { formatPeso, formatDateTime } from '@/types'
import type { AdminStats } from '@/services/stats.service'

const stats = ref<AdminStats>(EMPTY_ADMIN_STATS)
const isLoading = ref(true)
const errorMessage = ref('')

/**
 * The receipt list behind "Recent payments".
 *
 * Kept apart from `stats` on purpose. A failure here must not replace the
 * dashboard's charts with an error page, and the two answer different questions:
 * `stats` is the aggregate, this is the ledger behind it.
 */
const payments = ref<AdminPayment[]>([])
const paymentsTruncated = ref(false)
const paymentsLoading = ref(true)
const paymentsError = ref('')

async function loadPayments(): Promise<void> {
  paymentsLoading.value = true
  paymentsError.value = ''
  try {
    const result = await listAdminPayments()
    payments.value = result.payments
    paymentsTruncated.value = result.truncated
  } catch (error) {
    payments.value = []
    paymentsTruncated.value = false
    paymentsError.value = error instanceof Error ? error.message : 'Could not load recent payments.'
  } finally {
    paymentsLoading.value = false
  }
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    stats.value = await getAdminStats()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load platform statistics.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void load()
  void loadPayments()
})
</script>

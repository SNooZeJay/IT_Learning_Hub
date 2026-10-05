<template>
  <div>
    <PageHeader
      title="Platform overview"
      subtitle="Whole-school health at a glance."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Dashboard' }]"
    />

    <Alert
      v-if="!isSupabaseConfigured"
      variant="warning"
      title="Supabase is not configured"
      message="Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the dev server."
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
          :hint="`${stats.enrolments} active enrolment${stats.enrolments === 1 ? '' : 's'}`"
        />
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Enrolment trend</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              New enrolments per month across the platform.
            </p>
            <div class="mt-6">
              <!--
                The monthly aggregation is not built yet, so this reports the real
                active enrolment count rather than a chart drawn from invented
                numbers. Swap in the trend chart when the query lands.
              -->
              <EmptyState
                title="No enrolments yet"
                :description="`Once students enrol, this panel plots new enrolments month by month. There are ${stats.enrolments} active so far.`"
                :icon="ChartColumn"
              />
            </div>
          </div>
        </div>

        <div>
          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-title-sm text-gray-900 dark:text-white/90">Recent payments</h2>
              <router-link
                to="/admin/payments"
                class="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                All payments
              </router-link>
            </div>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">PayMongo receipts in PHP.</p>

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
              <p v-if="paymentsLoading" class="text-sm text-gray-500 dark:text-gray-400">
                Loading payments…
              </p>

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
                description="Receipts appear here as students enrol in paid courses."
                :icon="Wallet"
              />

              <ul v-else role="list" class="divide-y divide-gray-200 dark:divide-gray-800">
                <li v-for="payment in payments" :key="payment.id" class="py-3">
                  <div class="flex items-baseline justify-between gap-3">
                    <p
                      class="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-white/90"
                    >
                      {{ payment.courseTitle }}
                    </p>
                    <p
                      class="shrink-0 text-sm font-medium text-gray-900 tabular-nums dark:text-white/90"
                    >
                      {{ formatPeso(payment.amountCentavos) }}
                    </p>
                  </div>
                  <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    {{ payment.studentName }} · {{ payment.status }} ·
                    {{ formatDateTime(payment.paidAt ?? payment.createdAt) }}
                  </p>
                  <code class="mt-0.5 block font-mono text-[11px] text-gray-400 dark:text-gray-500">
                    {{ payment.referenceNumber }}
                  </code>
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
import { ChartColumn, GraduationCap, Library, Users, Wallet } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import { getAdminStats, EMPTY_ADMIN_STATS } from '@/services/stats.service'
import { listAdminPayments, type AdminPayment } from '@/services/admin.service'
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

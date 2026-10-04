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

    <ErrorState
      v-else-if="errorMessage"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" :value="String(stats.students)" :icon="GraduationCap" :hint="`${stats.admins} admin${stats.admins === 1 ? '' : 's'}`" />
        <StatCard label="Instructors" :value="String(stats.instructors)" :icon="Users" hint="Can teach courses" />
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
          <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
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
          <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Recent payments</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">PayMongo receipts in PHP.</p>
            <div class="mt-6">
              <EmptyState
                v-if="stats.revenueCentavos === 0"
                title="No payments yet"
                description="Receipts appear here as students enrol in paid courses."
                :icon="Wallet"
              />
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
import { isSupabaseConfigured } from '@/services/supabase/client'
import { formatPeso } from '@/types'
import type { AdminStats } from '@/services/stats.service'

const stats = ref<AdminStats>(EMPTY_ADMIN_STATS)
const isLoading = ref(true)
const errorMessage = ref('')

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

onMounted(load)
</script>

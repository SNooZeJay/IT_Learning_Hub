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

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Students" value="0" :icon="GraduationCap" hint="Registered learners" />
      <StatCard label="Instructors" value="0" :icon="Users" hint="Can teach courses" />
      <StatCard label="Courses" value="0" :icon="Library" hint="Drafts and published" />
      <StatCard label="Revenue" :value="formatPeso(0)" :icon="Wallet" hint="All time, PHP" />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Enrolment trend</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            New enrolments per month across the platform.
          </p>
          <div class="mt-6">
            <EmptyState
              title="No enrolment data yet"
              description="Once students enrol, this chart plots new enrolments month by month."
              :icon="ChartColumn"
            />
          </div>
        </div>
      </div>

      <div>
        <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Recent payments</h2>
          <div class="mt-6">
            <EmptyState title="No payments yet" description="PayMongo receipts appear here as students enrol in paid courses." :icon="Wallet" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChartColumn, GraduationCap, Library, Users, Wallet } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Alert from '@/components/ui/Alert.vue'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { formatPeso } from '@/types'
</script>
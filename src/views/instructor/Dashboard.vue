<template>
  <div>
    <PageHeader
      title="Instructor overview"
      :subtitle="`Signed in as ${auth.profile?.fullName ?? 'an instructor'}.`"
      :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Dashboard' }]"
    >
      <template #actions>
        <router-link
          to="/instructor/courses/create"
          class="inline-flex items-center gap-2 rounded bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus class="size-4" />
          New course
        </router-link>
      </template>
    </PageHeader>

    <Alert
      v-if="!isSupabaseConfigured"
      variant="warning"
      title="Supabase is not configured"
      message="Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the dev server."
      class="mb-6"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="My courses" value="0" :icon="Library" hint="Drafts included" />
      <StatCard label="Enrolled students" value="0" :icon="Users" hint="Across all courses" />
      <StatCard label="Submissions to grade" value="0" :icon="ListChecks" hint="Nothing waiting" />
      <StatCard label="Average quiz score" value="--" :icon="ChartColumn" hint="No attempts yet" />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <div
          class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">My courses</h2>
          <div class="mt-6">
            <EmptyState
              title="No courses yet"
              description="Create your first course to start building modules and lessons."
              :icon="Library"
            >
              <router-link
                to="/instructor/courses/create"
                class="inline-flex items-center gap-2 rounded bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                Create a course
              </router-link>
            </EmptyState>
          </div>
        </div>
      </div>

      <div>
        <div
          class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Needs grading</h2>
          <div class="mt-6">
            <EmptyState
              title="Nothing to grade"
              description="Submissions appear here as students hand them in."
              :icon="ListChecks"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChartColumn, Library, ListChecks, Plus, Users } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Alert from '@/components/ui/Alert.vue'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/supabase/client'

const auth = useAuthStore()
</script>

<template>
  <div>
    <PageHeader
      :title="`Welcome back, ${firstName}`"
      :subtitle="`You are signed in as a${roleLabel}.`"
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Dashboard' }]"
    >
      <template #actions>
        <router-link
          to="/student/courses"
          class="inline-flex items-center gap-2 rounded bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          Browse courses
        </router-link>
      </template>
    </PageHeader>

    <!--
      An unconfigured project cannot read anything. Saying so is more useful than
      an empty dashboard that looks like a data problem.
    -->
    <Alert
      v-if="!isSupabaseConfigured"
      variant="warning"
      title="Supabase is not configured"
      message="Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the dev server. Nothing can load until those are set."
      class="mb-6"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Enrolled courses" value="0" :icon="BookOpen" hint="Enrol to get started" />
      <StatCard label="Lessons completed" value="0" :icon="CircleCheck" hint="Across all courses" />
      <StatCard label="Average quiz score" value="--" :icon="Award" hint="No attempts yet" />
      <StatCard label="Deadlines this week" value="0" :icon="CalendarDays" hint="Nothing due" />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Continue learning</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your current course and next lesson appear here.
          </p>
          <div class="mt-6">
            <EmptyState
              title="Nothing in progress"
              description="Once you enrol in a course, your next lesson shows up here so you can pick up where you left off."
              :icon="BookOpen"
            >
              <router-link
                to="/student/courses"
                class="inline-flex items-center gap-2 rounded bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                Find a course
              </router-link>
            </EmptyState>
          </div>
        </div>
      </div>

      <div>
        <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Coming up</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Deadlines and events.</p>
          <div class="mt-6">
            <EmptyState title="Nothing scheduled" description="No deadlines in the next few weeks." :icon="CalendarDays" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Award, BookOpen, CalendarDays, CircleCheck } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Alert from '@/components/ui/Alert.vue'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/supabase/client'

const auth = useAuthStore()

const firstName = computed(() => auth.profile?.fullName.split(' ')[0] ?? 'there')
const roleLabel = computed(() => (auth.role === 'student' ? ' student' : ` ${auth.role}`))
</script>
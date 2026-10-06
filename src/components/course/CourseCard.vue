<template>
  <article
    class="flex flex-col rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-700"
  >
    <div class="flex items-start justify-between gap-3">
      <span
        class="inline-flex rounded bg-brand-50 px-2 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
      >
        {{ course.level }}
      </span>
      <span
        v-if="enrolled"
        class="inline-flex items-center gap-1 rounded bg-success-50 px-2 py-1 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400"
      >
        <CircleCheck class="size-3.5" />
        Enrolled
      </span>
    </div>

    <h3 class="mt-3 text-theme-sm font-medium text-gray-900 dark:text-white/90">
      <router-link
        :to="`/student/courses/${course.slug}`"
        class="hover:text-brand-600 dark:hover:text-brand-400"
      >
        {{ course.title }}
      </router-link>
    </h3>

    <p class="mt-2 line-clamp-3 flex-1 text-sm text-gray-500 dark:text-gray-400">
      {{ course.description ?? 'No description yet.' }}
    </p>

    <dl class="mt-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      <div v-if="course.durationMinutes" class="flex items-center gap-1.5">
        <Clock class="size-4" />
        <dt class="sr-only">Duration</dt>
        <dd>{{ formatDuration(course.durationMinutes) }}</dd>
      </div>
      <div class="flex items-center gap-1.5">
        <Wallet class="size-4" />
        <dt class="sr-only">Price</dt>
        <dd :class="course.priceCentavos > 0 ? 'font-medium text-gray-900 dark:text-white/90' : ''">
          {{ course.priceCentavos > 0 ? formatPeso(course.priceCentavos) : 'Free' }}
        </dd>
      </div>
    </dl>

    <router-link
      :to="`/student/courses/${course.slug}`"
      class="mt-4 inline-flex items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-colors"
      :class="
        course.priceCentavos > 0
          ? 'bg-brand-500 text-white hover:bg-brand-600'
          : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]'
      "
    >
      {{ enrolled ? 'Continue' : course.priceCentavos > 0 ? 'View and enroll' : 'View course' }}
      <ArrowRight class="size-4" />
    </router-link>
  </article>
</template>

<script setup lang="ts">
import { ArrowRight, CircleCheck, Clock, Wallet } from 'lucide-vue-next'
import type { Course } from '@/types'
import { formatPeso } from '@/types'

defineProps<{
  course: Course
  /** Suppresses the price CTA wording once the student already has a place. */
  enrolled?: boolean
}>()

/** "3h 20m" rather than "200 minutes", which nobody reads at a glance. */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}
</script>

<template>
  <!--
    One course in the public catalogue.

    The whole card is a single click target rather than a title link with a
    separate button, because on a catalogue the expected behaviour is to click
    the thing you are looking at. It is a list item's <article> inside the caller's
    <li>, so the count of cards and the count of links stay equal for assistive
    technology.

    What is deliberately NOT here: the instructor's name, and any email address.
    A public catalogue that leaks who teaches a course, or how to reach them,
    publishes personal data nobody consented to publish.
  -->
  <article
    class="group relative flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface transition-colors hover:border-hairline-strong"
  >
    <div class="relative aspect-16/9 w-full overflow-hidden border-b border-hairline bg-surface">
      <!--
        Cover art when the course has one, and an honest labelled placeholder when
        it does not. The placeholder is deliberately not a generic icon on a
        coloured tile: a drawn pattern keyed to the course level reads as
        intentional, where an icon tile would read as a missing image.
      -->
      <img
        v-if="course.thumbnailUrl"
        :src="course.thumbnailUrl"
        :alt="`Cover for ${course.title}`"
        loading="lazy"
        class="size-full object-cover"
      />
      <div v-else class="flex size-full items-center justify-center p-6">
        <LevelPattern
          :level="course.level"
          :module-count="course.moduleCount"
          class="size-full text-slate"
        />
      </div>

      <span
        class="absolute start-3 top-3 rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-medium text-ink backdrop-blur-sm"
      >
        {{ LEVEL_LABELS[course.level] }}
      </span>
    </div>

    <div class="flex flex-1 flex-col p-5">
      <p v-if="course.categoryName" class="text-xs font-medium text-slate">
        {{ course.categoryName }}
      </p>
      <h3 class="mt-1 text-lg font-semibold text-ink">
        <RouterLink :to="`/courses/${course.slug}`" class="after:absolute after:inset-0">
          {{ course.title }}
        </RouterLink>
      </h3>

      <p v-if="course.description" class="mt-2 line-clamp-2 text-sm text-slate">
        {{ course.description }}
      </p>

      <!--
        Published content counts only, phrased in words so nothing here depends on
        reading a colour or an icon. A zero reads as a zero, not as a failure -
        that is the difference between "not built yet" and "broken".
      -->
      <p class="mt-4 text-xs text-slate">
        {{ course.moduleCount }} {{ course.moduleCount === 1 ? 'module' : 'modules' }} ·
        {{ course.lessonCount }} {{ course.lessonCount === 1 ? 'lesson' : 'lessons' }}
        <template v-if="course.durationMinutes">
          · {{ formatDuration(course.durationMinutes) }}</template
        >
      </p>

      <div class="mt-5 flex items-center justify-between border-t border-hairline pt-4">
        <span class="text-base font-semibold text-ink">
          {{ priceLabel }}
        </span>
        <span
          class="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors group-hover:text-brand-500"
        >
          View course
          <ArrowRight class="size-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import LevelPattern from './LevelPattern.vue'
import { LEVEL_LABELS } from '@/services/catalogue.service'
import type { CatalogueCourse } from '@/services/catalogue.service'

const props = defineProps<{ course: CatalogueCourse }>()

/**
 * "Free" or a peso amount, and never a decimal peso.
 *
 * The value is integer centavos. Formatting happens here rather than in the
 * template so that every surface showing a price - card, course page, receipt -
 * spells ₱1,500 the same way, and so no floating-point peso can reach a screen.
 */
const priceLabel = computed(() =>
  props.course.priceCentavos > 0
    ? `₱${(props.course.priceCentavos / 100).toLocaleString('en-PH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`
    : 'Free',
)

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} hr`
  return `${hours} hr ${rest} min`
}
</script>

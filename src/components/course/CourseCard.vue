<template>
  <!--
    `h-full`, and it is what makes a grid row of cards line up.

    A grid item is stretched to the row height by default, but only if it does not
    also have a height of its own. This card was `flex flex-col` twice over and
    nothing else, so the article sized itself to its content and a row of them came
    out ragged: a course with a two-line description and a course with a three-line
    one ended at different heights, and the CTA buttons - the only reason any of them
    is tappable - sat at a different height on each card. `h-full` lets the row set
    the height and the flex column distribute it.

    The single `flex-1` on the description is what does the distributing. It absorbs
    all the slack, so the meta row and the CTA are pushed to the bottom of every card
    in the row and the price baselines line up across the row.

    `surface-card-interactive` is the shared token, so the surface, the border and the
    shadow come from the same place as every other card in the app rather than from
    this file. Adjacent cards were nearly indistinguishable on desktop because the
    only separation between them was the grid gap showing whatever was behind; the
    widened gap in `Catalog.vue` plus a visible border is the pair that fixes it.
  -->
  <article class="surface-card-interactive flex h-full flex-col">
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

    <!--
      The card's own title, one step above the description and one below the page
      heading. It was `text-theme-sm` at weight 500 - 14px, the same size as the
      description underneath it, so the only thing separating "IT Support Essentials"
      from its blurb was a half-step of weight. Two paragraphs of text at identical
      size is what made this card read as uniformly loud: nothing in it was allowed
      to be quieter than anything else. 16px at 600 gives the scan path a real
      anchor while `section-subheading` keeps the description at 14px.

      The description clamps to 2 lines rather than 3. In a three-column grid that was
      the bulk of the card's height and of its visual noise, and the third line was
      always mid-sentence. Truncation is a display choice, not an edit to the copy -
      the full text is still on the course page and still in the database.
    -->
    <!--
      `line-clamp-2` on the title as well as the description.

      Course titles are unbounded - they come from the database and an instructor can
      call a course whatever they like - so in a narrow grid column a long title ran to
      four or five lines and pushed everything below it down. That is what made a row
      ragged: not the descriptions, which were already clamped, but the titles.

      `min-w-0` because the `<a>` is a flex item here. Without it the flex item's
      automatic minimum size is its content size, and `line-clamp` needs a definite
      width to clamp against - so on a narrow column the clamp silently did nothing
      and the title wrapped instead. This is the same cause as the unreadable-text
      sweep elsewhere in the app: a flex child holding text with no `min-w-0`.

      A clamped title is a display choice, not an edit to the copy. The full text is
      on the course page and in the database, and the link text is the full title for
      a screen reader - the clamp is visual only.
    -->
    <h3 class="mt-3 line-clamp-2 min-w-0 text-base font-semibold text-gray-900 dark:text-white/90">
      <router-link
        :to="`/student/courses/${course.slug}`"
        class="hover:text-brand-600 dark:hover:text-brand-400"
      >
        {{ course.title }}
      </router-link>
    </h3>

    <p class="mt-2 line-clamp-2 min-w-0 flex-1 section-subheading">
      {{ course.description ?? 'No description yet.' }}
    </p>

    <!--
      The meta row: `mt-4` for its own air, and `shrink-0` so a long duration cannot
      squeeze it. Two items sharing one line means each is a flex child that can be
      compressed below its content, and "3h 20m" turning into "3h…" is the kind of
      truncation nobody notices happening.
    -->
    <dl class="mt-4 flex shrink-0 items-center gap-4 text-xs text-slate">
      <div v-if="course.durationMinutes" class="flex shrink-0 items-center gap-1.5">
        <Clock class="size-4 shrink-0" />
        <dt class="sr-only">Duration</dt>
        <dd>{{ formatDuration(course.durationMinutes) }}</dd>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <Wallet class="size-4 shrink-0" />
        <dt class="sr-only">Price</dt>
        <dd :class="course.priceCentavos > 0 ? 'font-medium text-gray-900 dark:text-white/90' : ''">
          {{ course.priceCentavos > 0 ? formatPeso(course.priceCentavos) : 'Free' }}
        </dd>
      </div>
    </dl>

    <!--
      `mt-4` and `w-full` pin the CTA to the bottom of the card. `w-full` so it is the
      same shape in every card regardless of its label: "View course" is much shorter
      than "View and enroll", and two different widths of the one control that
      matters on a card reads as two different actions.
    -->
    <router-link
      :to="`/student/courses/${course.slug}`"
      class="mt-4 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-colors"
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

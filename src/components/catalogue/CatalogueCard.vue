<template>
  <!--
    One course in the public catalogue.

    THE SHARED CARD FOR BOTH PUBLIC PAGES.

    `/courses` and the landing page's "Published courses" section both render a
    course with this component, so the two public surfaces cannot drift apart.
    It previously drew from the app-wide `surface` / `hairline` / `ink` tokens and
    the landing page carried a second, landing-only copy of the card to get its
    own palette - which meant the price rule and the card layout each existed
    twice and would have diverged on the next edit. One component, one palette.

    The whole card is a single click target rather than a title link with a
    separate button, because on a catalogue the expected behaviour is to click
    the thing you are looking at. The link is a stretched pseudo-element on the
    title rather than a wrapper `<a>`, so the count of cards and the count of
    links stay equal for assistive technology. It is a list item's <article>
    inside the caller's <li>.

    What is deliberately NOT here: the instructor's name, and any email address.
    A public catalogue that leaks who teaches a course, or how to reach them,
    publishes personal data nobody consented to publish. There is also no rating,
    review count or enrolment count, because the schema has no such table and a
    number here would be invented.

    MOTION. Four states, each answering a different question:

      the card lifts 2px      this is one thing, and it is above the page
      the cover scales 3%     the card has an interior worth opening
      the title takes accent  this is where the link goes
      the arrow travels       pressing it goes somewhere

    The lift is a transform and a shadow, never a scale. Scaling the card would resize
    its text, re-rendering editorial type that is the reason the page reads well, and
    a page whose type breathes looks broken rather than responsive.

    Every one of these keeps its COLOUR and SHADOW change under `prefers-reduced-motion`
    and drops only the movement. "This responds to me" is information; "this moves" is
    not. So under reduced motion the card still deepens its shadow, the border still
    settles, and the title still takes the accent - and only the 2px lift, the 3% cover
    scale and the arrow's travel are suppressed.

    The arrow is the one that stops outright rather than travelling less far, because a
    slower arrow is still an arrow asking for attention.

    The card is also completely static without any of this. Nothing here is required to
    read it, find the title, or know it is a link: the whole frame is already a
    stretched-link target and the border already marks the edge.
  -->
  <article
    class="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-lp-line bg-lp-card lp-lift"
  >
    <div class="relative aspect-16/9 w-full overflow-hidden bg-lp-accent-soft">
      <!--
        Cover art when the course has one, and an honest labelled placeholder when
        it does not. The placeholder is deliberately not a generic icon on a
        coloured tile: a drawn pattern keyed to the course level reads as
        intentional, where an icon tile would read as a missing image.

        The media is the only part of the card that moves beyond the frame's 1px
        lift, and it moves about 3%: a still cover under a moving card reads as a
        sticker. The scale is on the image element rather than on this container so
        the overflow that hides the edges is applied here, once.
      -->
      <img
        v-if="course.thumbnailUrl"
        :src="course.thumbnailUrl"
        :alt="`Cover for ${course.title}`"
        loading="lazy"
        class="size-full object-cover transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
      />
      <div v-else class="flex size-full items-center justify-center p-6">
        <LevelPattern
          :level="course.level"
          :module-count="course.moduleCount"
          class="size-full text-lp-accent transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
        />
      </div>

      <span
        class="absolute start-3 top-3 rounded-full bg-lp-card/90 px-2.5 py-1 text-[11px] font-medium text-lp-ink backdrop-blur-sm"
      >
        {{ LEVEL_LABELS[course.level] }}
      </span>
    </div>

    <div class="flex flex-1 flex-col p-5">
      <p
        v-if="course.categoryName"
        class="text-[11px] font-medium tracking-[0.12em] text-lp-accent uppercase"
      >
        {{ course.categoryName }}
      </p>

      <h3
        class="mt-2 font-display text-lg leading-snug font-semibold text-lp-ink transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-lp-accent"
      >
        <RouterLink :to="`/courses/${course.slug}`" class="after:absolute after:inset-0">
          {{ course.title }}
        </RouterLink>
      </h3>

      <p v-if="course.description" class="mt-2 line-clamp-2 text-sm leading-relaxed text-lp-slate">
        {{ course.description }}
      </p>

      <!--
        Published content counts only, phrased in words so nothing here depends on
        reading a colour or an icon. A zero reads as a zero, not as a failure -
        that is the difference between "not built yet" and "broken".
      -->
      <p class="mt-4 text-xs text-lp-slate">
        {{ course.moduleCount }} {{ course.moduleCount === 1 ? 'module' : 'modules' }} ·
        {{ course.lessonCount }} {{ course.lessonCount === 1 ? 'lesson' : 'lessons' }}
        <template v-if="course.durationMinutes">
          · {{ formatDuration(course.durationMinutes) }}</template
        >
      </p>

      <!--
        `mt-auto` rather than a fixed top margin, so the price row sits on the
        baseline of the tallest card in a row instead of floating mid-card when a
        neighbour has a longer title or description.
      -->
      <div class="mt-auto flex items-center justify-between border-t border-lp-line pt-4">
        <span class="font-display text-base font-semibold text-lp-ink">
          {{ formatPrice(course.priceCentavos) }}
        </span>
        <span class="inline-flex items-center gap-1.5 text-sm font-medium text-lp-accent">
          View course
          <!--
            The arrow travels the width of its own glyph rather than a fixed number
            of pixels, so it reads as "moving on" rather than as "moving right". It
            is the only part of the card that repeats this on hover, which is what
            makes it the affordance rather than decoration.
          -->
          <ArrowRight
            class="size-4 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1 rtl:rotate-180 motion-reduce:group-hover:translate-x-0"
            aria-hidden="true"
          />
        </span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import LevelPattern from './LevelPattern.vue'
import { LEVEL_LABELS, formatDuration, formatPrice } from '@/services/catalogue.service'
import type { CatalogueCourse } from '@/services/catalogue.service'

defineProps<{ course: CatalogueCourse }>()
</script>

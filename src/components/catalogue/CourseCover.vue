<template>
  <!--
    The course cover, drawn from the course itself.

    Every course in the catalogue has no thumbnail, so this is what every cover
    on the public site is. Its predecessor drew thin green rules encoding module
    count and level - honest data, but at render size it read as a loading
    skeleton rather than art, and the course hero was a 500px panel of
    decorative nothing.

    This draws a typographic cover instead: the title's initial in the display
    serif, the category as the eyebrow, the level as the mark. All three are
    real course data, so the cover cannot disagree with its caption, and the
    same course always draws the same cover on every surface.

    Decorative: hidden from assistive technology. A real thumbnail keeps its
    own `Cover for ...` alt where it renders; this never stands in for one.
    Deterministic: no randomness, no time - same props, same pixels, so
    server and client renders agree.
    The badge sits outside this component (it also overlays real thumbnails),
    so the top padding reserves its zone: 48px clears the badge on every
    surface, card or hero, and reads as editorial air where no badge renders.
  -->
  <div
    aria-hidden="true"
    focusable="false"
    class="@container flex size-full flex-col justify-between overflow-hidden bg-lp-accent-soft px-[8%] pt-12 pb-[8%] text-lp-accent"
  >
    <p class="truncate text-[11px] font-semibold tracking-[0.14em] uppercase">
      {{ categoryName ?? 'Course' }}
    </p>
    <p
      class="font-display leading-none font-semibold tracking-tight select-none"
      :class="size === 'hero' ? 'text-[24cqw]' : 'text-[30cqw]'"
    >
      {{ initial }}
    </p>
    <p class="text-xs font-medium tracking-wide uppercase">
      {{ levelLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Props are the cover's whole vocabulary.
 *
 * `title` supplies the initial; `categoryName` the eyebrow; `level` the mark
 * through the shared LEVEL_LABELS, so the wording matches every badge on the
 * site rather than maintaining a second copy of three words. `size` switches
 * the composition between a card cover and the larger course hero - same
 * elements, larger initial - rather than growing a second component that
 * would drift from this one.
 *
 * Container-relative units (`cqw`) size the initial to the host surface: the
 * root establishes itself as the container (`@container`), so the catalogue
 * card and the course hero share one component with no tuned pixel sizes and
 * no changes required at either call site.
 */
import { computed } from 'vue'
import type { CourseLevel } from '@/types'
import { LEVEL_LABELS } from '@/services/catalogue.service'

const props = withDefaults(
  defineProps<{
    title: string
    level: CourseLevel
    categoryName?: string | null
    /** 'card' for grid/carousel covers, 'hero' for the course page banner. */
    size?: 'card' | 'hero'
  }>(),
  { categoryName: null, size: 'card' },
)

/** First letter of the title, uppercased. Never blank: untitled falls back to '?'. */
const initial = computed(() => (props.title.trim().charAt(0) || '?').toUpperCase())

const levelLabel = computed(() => LEVEL_LABELS[props.level] ?? LEVEL_LABELS.beginner)
</script>

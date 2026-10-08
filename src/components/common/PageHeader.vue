<template>
  <header class="mb-6">
    <nav v-if="crumbs.length" aria-label="Breadcrumb" class="mb-2">
      <ol class="flex items-center gap-1 section-subheading">
        <li v-for="(crumb, index) in crumbs" :key="crumb.label" class="flex items-center gap-1">
          <router-link
            v-if="crumb.to && index < crumbs.length - 1"
            :to="crumb.to"
            class="transition-colors hover:text-brand-600 dark:hover:text-brand-400"
          >
            {{ crumb.label }}
          </router-link>
          <span
            v-else
            :class="index === crumbs.length - 1 ? 'text-gray-900 dark:text-white/90' : ''"
            :aria-current="index === crumbs.length - 1 ? 'page' : undefined"
            >{{ crumb.label }}</span
          >
          <ChevronRight v-if="index < crumbs.length - 1" class="size-4 rtl:rotate-180" />
        </li>
      </ol>
    </nav>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <!--
        `min-w-0` on both children of this row. They are flex items, and a flex item
        defaults to `min-width: auto`, so neither would shrink below its content's
        minimum - the title block and the action row together pushed this header 14px
        wider than the space it had, and the announcements pages (the three screens
        that use this header with a subtitle) scrolled sideways on a 375px phone.
      -->
      <div class="min-w-0">
        <h1 class="text-title-lg text-gray-900 dark:text-white/90">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 section-subheading">
          {{ subtitle }}
        </p>
      </div>
      <!--
        `flex-wrap` so a header with two actions wraps them onto a second line on a
        narrow phone instead of overflowing the viewport. `shrink-0` is deliberately
        absent: on the `sm:flex-row` layout the action row shares the line with the
        title, and a shrinking button is a squeezed button.
      -->
      <div v-if="$slots.actions" class="flex min-w-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

export interface Crumb {
  label: string
  to?: string
}

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    crumbs?: Crumb[]
  }>(),
  { subtitle: '', crumbs: () => [] },
)
</script>

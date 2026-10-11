<template>
  <header class="mb-6">
    <!--
      The shadcn Breadcrumb renders the trail now, not a hand-rolled `<ol>`.
      Same contract: links for every crumb but the last, `aria-current="page"`
      on the last, chevron separators that mirror in RTL.

      What left: the `section-subheading` class on the list and the per-crumb
      flex spans. BreadcrumbList owns the row; BreadcrumbSeparator owns the
      chevron, including its `rtl:rotate-180`.
    -->
    <Breadcrumb v-if="crumbs.length" class="mb-2">
      <BreadcrumbList class="section-subheading">
        <template v-for="(crumb, index) in crumbs" :key="crumb.label">
          <BreadcrumbItem class="flex items-center gap-1">
            <BreadcrumbLink
              v-if="crumb.to && index < crumbs.length - 1"
              as-child
              class="transition-colors hover:text-brand-600 motion-reduce:transition-none dark:hover:text-brand-400"
            >
              <router-link :to="crumb.to">{{ crumb.label }}</router-link>
            </BreadcrumbLink>
            <BreadcrumbPage
              v-else
              :class="index === crumbs.length - 1 ? 'text-gray-900 dark:text-white/90' : ''"
            >
              {{ crumb.label }}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator v-if="index < crumbs.length - 1" />
        </template>
      </BreadcrumbList>
    </Breadcrumb>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <!--
        `min-w-0` on both children of this row. They are flex items, and a flex item
        defaults to `min-width: auto`, so neither would shrink below its content's
        minimum - the title block and the action row together pushed this header 14px
        wider than the space it had, and the announcements pages (the three screens
        that use this header with a subtitle) scrolled sideways on a 375px phone.
      -->
      <div class="min-w-0">
        <!--
          `title-page`, not `title-lg`. `title-lg` is the hero scale, capped at 48px,
          and it is correct on the landing page where the title is the page. Here it
          made every authenticated screen lead with a 48px headline that out-shouted
          the content underneath - "Course catalogue" was bigger than the course cards
          it was introducing. `title-page` is the app scale: 22-28px, still a clear
          step above the subtitle and card titles, but sized as a label rather than a
          billboard.
        -->
        <h1 class="text-title-page text-gray-900 dark:text-white/90">{{ title }}</h1>
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/public/ui/breadcrumb'

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

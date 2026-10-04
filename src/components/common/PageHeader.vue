<template>
  <header class="mb-6">
    <nav v-if="crumbs.length" aria-label="Breadcrumb" class="mb-2">
      <ol class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
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
      <div>
        <h1 class="text-title-lg text-gray-900 dark:text-white/90">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
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
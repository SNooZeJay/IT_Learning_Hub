<template>
  <!--
    Mobile header brand. The sidebar carries the wordmark from the xl breakpoint
    up, so this is the only place the name appears on a narrow screen.

    The product's own mark rather than the upstream logo.svg / logo-dark.svg,
    which are TailAdmin's trademark and no longer describe this project.
  -->
  <router-link to="/" class="flex items-center gap-2 xl:hidden">
    <BrandMark class="size-7 shrink-0" />
    <span class="text-theme-sm font-medium text-gray-900 dark:text-white/90">{{ BRAND.name }}</span>
  </router-link>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BrandMark from '@/components/common/BrandMark.vue'
import { BRAND } from '@/layouts/navigation'
</script>

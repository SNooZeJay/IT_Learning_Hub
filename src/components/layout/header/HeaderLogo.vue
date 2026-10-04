<template>
  <!--
    Mobile header brand. The sidebar carries the wordmark from the xl breakpoint
    up, so this is the only place the name appears on a narrow screen.

    Uses the icon plus text rather than the upstream logo.svg / logo-dark.svg,
    which are TailAdmin's trademark and no longer describe this project.
  -->
  <router-link to="/" class="flex items-center gap-2 xl:hidden">
    <img src="/images/logo/logo-icon.svg" alt="" class="size-7" width="28" height="28" />
    <span class="text-theme-sm font-medium text-gray-900 dark:text-white/90">{{ BRAND.name }}</span>
  </router-link>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { BRAND } from '@/layouts/navigation'
</script>

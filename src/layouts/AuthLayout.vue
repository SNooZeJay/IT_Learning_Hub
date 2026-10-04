<template>
  <FullScreenLayout>
    <slot />
  </FullScreenLayout>
</template>

<script setup lang="ts">
/**
 * Full-width shell for authentication and error pages: no sidebar, no header.
 *
 * A thin wrapper over the upstream `FullScreenLayout` so that component keeps
 * its own responsive behaviour while routes reference a stable layout name.
 */
import FullScreenLayout from '@/components/layout/FullScreenLayout.vue'
</script>
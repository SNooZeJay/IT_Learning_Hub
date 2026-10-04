<template>
  <div>
    <PageHeader title="Grading" subtitle="Assignment submissions waiting on you." />
    <FeaturePending />
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import FeaturePending from '@/components/common/FeaturePending.vue'
</script>
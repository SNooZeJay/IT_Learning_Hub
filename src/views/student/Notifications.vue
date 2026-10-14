<template>
  <!--
    A thin wrapper, deliberately. Everything is in `NotificationBoard` so this
    screen and the instructor and admin ones cannot drift apart - the mark-read
    flow especially, which is what keeps this list and the header/sidebar
    counts from disagreeing.
  -->
  <NotificationBoard
    title="Notifications"
    :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Notifications' }]"
    empty-title="No notifications yet"
    empty-description="Enrollments, quiz results, graded assignments and certificates all arrive here as notifications."
  />
</template>

<script setup lang="ts">
import NotificationBoard from '@/components/notifications/NotificationBoard.vue'
</script>

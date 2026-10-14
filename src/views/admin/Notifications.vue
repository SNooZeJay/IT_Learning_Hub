<template>
  <!--
    A thin wrapper, deliberately. Everything is in `NotificationBoard` so this
    screen and the student and instructor ones cannot drift apart - the mark-read
    flow especially, which is what keeps this list and the header/sidebar
    counts from disagreeing.

    The empty copy promises no particular event (see the instructor wrapper for
    why): an admin's feed fills with anything addressed to them, and the copy
    must not claim writers that do not exist yet.
  -->
  <NotificationBoard
    title="Notifications"
    :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Notifications' }]"
    empty-title="No notifications yet"
    empty-description="There is nothing addressed to you right now. When platform activity needs you, it arrives here."
  />
</template>

<script setup lang="ts">
import NotificationBoard from '@/components/notifications/NotificationBoard.vue'
</script>

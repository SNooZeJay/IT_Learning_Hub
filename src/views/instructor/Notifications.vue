<template>
  <!--
    A thin wrapper, deliberately. Everything is in `NotificationBoard` so this
    screen and the student and admin ones cannot drift apart - the mark-read
    flow especially, which is what keeps this list and the header/sidebar
    counts from disagreeing.

    The empty copy promises no particular event. The database writes
    notifications for enrolments, payments, submissions and announcements
    addressed to enrolled students; an instructor's feed fills with anything
    addressed to them - today that is mostly messages and course notices -
    and the copy must not claim writers that do not exist yet.
  -->
  <NotificationBoard
    title="Notifications"
    :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Notifications' }]"
    empty-title="No notifications yet"
    empty-description="There is nothing addressed to you right now. When a message, a submission, or a course update needs you, it arrives here."
  />
</template>

<script setup lang="ts">
import NotificationBoard from '@/components/notifications/NotificationBoard.vue'
</script>

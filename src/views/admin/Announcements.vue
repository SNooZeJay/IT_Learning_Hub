<template>
  <!--
    A thin wrapper, deliberately. Everything is in `AnnouncementBoard` so this screen and
    the instructor one cannot drift apart — the wording on a notice that reaches every
    account is worth having in exactly one place.
  -->
  <AnnouncementBoard
    title="Announcements"
    subtitle="Notices for everybody, and for the people in one course."
    :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Announcements' }]"
    compose-hint="A course left as “Everyone” reaches every signed-in account. A course notice reaches only the people enrolled in it."
    empty-title="No announcements yet"
    empty-description="Post one and everybody signed in will see it on their dashboard and their calendar."
  />
</template>

<script setup lang="ts">
import AnnouncementBoard from '@/components/announcements/AnnouncementBoard.vue'
</script>

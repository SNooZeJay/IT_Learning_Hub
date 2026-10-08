<template>
  <!--
    The instructor's announcements, which are always scoped to one of their courses.

    `allowPlatformWide` is off, which removes the "Everyone" option rather than disabling
    it. The write policy already refuses a platform-wide notice from an instructor, so this
    is not the security boundary — it is the difference between offering somebody a choice
    they do not have and not mentioning it.
  -->
  <AnnouncementBoard
    title="Announcements"
    subtitle="Notices for the people in your courses."
    :crumbs="[{ label: 'Instructor', to: '/instructor/dashboard' }, { label: 'Announcements' }]"
    compose-hint="Pick the course this is for. Everyone enrolled in it will see the notice, along with you and the administrators."
    empty-title="No announcements yet"
    empty-description="Post one and everyone enrolled in that course will see it on their dashboard and their calendar."
    :allow-platform-wide="false"
  />
</template>

<script setup lang="ts">
import AnnouncementBoard from '@/components/announcements/AnnouncementBoard.vue'
</script>

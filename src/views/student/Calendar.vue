<script setup lang="ts">
/**
 * The student's calendar.
 *
 * This was titled "Deadlines", held three stat cards and a table of assignment due
 * dates, and lived at `/student/calendar`. It was a list wearing a calendar's name:
 * no month, no week, no dates. It also quietly implied the LMS could schedule
 * things, when the only scheduled thing it knew about was `assignments.due_at`.
 *
 * What replaced it draws every dated row this student actually has - enrolments,
 * quiz attempts submitted, lessons completed, courses published, announcements, and
 * the one genuinely forward-looking date in the schema, an open quiz attempt's time
 * limit. Sources and their limits are documented in `calendar.service.ts`, including
 * the one people expect and the schema does not have: quizzes have no due date.
 *
 * The "Upcoming Deadlines" summary that belongs on the dashboard is a separate
 * thing and is served separately by `loadUpcomingDeadlines`.
 */
import { onMounted, ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import CalendarShell from '@/components/calendar/CalendarShell.vue'
import { loadCalendarEvents, type CalendarEvent } from '@/services/calendar.service'

const events = ref<CalendarEvent[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    events.value = await loadCalendarEvents()
  } catch {
    // `loadCalendarEvents` absorbs per-source failures and returns what it got, so
    // reaching here means the whole read failed rather than one query.
    errorMessage.value =
      'Your calendar could not be loaded. Your courses and your work are unaffected.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      title="Calendar"
      subtitle="Every dated thing across your courses: what happened, and what is coming."
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Calendar' }]"
    />

    <LoadingState v-if="isLoading" label="Loading your calendar" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <div v-else class="mt-6">
      <CalendarShell :events="events" audience="student" />
    </div>
  </div>
</template>

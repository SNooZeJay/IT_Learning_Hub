<template>
  <div>
    <PageHeader
      title="Announcements"
      subtitle="News from your instructors and the people who run the LMS."
      :crumbs="[{ label: 'Student', to: '/student/dashboard' }, { label: 'Announcements' }]"
    >
      <template #actions>
        <Button variant="outline" :disabled="isLoading" @click="load">
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </Button>
      </template>
    </PageHeader>

    <Alert
      v-if="errorMessage"
      variant="error"
      title="Announcements could not be loaded"
      :message="errorMessage"
      class="mb-6"
    />

    <LoadingState v-else-if="isLoading" label="Loading announcements" />

    <EmptyState
      v-else-if="announcements.length === 0"
      title="Nothing to report"
      description="When an instructor posts news about one of your courses, or the school posts something everyone needs to know, it appears here."
      :icon="Megaphone"
    />

    <!--
      Newest first, already ordered by the query. Grouped by course only in the sense that
      a course notice says which course it is about - an interleaved list is right here,
      because a maintenance window is not "about" any course and forcing it into a group
      would misrepresent it.
    -->
    <ul v-else role="list" class="grid gap-3">
      <li v-for="notice in announcements" :key="notice.id">
        <article class="rounded-lg border p-4 sm:p-5" :class="borderFor(notice.kind)">
          <div class="flex items-start gap-3">
            <!--
              The icon is decorative: the same fact is in the label beside it as text. An
              icon carrying meaning on its own fails for anyone who cannot see it.
            -->
            <component
              :is="iconFor(notice.kind)"
              class="mt-0.5 size-5 shrink-0"
              :class="iconClass(notice.kind)"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  class="rounded px-1.5 py-0.5 text-xs font-medium"
                  :class="badgeFor(notice.kind)"
                >
                  {{ labelFor(notice.kind) }}
                </span>
                <span v-if="notice.courseTitle" class="truncate text-xs text-slate">
                  {{ notice.courseTitle }}
                </span>
              </div>

              <h2 class="mt-1.5 text-theme-sm text-ink">{{ notice.title }}</h2>

              <p class="mt-1 text-xs text-slate">
                {{ notice.authorName }}
                <span aria-hidden="true">·</span>
                <span class="capitalize">{{ notice.authorRole }}</span>
                <span aria-hidden="true">·</span>
                <time :datetime="notice.publishedAt">{{ formatDateTime(notice.publishedAt) }}</time>
              </p>

              <p class="mt-2.5 whitespace-pre-line text-sm text-slate">{{ notice.body }}</p>

              <!--
                A course notice links back to the course, because "here is a new lesson" is
                only useful if the reader can reach it from the sentence.
              -->
              <RouterLink
                v-if="notice.courseSlug"
                :to="`/student/courses/${notice.courseSlug}`"
                class="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-400"
              >
                <BookOpen class="size-4" aria-hidden="true" />
                Go to {{ notice.courseTitle }}
              </RouterLink>
            </div>
          </div>
        </article>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BookOpen, CalendarClock, FileCheck, Megaphone, RotateCcw, Sparkles } from 'lucide-vue-next'
import type { Component } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import {
  listAnnouncementsForStudent,
  type AnnouncementKind,
  type StudentAnnouncement,
} from '@/services/announcement.service'
import { formatDateTime } from '@/types'

/**
 * The student's announcements.
 *
 * Read-only by design. A student reads what instructors and administrators have said;
 * writing one is not a thing they do, so offering an editor here would be a control with
 * nothing behind it.
 *
 * Nothing here filters. The `announcements select` policy already returns published
 * notices for everybody, notices for a course this student holds a live place on, and
 * their own drafts. Adding a client-side filter would be a second, weaker copy of a
 * decision the database made, and the two drift the first time a rule changes.
 *
 * The author is read from the author's own profile row, so "instructor" is a fact about
 * the person rather than a guess from which screen they wrote it on.
 */
const announcements = ref<StudentAnnouncement[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

/**
 * A maintenance window gets the attention colour, because it is the one kind of notice a
 * reader must not skim past. Everything else is deliberately quiet: a screen where every
 * card is urgent is a screen where nothing is.
 */
function borderFor(kind: AnnouncementKind): string {
  return kind === 'maintenance'
    ? 'border-warning-300 bg-warning-50/50 dark:border-warning-500/40 dark:bg-warning-500/[0.07]'
    : 'border-hairline bg-canvas dark:bg-white/[0.03]'
}

function iconFor(kind: AnnouncementKind): Component {
  switch (kind) {
    case 'maintenance':
      return CalendarClock
    case 'course_update':
      return Sparkles
    case 'assignment':
      return FileCheck
    default:
      return Megaphone
  }
}

function iconClass(kind: AnnouncementKind): string {
  switch (kind) {
    case 'maintenance':
      return 'text-warning-700 dark:text-warning-400'
    case 'course_update':
      return 'text-brand-600 dark:text-brand-400'
    case 'assignment':
      return 'text-success-700 dark:text-success-400'
    default:
      return 'text-slate'
  }
}

function badgeFor(kind: AnnouncementKind): string {
  switch (kind) {
    case 'maintenance':
      return 'bg-warning-100 text-warning-800 dark:bg-warning-500/20 dark:text-warning-300'
    case 'course_update':
      return 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
    case 'assignment':
      return 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300'
    default:
      return 'bg-surface text-slate'
  }
}

function labelFor(kind: AnnouncementKind): string {
  switch (kind) {
    case 'maintenance':
      return 'Maintenance'
    case 'course_update':
      return 'Course update'
    case 'assignment':
      return 'Assignment or quiz'
    default:
      return 'News'
  }
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    announcements.value = await listAnnouncementsForStudent()
  } catch (error) {
    announcements.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Try again in a moment.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader :title="title" :subtitle="subtitle" :crumbs="crumbs">
      <template #actions>
        <Button :disabled="isLoading" @click="load">
          <LoaderCircle v-if="isLoading" class="size-4 animate-spin" aria-hidden="true" />
          Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <!-- ------------------------------------------------------------------ -->
      <!-- Write                                                              -->
      <!-- ------------------------------------------------------------------ -->
      <section class="surface-card" aria-labelledby="compose-heading">
        <h2 id="compose-heading" class="section-heading">Post a notice</h2>
        <p class="mt-1 section-subheading">{{ composeHint }}</p>

        <form class="mt-4 grid gap-4" novalidate @submit.prevent="submit">
          <!--
            The audience picker exists for both roles, because both have to choose a
            course. Only the "Everyone" option differs: an instructor has no authority to
            address the whole platform, and the option is omitted rather than shown
            disabled, because a disabled control still tells the reader the choice exists.

            The course list is also what a fresh instructor's picker is built from, so if it
            fails to load the field falls back to a required free-text course reference
            rather than silently posting to everybody.
          -->
          <div>
            <label for="notice-course" class="mb-1.5 block text-sm font-medium text-ink">
              Who it is for
            </label>
            <select
              v-if="courses.length > 0"
              id="notice-course"
              v-model="form.courseId"
              :class="selectClass"
            >
              <option v-if="allowPlatformWide" value="">Everyone</option>
              <option v-for="course in courses" :key="course.id" :value="course.id">
                {{ course.title }}
              </option>
            </select>
            <input
              v-else
              id="notice-course"
              v-model="form.courseId"
              type="text"
              placeholder="Paste the course reference"
              :class="[inputClass, fieldErrors.course ? 'border-error-500' : '']"
              :aria-invalid="fieldErrors.course ? 'true' : undefined"
              :aria-describedby="fieldErrors.course ? 'notice-course-error' : undefined"
            />
            <p class="mt-1.5 text-xs text-slate">
              {{
                !form.courseId
                  ? 'Every signed-in account will see it. Use this for maintenance and closures.'
                  : 'Only people enrolled in this course will see it.'
              }}
            </p>
            <p
              v-if="fieldErrors.course"
              id="notice-course-error"
              role="alert"
              class="mt-1.5 text-xs text-error-700 dark:text-error-400"
            >
              {{ fieldErrors.course }}
            </p>
          </div>

          <div>
            <label for="notice-title" class="mb-1.5 block text-sm font-medium text-ink">
              Title
            </label>
            <input
              id="notice-title"
              v-model="form.title"
              type="text"
              maxlength="120"
              placeholder="Room change for Thursday's class"
              :class="[inputClass, fieldErrors.title ? 'border-error-500' : '']"
              :aria-invalid="fieldErrors.title ? 'true' : undefined"
              :aria-describedby="fieldErrors.title ? 'notice-title-error' : undefined"
            />
            <p
              v-if="fieldErrors.title"
              id="notice-title-error"
              role="alert"
              class="mt-1.5 text-xs text-error-700 dark:text-error-400"
            >
              {{ fieldErrors.title }}
            </p>
          </div>

          <div>
            <label for="notice-body" class="mb-1.5 block text-sm font-medium text-ink">
              What people need to know
            </label>
            <textarea
              id="notice-body"
              v-model="form.body"
              rows="4"
              maxlength="1000"
              placeholder="We are in Room 402 this week. Bring a laptop with the files from last session."
              :class="[inputClass, 'resize-y', fieldErrors.body ? 'border-error-500' : '']"
              :aria-invalid="fieldErrors.body ? 'true' : undefined"
              :aria-describedby="`notice-body-hint ${fieldErrors.body ? 'notice-body-error' : ''}`"
            />
            <p id="notice-body-hint" class="mt-1.5 text-xs text-slate">
              {{ form.body.length }} of 1000 characters.
            </p>
            <p
              v-if="fieldErrors.body"
              id="notice-body-error"
              role="alert"
              class="mt-1.5 text-xs text-error-700 dark:text-error-400"
            >
              {{ fieldErrors.body }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Button type="submit" :disabled="isSaving || isLoading">
              <LoaderCircle v-if="isSaving" class="size-4 animate-spin" aria-hidden="true" />
              {{ isSaving ? 'Posting...' : 'Post now' }}
            </Button>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.03]"
              :disabled="isSaving || isLoading"
              @click="submitDraft"
            >
              <Save class="size-4" aria-hidden="true" />
              Save as draft
            </button>
          </div>
        </form>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <!-- Read                                                              -->
      <!-- ------------------------------------------------------------------ -->
      <div>
        <ErrorState v-if="errorMessage" :message="errorMessage" @retry="load" />

        <LoadingState v-else-if="isLoading" label="Loading announcements" />

        <EmptyState
          v-else-if="announcements.length === 0"
          :title="emptyTitle"
          :description="emptyDescription"
          :icon="Megaphone"
        />

        <ul v-else class="grid gap-3">
          <li v-for="notice in announcements" :key="notice.id">
            <article
              class="rounded-lg border p-4"
              :class="
                notice.published
                  ? 'border-hairline bg-canvas dark:bg-white/[0.03]'
                  : 'border-dashed border-hairline-strong bg-surface-soft'
              "
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="text-theme-sm text-ink">{{ notice.title }}</h3>
                  <p class="mt-0.5 text-xs text-slate">
                    {{ audienceOf(notice) }} · {{ notice.authorName }} ·
                    {{ notice.published ? formatDate(notice.publishedAt ?? '') : 'Draft' }}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                  :class="
                    notice.published
                      ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
                      : 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                  "
                >
                  {{ notice.published ? 'Posted' : 'Draft' }}
                </span>
              </div>

              <p class="mt-2 whitespace-pre-line text-sm text-slate">{{ notice.body }}</p>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface dark:bg-white/[0.03]"
                  @click="togglePublished(notice)"
                >
                  <component
                    :is="notice.published ? EyeOff : Send"
                    class="size-4"
                    aria-hidden="true"
                  />
                  {{ notice.published ? 'Withdraw' : 'Publish' }}
                </button>
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-error-700 transition hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
                  @click="confirmDelete(notice)"
                >
                  <Trash2 class="size-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { EyeOff, LoaderCircle, Megaphone, Save, Send, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/ui/Button.vue'
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  setAnnouncementPublished,
  type Announcement,
} from '@/services/announcement.service'
import { listInstructorCourses } from '@/services/instructor.service'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { formatDate } from '@/types'
import type { Crumb } from '@/components/common/PageHeader.vue'

/**
 * The announcements board, shared by both roles that can post one.
 *
 * One component rather than two screens, because the two were going to be the same screen
 * with a different heading, and two copies of a list that publishes to everybody is two
 * places for the wording to drift. The one real difference is the audience picker: an
 * administrator may address everybody, an instructor may not, so `allowPlatformWide`
 * hides the control rather than disabling it — a disabled control still says the option
 * exists.
 *
 * What each role can actually do is decided by the database, not here. `allowPlatformWide`
 * only decides whether to draw the picker; a forged request that omitted it would still be
 * refused by the write policy.
 */
const props = withDefaults(
  defineProps<{
    title: string
    subtitle: string
    crumbs: Crumb[]
    composeHint: string
    emptyTitle: string
    emptyDescription: string
    allowPlatformWide?: boolean
  }>(),
  { allowPlatformWide: true },
)

const auth = useAuthStore()
const toast = useToast()
const { ask } = useConfirm()

const announcements = ref<Announcement[]>([])
const courses = ref<Array<{ id: string; title: string }>>([])
const isLoading = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')

const form = reactive({ courseId: '', title: '', body: '' })
const fieldErrors = reactive({ course: '', title: '', body: '' })

const inputClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:bg-white/[0.03]'
const selectClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:bg-white/[0.03]'

/** A null course is an audience, not a missing value, so it reads as a word. */
function audienceOf(notice: Announcement): string {
  return notice.courseId ? (notice.courseTitle ?? 'One course') : 'Every account'
}

/**
 * Fill the audience picker with the caller's own courses.
 *
 * The id comes from the store, not from a prop, so this screen cannot be pointed at
 * somebody else's teaching list by whoever renders it. An administrator teaches no
 * courses, so the list comes back empty and "Everyone" is the only choice, which is the
 * common case for them.
 *
 * A refusal is swallowed on purpose, and the consequence is handled rather than hidden:
 * the picker falls back to a required text field. Swallowing it and leaving "Everyone"
 * selected would silently publish a maintenance notice to the whole school because a
 * course list failed to load.
 */
async function loadCourseChoices(): Promise<void> {
  if (!auth.profile) {
    courses.value = []
    return
  }
  try {
    const list = await listInstructorCourses(auth.profile.id)
    courses.value = list.map((course) => ({ id: course.id, title: course.title }))
  } catch {
    courses.value = []
  }
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const [notices] = await Promise.all([listAnnouncements(), loadCourseChoices()])
    announcements.value = notices
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Announcements could not be loaded.'
  } finally {
    isLoading.value = false
  }
}

/**
 * Client-side checks for a fast response. The database is still the authority: the write
 * policy decides who may post where, and this only stops an obviously incomplete form
 * from making a round trip.
 */
function validate(): boolean {
  fieldErrors.title = form.title.trim() ? '' : 'Give the notice a title.'
  fieldErrors.body = form.body.trim() ? '' : 'Write what people need to know.'
  // "Everyone" is a legitimate choice for an administrator and not an option at all for
  // an instructor, so it is only an error when this role may not choose it.
  fieldErrors.course =
    !props.allowPlatformWide && !form.courseId.trim() ? 'Choose the course this notice is for.' : ''
  return !fieldErrors.title && !fieldErrors.body && !fieldErrors.course
}

async function post(publishNow: boolean): Promise<void> {
  if (!validate()) return
  if (!auth.profile) {
    toast.error('Not signed in', 'Sign in again to post a notice.')
    return
  }

  isSaving.value = true
  try {
    const created = await createAnnouncement({
      authorId: auth.profile.id,
      title: form.title,
      body: form.body,
      // `validate()` has already refused an empty course for a role that may not choose
      // "everybody", so the null here is always a deliberate platform-wide notice.
      courseId: form.courseId.trim() || null,
      publishNow,
    })
    announcements.value = [created, ...announcements.value]
    form.title = ''
    form.body = ''
    toast.success(
      publishNow ? 'Notice posted' : 'Draft saved',
      publishNow
        ? 'Everybody in range will see it on their dashboard and their calendar.'
        : 'Only you and administrators can see it until you publish it.',
    )
  } catch (error) {
    toast.error('The notice was not posted', error instanceof Error ? error.message : 'Try again.')
  } finally {
    isSaving.value = false
  }
}

function submit(): void {
  void post(true)
}

function submitDraft(): void {
  void post(false)
}

async function togglePublished(notice: Announcement): Promise<void> {
  try {
    const updated = await setAnnouncementPublished(notice.id, !notice.published)
    announcements.value = announcements.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
    toast.success(
      updated.published ? 'Notice published' : 'Notice withdrawn',
      updated.published ? 'It is visible again.' : 'It is a draft again. Nothing was deleted.',
    )
  } catch (error) {
    toast.error(
      'That change was not saved',
      error instanceof Error ? error.message : 'Try again in a moment.',
    )
  }
}

/**
 * Deleting is the only irreversible action here, so it asks. Withdrawing exists and is
 * reversible; a maintenance notice is exactly the thing somebody clears away and then
 * immediately wants back.
 */
async function confirmDelete(notice: Announcement): Promise<void> {
  const agreed = await ask({
    title: 'Delete this notice?',
    message: `"${notice.title}" will be removed for good. Withdrawing it instead keeps a copy you can put back.`,
    confirmText: 'Delete',
    cancelText: 'Keep it',
    variant: 'danger',
  })
  if (!agreed) return

  try {
    await deleteAnnouncement(notice.id)
    announcements.value = announcements.value.filter((item) => item.id !== notice.id)
    toast.success('Notice deleted', 'It is no longer visible to anyone.')
  } catch (error) {
    toast.error(
      'The notice was not deleted',
      error instanceof Error ? error.message : 'Try again in a moment.',
    )
  }
}

onMounted(load)
</script>

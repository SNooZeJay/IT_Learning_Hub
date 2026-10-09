<template>
  <div>
    <PageHeader :title="lesson?.title ?? 'Lesson'" :subtitle="headerSubtitle" :crumbs="crumbs">
      <template #actions>
        <Button v-if="isEnrolledHere" variant="outline" :disabled="isBusy" @click="toggleComplete">
          <LoaderCircle v-if="isBusy" class="size-4 animate-spin" aria-hidden="true" />
          <CircleCheck v-else-if="isComplete" class="size-4" aria-hidden="true" />
          <Circle v-else class="size-4" aria-hidden="true" />
          {{ isComplete ? 'Completed' : 'Mark complete' }}
        </Button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading lesson" />

    <ErrorState v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="!lesson"
      title="Lesson not found"
      description="This link may be out of date, or the lesson may have been removed from the course."
      :icon="FileQuestion"
    />

    <template v-else>
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- ============================== LESSON ============================== -->
        <div class="min-w-0 lg:col-span-2">
          <!-- Progress banner. Every state the database can hold is named
               separately, so "in progress" is never presented as complete. -->
          <div
            class="rounded-lg border p-5"
            :class="progressPanelClass"
            role="status"
            aria-live="polite"
          >
            <div class="flex flex-wrap items-center gap-3">
              <component :is="progressIcon" class="size-5 shrink-0" :class="progressIconClass" />
              <p class="text-sm font-medium" :class="progressTextClass">{{ progressLabel }}</p>
              <span class="ms-auto text-sm" :class="progressTextClass">{{ progressPercent }}%</span>
            </div>

            <!--
              The width is inline because it is a computed number: there is no
              token or class for "37%". The track colour is a token, so the
              surrounding chrome still flips with the theme.
            -->
            <div
              class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline"
              role="presentation"
            >
              <div
                class="h-full rounded-full bg-current transition-[width] duration-300"
                :class="progressTextClass"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>

            <p v-if="progress?.lastPositionSeconds" class="mt-2 text-xs text-slate">
              You stopped at {{ formatSeconds(progress.lastPositionSeconds) }} in the video.
            </p>
            <p v-else-if="progress?.completedAt" class="mt-2 text-xs text-slate">
              Completed on {{ formatDate(progress.completedAt) }}.
            </p>
          </div>

          <!--
            Video.

            Shown only when there is actually something to play. A lesson typed as a video
            with no URL behind it used to render this whole panel with "No video has been
            attached" inside it, which teaches the reader that videos are missing from a
            course that simply does not use them. A text lesson should read as a text
            lesson.
          -->
          <section
            v-if="lesson.lessonType === 'video' && lesson.videoUrl"
            class="mt-6 surface-card"
          >
            <h2 class="text-theme-sm text-ink">{{ lesson.title }}</h2>

            <div v-if="lesson.videoUrl" class="mt-4">
              <!--
                A plain element rather than a provider SDK. The stored value is a
                URL, not a provider id, so this plays wherever that URL points
                and the page depends on no third-party script.
              -->
              <div class="overflow-hidden rounded-md border border-hairline">
                <video
                  v-if="isPlayableUrl(lesson.videoUrl)"
                  class="aspect-video w-full bg-black"
                  :src="lesson.videoUrl"
                  controls
                  preload="metadata"
                  @timeupdate="onTimeUpdate"
                ></video>
                <a
                  v-else
                  class="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-surface p-6 text-center"
                  :href="lesson.videoUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video class="size-8 text-slate" aria-hidden="true" />
                  <span class="text-sm font-medium text-ink">Open this video in a new tab</span>
                  <span class="break-all font-mono text-xs text-slate">{{ lesson.videoUrl }}</span>
                </a>
              </div>

              <!--
                Saving position is a deliberate click rather than a write per
                timeupdate. Autowriting would be a few thousand rows for one
                video, and the stored percentage is never allowed to reach 100 on
                its own: only "Mark complete" does that.
              -->
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="isBusy || !watchedSeconds"
                  @click="savePosition"
                >
                  Save my place
                </Button>
                <p class="text-xs text-slate">
                  <template v-if="watchedSeconds > 0">
                    Saved up to {{ formatSeconds(watchedSeconds) }} of this session.
                  </template>
                  <template v-else>
                    Play the video, then save your place to come back to it later.
                  </template>
                </p>
              </div>
            </div>
          </section>

          <!-- Content -->
          <section
            v-if="lesson.content"
            class="mt-6 surface-card"
          >
            <h2 class="text-theme-sm text-ink">Lesson notes</h2>
            <!--
              Plain paragraphs, not v-html. The content is instructor-authored and
              trusted, but rendering it as HTML opens a stored-XSS path that only
              one mistyped sanitiser away from being real. Blank lines separate
              paragraphs; nothing inside a paragraph is interpreted.
            -->
            <div class="mt-4 space-y-4 text-sm leading-relaxed text-slate">
              <p v-for="(paragraph, index) in paragraphs" :key="index" class="whitespace-pre-line">
                {{ paragraph }}
              </p>
            </div>
          </section>

          <!-- Materials -->
          <section class="mt-6 surface-card-shell">
            <div class="border-b border-hairline px-6 py-4">
              <h2 class="text-theme-sm text-ink">Learning materials</h2>
              <p class="mt-1 text-sm text-slate">
                Readings, code, links and downloads your instructor attached to this lesson.
              </p>
            </div>

            <LoadingState v-if="materialsLoading" class="border-0" label="Loading materials" />

            <ErrorState
              v-else-if="materialsError"
              class="border-0"
              title="Could not load the materials"
              :message="materialsError"
              @retry="loadMaterials"
            />

            <div v-else-if="materials.length" class="px-6 py-5">
              <ul role="list" class="flex flex-col gap-2">
                <MaterialItem
                  v-for="material in materials"
                  :key="material.id"
                  :material="material"
                />
              </ul>
            </div>

            <EmptyState
              v-else
              class="border-0"
              title="No materials on this lesson"
              description="Anything your instructor attaches will appear here."
              :icon="Paperclip"
            />
          </section>
        </div>

        <!-- ============================== OUTLINE ============================== -->
        <div>
          <div
            class="sticky top-6 surface-card-shell"
          >
            <div class="border-b border-hairline px-5 py-4">
              <div class="flex items-baseline justify-between gap-2">
                <h2 class="text-theme-sm text-ink">Course outline</h2>
                <span class="shrink-0 text-xs text-slate">
                  {{ outline?.completedLessons ?? 0 }} of {{ outline?.totalLessons ?? 0 }}
                </span>
              </div>

              <!--
                Hidden when the course has no lessons. "0 of 0" above a full-width
                empty track reads as a broken progress bar rather than as an
                absence of content.
              -->
              <div
                v-if="outline && outline.totalLessons > 0"
                class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline"
                role="presentation"
              >
                <div
                  class="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                  :style="{ width: `${coursePercent}%` }"
                />
              </div>

              <p v-if="course" class="mt-3 text-xs text-slate">
                <RouterLink
                  class="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  :to="`/student/courses/${course.slug}`"
                >
                  {{ course.title }}
                </RouterLink>
              </p>
            </div>

            <LoadingState v-if="outlineLoading" class="border-0" label="Loading outline" />

            <ErrorState
              v-else-if="outlineError"
              class="border-0"
              title="Could not load the outline"
              :message="outlineError"
              @retry="loadOutline"
            />

            <template v-else-if="outline && outline.modules.length">
              <div class="max-h-[32rem] overflow-y-auto">
                <section
                  v-for="module in outline.modules"
                  :key="module.id"
                  class="border-b border-hairline-soft px-5 py-4 last:border-b-0"
                >
                  <h3 class="text-xs font-medium tracking-wide text-slate uppercase">
                    {{ module.position }}. {{ module.title }}
                  </h3>

                  <ul class="mt-2 space-y-0.5">
                    <li v-for="item in module.lessons" :key="item.id">
                      <!--
                        The current lesson is a heading, not a link to itself. A row
                        that navigates nowhere is a small lie about where the click
                        goes.
                      -->
                      <div
                        v-if="item.id === lesson.id"
                        class="flex items-center gap-2 rounded-md bg-brand-50 px-2.5 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                      >
                        <component
                          :is="statusIcon(item.progress?.status)"
                          class="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span class="truncate">{{ item.title }}</span>
                        <span class="ms-auto shrink-0 text-xs font-normal">Now</span>
                      </div>

                      <RouterLink
                        v-else
                        :to="`/student/lessons/${item.id}`"
                        class="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-surface dark:hover:bg-white/[0.05]"
                      >
                        <component
                          :is="statusIcon(item.progress?.status)"
                          class="size-4 shrink-0"
                          :class="statusIconClass(item.progress?.status)"
                          aria-hidden="true"
                        />
                        <span class="truncate text-slate">{{ item.title }}</span>
                        <span
                          v-if="item.durationMinutes"
                          class="ms-auto shrink-0 text-xs text-slate"
                        >
                          {{ item.durationMinutes }}m
                        </span>
                      </RouterLink>
                    </li>
                  </ul>
                </section>
              </div>

              <!--
                What is still outstanding, in the database's own words. This is
                the difference between "not finished" and "4 of 9 lessons
                complete, quiz average 62.0% needs 70%".
              -->
              <div v-if="gaps.length" class="border-t border-hairline px-5 py-4">
                <h3 class="text-xs font-medium tracking-wide text-slate uppercase">
                  Still to do on this course
                </h3>
                <ul class="mt-2 space-y-1.5">
                  <li
                    v-for="gap in gaps"
                    :key="gap.requirement"
                    class="flex items-start gap-2 text-xs text-slate"
                  >
                    <Circle class="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                    <span>{{ gap.detail }}</span>
                  </li>
                </ul>
              </div>

              <p
                v-else-if="isLoadingGaps"
                class="border-t border-hairline px-5 py-4 text-xs text-slate"
              >
                Checking what is left to do…
              </p>

              <!--
                Every requirement met, so the certificate is claimable. The
                button is offered even when one already exists, because the
                database's refusal ("you already hold a certificate for this
                course (ITH-..., issued 2026-10-01)", or the revocation notice
                with its date and reason) is more useful to a student than a
                button that silently does not appear.
              -->
              <div v-else-if="outline.enrollmentId" class="border-t border-hairline px-5 py-4">
                <p class="flex items-center gap-2 text-xs text-success-700 dark:text-success-400">
                  <CircleCheck class="size-4 shrink-0" aria-hidden="true" />
                  Every requirement for this course is met.
                </p>

                <Alert
                  v-if="certificateError"
                  variant="warning"
                  title="No certificate was issued"
                  :message="certificateError"
                  class="mt-3"
                />

                <p v-else-if="claimedCertificateNumber" class="mt-3 text-xs text-slate">
                  Issued as
                  <span class="font-mono">{{ claimedCertificateNumber }}</span
                  >. It is on your grades page.
                </p>

                <Button
                  v-else
                  size="sm"
                  variant="primary"
                  class="mt-3"
                  :disabled="isClaiming"
                  @click="claimCertificateForCourse"
                >
                  <LoaderCircle v-if="isClaiming" class="size-4 animate-spin" aria-hidden="true" />
                  Claim my certificate
                </Button>
              </div>
            </template>

            <EmptyState
              v-else
              class="border-0"
              title="No modules published"
              description="The instructor has not added the modules for this course yet."
              :icon="BookOpen"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  BookOpen,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  FileQuestion,
  LoaderCircle,
  Paperclip,
  Video,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import MaterialItem from '@/components/curriculum/MaterialItem.vue'
import {
  claimCertificate,
  completeLesson,
  getCourseOutline,
  getLessonContext,
  listCompletionGaps,
  listLessonMaterials,
  recordLearningEvent,
  recordLessonPosition,
  reopenLesson,
  startLesson,
} from '@/services/learning.service'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/types'
import type { ProgressStatus } from '@/types'
import type {
  CompletionGap,
  CourseOutline,
  LessonContext,
  LessonMaterial,
} from '@/services/learning.service'

const route = useRoute()
const auth = useAuthStore()

const context = ref<LessonContext | null>(null)
const outline = ref<CourseOutline | null>(null)
const materials = ref<LessonMaterial[]>([])
const gaps = ref<CompletionGap[]>([])

const isLoading = ref(true)
const isBusy = ref(false)
const errorMessage = ref('')

const outlineLoading = ref(true)
const outlineError = ref('')

const materialsLoading = ref(true)
const materialsError = ref('')

const isLoadingGaps = ref(false)

const isClaiming = ref(false)
/** The database's refusal, shown verbatim. Null until a claim is attempted. */
const certificateError = ref('')
const claimedCertificateNumber = ref('')

/** Furthest point reached in the video during this visit. Never promoted to 100. */
const watchedSeconds = ref(0)

const lessonId = computed(() => String(route.params.id ?? ''))
const lesson = computed(() => context.value?.lesson ?? null)
const course = computed(() => context.value?.course ?? null)
const progress = computed(() => context.value?.progress ?? null)

const isEnrolledHere = computed(() => Boolean(context.value?.enrollmentId))
const isComplete = computed(() => progress.value?.status === 'completed')
const progressPercent = computed(() => progress.value?.progressPercent ?? 0)

const crumbs = computed(() => [
  { label: 'Student', to: '/student/dashboard' },
  { label: 'My courses', to: '/student/courses' },
  ...(course.value
    ? [{ label: course.value.title, to: `/student/courses/${course.value.slug}` }]
    : []),
  { label: lesson.value?.title ?? 'Lesson' },
])

const headerSubtitle = computed(() => {
  if (!context.value) return 'Read the lesson and track your progress.'
  const parts: string[] = [context.value.module.title]
  if (lesson.value?.durationMinutes) parts.push(`${lesson.value.durationMinutes} min`)
  parts.push(lesson.value?.lessonType === 'video' ? 'Video' : 'Reading')
  return parts.join(' · ')
})

/**
 * Blank lines separate paragraphs; newlines inside one are preserved. A single
 * block with `whitespace-pre-line` would run the whole lesson together as one
 * wall of text.
 */
const paragraphs = computed(() =>
  (lesson.value?.content ?? '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0),
)

const coursePercent = computed(() => {
  const value = outline.value
  if (!value || value.totalLessons === 0) return 0
  return Math.round((value.completedLessons / value.totalLessons) * 100)
})

const progressLabel = computed(() => {
  switch (progress.value?.status) {
    case 'completed':
      return 'Completed'
    case 'in_progress':
      return 'In progress'
    case 'not_started':
      return 'Not started'
    default:
      return 'Not started'
  }
})

const progressPanelClass = computed(() => {
  if (isComplete.value) {
    return 'border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10'
  }
  if (progress.value?.status === 'in_progress') {
    return 'border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10'
  }
  return 'border-hairline bg-canvas dark:bg-white/[0.03]'
})

const progressIconClass = computed(() => {
  if (isComplete.value) return 'text-success-600 dark:text-success-400'
  if (progress.value?.status === 'in_progress') return 'text-warning-600 dark:text-warning-400'
  return 'text-slate'
})

const progressTextClass = computed(() => {
  if (isComplete.value) return 'text-success-800 dark:text-success-300'
  if (progress.value?.status === 'in_progress') return 'text-warning-800 dark:text-warning-300'
  return 'text-ink'
})

const progressIcon = computed(() => {
  if (isComplete.value) return CircleCheck
  if (progress.value?.status === 'in_progress') return CircleDot
  return CircleDashed
})

function statusIcon(status: ProgressStatus | undefined) {
  if (status === 'completed') return CircleCheck
  if (status === 'in_progress') return CircleDot
  return Circle
}

function statusIconClass(status: ProgressStatus | undefined): string {
  if (status === 'completed') return 'text-success-600 dark:text-success-400'
  if (status === 'in_progress') return 'text-brand-500 dark:text-brand-400'
  return 'text-slate'
}

/** Only an absolute http(s) URL goes into a `<video src>`. */
function isPlayableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

function onTimeUpdate(event: Event): void {
  const media = event.target as HTMLVideoElement
  if (!Number.isFinite(media.currentTime)) return
  watchedSeconds.value = Math.max(watchedSeconds.value, Math.floor(media.currentTime))
}

/**
 * Incremented per load; a response whose token is stale is discarded.
 *
 * Navigating between lessons fires this watcher without awaiting, so two `load()` calls can
 * be in flight at once. Lesson A's read resolving after lesson B's overwrote `context`, and
 * `loadOutline`/`loadGaps` then read `context.value.course.id` for the wrong course - so the
 * URL said one lesson and the page showed another's title, content and progress.
 *
 * A counter rather than a boolean because the calls overlap rather than queue.
 */
let loadToken = 0

async function load(): Promise<void> {
  const token = ++loadToken
  isLoading.value = true
  errorMessage.value = ''
  try {
    // The profile resolves the student's own enrolment. On a cold load the store
    // may still be fetching it, and without this the page would render as though
    // nobody were enrolled and offer no way to record progress.
    await auth.ensureReady()
    const studentId = auth.profile?.id
    if (!studentId) {
      errorMessage.value = 'Your profile has not loaded yet. Give it a moment and try again.'
      return
    }

    // Read the id once. lessonId.value can change while this is in flight, and
    // reading it after the await would fetch a different lesson than the one this
    // load started for.
    const wanted = lessonId.value
    const loaded = await getLessonContext(wanted, studentId)
    // Discard a response the user has already navigated away from.
    if (token !== loadToken || wanted !== lessonId.value) return
    context.value = loaded
    context.value = loaded
    if (!loaded) return

    // Opening a lesson is the one moment where recording "in progress" is honest
    // without being asked, so it happens here rather than behind a button.
    //
    // Guarded on `not_started` and nothing else. Revisiting a finished lesson must
    // not reset it - `startLesson` writes percent 0 and status in_progress, so
    // calling it on a completed row would quietly undo the student's own work the
    // second time they came back to read it.
    if (loaded.enrollmentId && (loaded.progress?.status ?? 'not_started') === 'not_started') {
      context.value = {
        ...loaded,
        progress: await startLesson(loaded.enrollmentId, loaded.lesson.id),
      }
      // The startLesson await is another gap: a slow one used to write the previous
      // lesson's progress into the current lesson's context.
      if (token !== loadToken || wanted !== lessonId.value) return
    }

    // The sidebar and the materials are independent, so they load in parallel
    // behind the lesson body rather than holding the page hostage.
    void Promise.all([loadOutline(), loadMaterials(), loadGaps()])
  } catch (error) {
    // A stale failure must not be reported against a lesson the student has left.
    // Without this the message survives into the next lesson, whose success path has
    // already cleared it - so a lesson that loaded perfectly renders ""Could not load
    // this lesson"" for ever.
    if (token !== loadToken) return
    // LearningError messages are written to be shown to a person, so they pass
    // through untouched.
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load this lesson. Try again.'
  } finally {
    // Only the newest load may clear the spinner. A stale one finishing would hide a
    // spinner the current load still wants, and watch(lessonId) has already nulled
    // context, so the page would show ""Lesson not found"" for a lesson that is
    // merely still loading.
    if (token === loadToken) isLoading.value = false
  }
}

async function loadOutline(): Promise<void> {
  const courseId = context.value?.course.id
  const studentId = auth.profile?.id
  if (!courseId || !studentId) return

  outlineLoading.value = true
  outlineError.value = ''
  try {
    outline.value = await getCourseOutline(courseId, studentId)
  } catch (error) {
    outlineError.value =
      error instanceof Error ? error.message : 'Could not load the course outline.'
  } finally {
    outlineLoading.value = false
  }
}

async function loadMaterials(): Promise<void> {
  materialsLoading.value = true
  materialsError.value = ''
  try {
    materials.value = await listLessonMaterials(lessonId.value)
  } catch (error) {
    materialsError.value =
      error instanceof Error ? error.message : 'Could not load the lesson materials.'
  } finally {
    materialsLoading.value = false
  }
}

async function loadGaps(): Promise<void> {
  const id = context.value?.enrollmentId
  if (!id) return

  isLoadingGaps.value = true
  try {
    gaps.value = await listCompletionGaps(id)
  } catch (error) {
    // Supplementary panel. A failure here must not blank the lesson, so it is
    // logged and the panel omits the list rather than showing a stale one.
    console.warn('[lesson] could not load completion gaps:', error)
    gaps.value = []
  } finally {
    isLoadingGaps.value = false
  }
}

async function toggleComplete(): Promise<void> {
  const current = context.value
  const enrollmentId = current?.enrollmentId
  if (!current || !enrollmentId) return

  isBusy.value = true
  try {
    if (isComplete.value) {
      // Undoing exists for the same reason the button is offered at all: a
      // mis-click would otherwise be permanent from the student's side.
      context.value = { ...current, progress: await reopenLesson(enrollmentId, current.lesson.id) }
      await Promise.all([loadOutline(), loadGaps()])
      return
    }

    // completeLesson writes the progress and re-evaluates the enrolment in one
    // call. Splitting them here would leave a window where a finished course is
    // still marked active.
    const result = await completeLesson(enrollmentId, current.lesson.id)
    context.value = { ...current, progress: result.progress }
    gaps.value = result.gaps
    await loadOutline()

    void recordLearningEvent('lesson_completed', 'lesson', current.lesson.id, {
      course_id: current.course.id,
      course_completed: result.courseCompleted,
    })
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not update your progress. Try again.'
  } finally {
    isBusy.value = false
  }
}

async function savePosition(): Promise<void> {
  const current = context.value
  const enrollmentId = current?.enrollmentId
  if (!current || !enrollmentId || watchedSeconds.value === 0) return

  // The percentage is derived from the lesson's stated duration. A video with no
  // duration recorded gets 0 percent rather than a made-up ratio — the position
  // in seconds is still saved, which is the part that is actually known.
  const seconds = current.lesson.durationMinutes ? current.lesson.durationMinutes * 60 : 0
  const percent = seconds > 0 ? (watchedSeconds.value / seconds) * 100 : 0

  isBusy.value = true
  try {
    context.value = {
      ...current,
      progress: await recordLessonPosition(
        enrollmentId,
        current.lesson.id,
        percent,
        watchedSeconds.value,
      ),
    }
    await loadOutline()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not save your position. Try again.'
  } finally {
    isBusy.value = false
  }
}

/**
 * Ask the database to issue the certificate for this course.
 *
 * Every refusal — not enrolled, already holds one, the existing one was revoked,
 * requirements unmet — comes back as a sentence written to be read by a student,
 * so it is displayed as the database wrote it. A generic "could not claim" would
 * throw away the only useful thing in the response.
 */
async function claimCertificateForCourse(): Promise<void> {
  const courseId = context.value?.course.id
  if (!courseId) return

  isClaiming.value = true
  certificateError.value = ''
  try {
    const certificate = await claimCertificate(courseId)
    claimedCertificateNumber.value = certificate.certificateNumber
    void recordLearningEvent('certificate_claimed', 'course', courseId, {
      certificate_number: certificate.certificateNumber,
    })
  } catch (error) {
    certificateError.value =
      error instanceof Error ? error.message : 'Could not claim a certificate. Try again.'
  } finally {
    isClaiming.value = false
  }
}

// A different lesson on the same route means a different page, not a patch of
// this one. Local state is reset so a stale outline cannot outlive the lesson.
watch(lessonId, () => {
  context.value = null
  outline.value = null
  materials.value = []
  gaps.value = []
  watchedSeconds.value = 0
  certificateError.value = ''
  claimedCertificateNumber.value = ''
  void load()
})

onMounted(load)
</script>

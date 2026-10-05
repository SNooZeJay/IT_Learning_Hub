<template>
  <div>
    <PageHeader
      :title="lesson?.title ?? 'Lesson'"
      :subtitle="headerSubtitle"
      :crumbs="crumbs"
    >
      <template #actions>
        <Button
          v-if="isEnrolledHere"
          variant="outline"
          :disabled="isBusy || !lesson || !lesson.content"
          @click="toggleComplete"
        >
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
      description="This link may be out of date, or the lesson has been removed from the course."
      :icon="FileQuestion"
    />

    <template v-else>
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- ============================ LESSON ============================ -->
        <div class="lg:col-span-2">
          <!-- Progress banner. Every state the database can hold is named, so
               "in progress" is never reported as complete. -->
          <div
            class="rounded-lg border p-5"
            :class="progressPanelClass"
            role="status"
            aria-live="polite"
          >
            <div class="flex flex-wrap items-center gap-3">
              <component :is="progressIcon" class="size-5 shrink-0" :class="progressIconClass" />
              <p class="text-sm font-medium" :class="progressTextClass">
                {{ progressLabel }}
              </p>
              <span class="ms-auto text-sm" :class="progressTextClass">
                {{ progress?.progressPercent ?? 0 }}%
              </span>
            </div>

            <div
              class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
              role="presentation"
            >
              <div
                class="h-full rounded-full bg-current transition-[width] duration-300"
                :class="progressTextClass"
                :style="{ width: `${progress?.progressPercent ?? 0}%` }"
              />
            </div>

            <p
              v-if="progress?.lastPositionSeconds"
              class="mt-2 text-xs text-slate dark:text-stone"
            >
              You stopped at {{ formatSeconds(progress.lastPositionSeconds) }} in the video.
            </p>
            <p v-else-if="progress?.completedAt" class="mt-2 text-xs text-slate dark:text-stone">
              Completed on {{ formatDate(progress.completedAt) }}.
            </p>
          </div>

          <!-- Video -->
          <div
            v-if="lesson.lessonType === 'video'"
            class="mt-6 rounded-lg border border-hairline bg-canvas p-6 dark:bg-white/[0.03]"
          >
            <h2 class="text-base font-semibold text-ink">{{ lesson.title }}</h2>

            <div v-if="lesson.videoUrl" class="mt-4">
              <!--
                A plain frame rather than an SDK. The stored value is a URL, not a
                provider id, so the video plays wherever that URL points and
                nothing about the page depends on a third-party script.
              -->
              <div class="overflow-hidden rounded-md border border-hairline bg-black">
                <video
                  v-if="isVideoEmbeddable(lesson.videoUrl)"
                  class="aspect-video w-full"
                  :src="lesson.videoUrl"
                  controls
                  preload="metadata"
                  @timeupdate="onTimeUpdate"
                ></video>
                <a
                  v-else
                  class="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center"
                  :href="lesson.videoUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video class="size-8 text-slate dark:text-stone" aria-hidden="true" />
                  <span class="text-sm text-ink">Open this video in a new tab</span>
                  <span class="break-all font-mono text-xs text-slate dark:text-stone">
                    {{ lesson.videoUrl }}
                  </span>
                </a>
              </div>

              <!--
                Position saving is explicit rather than on every timeupdate. A
                write per second would be a few thousand rows per video, and the
                stored percentage is never allowed to reach 100 on its own: only
                "Mark complete" does that.
              -->
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="isBusy || !enrollmentId || !watchedSeconds"
                  @click="savePosition"
                >
                  Save my place
                </Button>
                <p class="text-xs text-slate dark:text-stone">
                  <span v-if="watchedSeconds > 0">
                    Saved up to {{ formatSeconds(watchedSeconds) }} of your session.
                  </span>
                  <span v-else>
                    Play the video, then save your place to come back to it later.
                  </span>
                </p>
              </div>
            </div>

            <p v-else class="mt-4 text-sm text-slate dark:text-stone">
              No video has been attached to this lesson yet. The written content below is all
              there is.
            </p>
          </div>

          <!-- Content -->
          <div
            v-if="lesson.content"
            class="mt-6 rounded-lg border border-hairline bg-canvas p-6 dark:bg-white/[0.03]"
          >
            <h2 class="text-base font-semibold text-ink">Lesson notes</h2>
            <!--
              Plain paragraphs, not v-html. The content is instructor-authored and
              trusted, but rendering it as HTML would be a stored-XSS path opened
              up by one mistyped sanitiser later. Newlines become paragraphs and
              nothing else is interpreted.
            -->
            <div class="mt-4 space-y-4 text-sm leading-relaxed text-slate">
              <p v-for="(paragraph, index) in paragraphs" :key="index" class="whitespace-pre-line">
                {{ paragraph }}
              </p>
            </div>
          </div>

          <!-- Materials -->
          <div
            class="mt-6 rounded-lg border border-hairline bg-canvas dark:bg-white/[0.03]"
          >
            <div class="border-b border-hairline px-6 py-4">
              <h2 class="text-base font-semibold text-ink">Materials</h2>
              <p class="mt-1 text-sm text-slate">
                Files your instructor attached to this lesson.
              </p>
            </div>

            <div v-if="materialsLoading" class="p-6">
              <LoadingState label="Loading materials" />
            </div>

            <ErrorState
              v-else-if="materialsError"
              :message="materialsError"
              title="Could not load the materials"
              @retry="loadMaterials"
            />

            <ul v-else-if="materials.length" class="divide-y divide-hairline">
              <li
                v-for="material in materials"
                :key="material.id"
                class="flex items-center gap-3 px-6 py-4"
              >
                <Paperclip class="size-4 shrink-0 text-slate dark:text-stone" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-ink">{{ material.title }}</p>
                  <p class="mt-0.5 text-xs text-slate dark:text-stone">
                    {{ material.fileType ?? 'file' }}
                    <template v-if="material.fileSize !== null">
                      · {{ formatBytes(material.fileSize) }}
                    </template>
                    · added {{ formatDate(material.uploadedAt) }}
                  </p>
                </div>
                <a
                  class="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  :href="material.filePath"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
              </li>
            </ul>

            <EmptyState
              v-else
              class="border-0"
              title="No materials on this lesson"
              description="Anything your instructor attaches will appear here."
              :icon="Paperclip"
            />
          </div>
        </div>

        <!-- ============================ OUTLINE ============================ -->
        <div>
          <div
            class="sticky top-6 rounded-lg border border-hairline bg-canvas dark:bg-white/[0.03]"
          >
            <div class="border-b border-hairline px-5 py-4">
              <div class="flex items-baseline justify-between gap-2">
                <h2 class="text-base font-semibold text-ink">Course outline</h2>
                <span class="shrink-0 text-xs text-slate dark:text-stone">
                  {{ outline?.completedLessons ?? 0 }}/{{ outline?.totalLessons ?? 0 }}
                </span>
              </div>

              <!-- Course progress bar. Hidden entirely at zero lessons, because
                   "0 of 0" with a full-width empty track reads as a broken bar
                   rather than an absence of content. -->
              <div
                v-if="outline && outline.totalLessons > 0"
                class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
                role="presentation"
              >
                <div
                  class="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                  :style="{ width: `${coursePercent}%` }"
                />
              </div>

              <p v-if="course" class="mt-3 text-xs text-slate dark:text-stone">
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
              :message="outlineError"
              title="Could not load the outline"
              @retry="loadOutline"
            />

            <template v-else-if="outline && outline.modules.length">
              <div class="max-h-[32rem] overflow-y-auto">
                <section
                  v-for="module in outline.modules"
                  :key="module.id"
                  class="border-b border-hairline-soft px-5 py-4 last:border-b-0"
                >
                  <h3 class="text-xs font-semibold tracking-wide text-slate uppercase">
                    {{ module.position }}. {{ module.title }}
                  </h3>

                  <ul class="mt-2 space-y-0.5">
                    <li v-for="item in module.lessons" :key="item.id">
                      <!-- The current lesson is rendered as a heading rather
                           than a link to itself. A row that navigates nowhere is
                           a small lie about where the click goes. -->
                      <div
                        v-if="item.id === lesson.id"
                        class="flex items-center gap-2 rounded-md bg-brand-50 px-2.5 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                      >
                        <component
                          :is="item.progress?.status === 'completed' ? CircleCheck : BookOpen"
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
                        <span class="truncate text-slate dark:text-stone">{{ item.title }}</span>
                        <span
                          v-if="item.durationMinutes"
                          class="ms-auto shrink-0 text-xs text-stone"
                        >
                          {{ item.durationMinutes }}m
                        </span>
                      </RouterLink>
                    </li>
                  </ul>
                </section>
              </div>

              <!-- What is still outstanding on the whole course, in the
                   database's words. This is the difference between "not
                   finished" and "4 of 9 lessons complete". -->
              <div v-if="gaps.length" class="border-t border-hairline px-5 py-4">
                <h3 class="text-xs font-semibold tracking-wide text-slate uppercase">
                  Still to do on this course
                </h3>
                <ul class="mt-2 space-y-1.5">
                  <li
                    v-for="gap in gaps"
                    :key="gap.requirement"
                    class="flex items-start gap-2 text-xs text-slate dark:text-stone"
                  >
                    <Circle class="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                    <span>{{ gap.detail }}</span>
                  </li>
                </ul>
              </div>

              <div
                v-else-if="outline.enrollmentId && !isLoadingGaps"
                class="border-t border-hairline px-5 py-4"
              >
                <p class="flex items-center gap-2 text-xs text-success-700 dark:text-success-400">
                  <CircleCheck class="size-4 shrink-0" aria-hidden="true" />
                  Every requirement for this course is met.
                </p>
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
import Button from '@/components/ui/Button.vue'
import {
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
import type { CompletionGap, CourseOutline, LessonContext, LessonMaterial } from '@/services/learning.service'

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

/** Furthest point reached in the video during this visit. Never 100 on its own. */
const watchedSeconds = ref(0)

const lessonId = computed(() => String(route.params.id ?? ''))
const lesson = computed(() => context.value?.lesson ?? null)
const course = computed(() => context.value?.course ?? null)
const enrollmentId = computed(() => context.value?.enrollmentId ?? null)
const progress = computed(() => context.value?.progress ?? null)

const isEnrolledHere = computed(
  () => context.value?.enrollmentId !== null && context.value?.enrollmentId !== undefined,
)

const isComplete = computed(() => progress.value?.status === 'completed')

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
  const bits: string[] = [context.value.module.title]
  if (lesson.value?.durationMinutes) bits.push(`${lesson.value.durationMinutes} min`)
  bits.push(lesson.value?.lessonType === 'video' ? 'Video' : 'Reading')
  return bits.join(' · ')
})

/**
 * Blank lines separate paragraphs, and each paragraph keeps its own internal
 * newlines. A single `<p>` with `whitespace-pre-line` would run the whole lesson
 * together as one block.
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
      return `In progress · ${progress.value?.progressPercent ?? 0}%`
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
  return 'text-slate dark:text-stone'
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
  return 'text-slate dark:text-stone'
}

/** Only same-origin or plain https URLs go into a `<video src>`. */
function isVideoEmbeddable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function onTimeUpdate(event: Event): void {
  const media = event.target as HTMLVideoElement
  if (!Number.isFinite(media.currentTime)) return
  watchedSeconds.value = Math.max(watchedSeconds.value, Math.floor(media.currentTime))
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    await auth.ensureReady()
    const studentId = auth.profile?.id
    if (!studentId) {
      errorMessage.value = 'Your profile has not loaded yet. Try again in a moment.'
      return
    }

    context.value = await getLessonContext(lessonId.value, studentId)
    if (!context.value) return

    // A lesson being opened is the one moment where "in progress" is an honest
    // thing to record without being asked, so it happens here rather than behind
    // a button. Re-opening a lesson already in progress is a no-op upsert.
    if (context.value.enrollmentId && context.value.progress?.status !== 'in_progress') {
      context.value = {
        ...context.value,
        progress: await startLesson(context.value.enrollmentId, context.value.lesson.id),
      }
    }

    void Promise.all([loadOutline(), loadMaterials(), loadGaps()])
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load this lesson. Try again.'
  } finally {
    isLoading.value = false
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
  const id = lessonId.value
  materialsLoading.value = true
  materialsError.value = ''
  try {
    materials.value = await listLessonMaterials(id)
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
    // Gaps are supplementary. A failure here must not blank the lesson, so it is
    // logged and the panel simply omits the list rather than showing a stale one.
    console.warn('[lesson] could not load completion gaps:', error)
    gaps.value = []
  } finally {
    isLoadingGaps.value = false
  }
}

async function toggleComplete(): Promise<void> {
  const id = context.value?.enrollmentId
  const lessonRow = context.value?.lesson
  if (!id || !lessonRow) return

  isBusy.value = true
  try {
    if (isComplete.value) {
      // Undoing is allowed for the same reason the button exists at all: a
      // mis-click would otherwise be permanent from the student's side.
      context.value = { ...context.value, progress: await reopenLesson(id, lessonRow.id) }
      await Promise.all([loadOutline(), loadGaps()])
      return
    }

    const result = await completeLesson(id, lessonRow.id)
    context.value = { ...context.value, progress: result.progress }
    gaps.value = result.gaps
    await loadOutline()

    void recordLearningEvent('lesson_completed', 'lesson', lessonRow.id, {
      course_id: context.value?.course.id ?? '',
    })
  } catch (error) {
    // ServiceError text is written to be shown to a person, so it passes
    // through untouched rather than being replaced with a generic failure.
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not update your progress.'
  } finally {
    isBusy.value = false
  }
}

async function savePosition(): Promise<void> {
  const id = context.value?.enrollmentId
  const lessonRow = context.value?.lesson
  if (!id || !lessonRow || watchedSeconds.value === 0) return

  const duration = lessonRow.durationMinutes ? lessonRow.durationMinutes * 60 : 0
  const percent = duration > 0 ? (watchedSeconds.value / duration) * 100 : 0

  isBusy.value = true
  try {
    context.value = {
      ...context.value,
      progress: await recordLessonPosition(id, lessonRow.id, percent, watchedSeconds.value),
    }
    await loadOutline()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not save your position.'
  } finally {
    isBusy.value = false
  }
}

watch(lessonId, () => {
  void load()
})

onMounted(load)
</script>
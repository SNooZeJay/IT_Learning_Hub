<script setup lang="ts">
/**
 * Create or edit a lesson, inline.
 *
 * The old system's lesson form is worth copying closely: a plain textarea for the
 * body with the hint "leave a blank line between paragraphs", a summary field,
 * a duration estimate, and a required checkbox. It had no rich text editor
 * anywhere, and adding one would be inventing a workflow rather than porting
 * one - the plain textarea is also what keeps stored-XSS off the table.
 */
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import { isSafeUrl } from '@/validation'
import { UNSAFE_URL_REASON } from '@/services/curriculum.service'
import { formSelectClass } from '@/components/ui/controlClasses'
import type { ContentStatus, Lesson } from '@/types'

const props = defineProps<{
  /** Null when creating. */
  lesson: Lesson | null
  moduleTitle: string
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [
    draft: {
      title: string
      summary: string | null
      content: string | null
      lessonType: 'article' | 'video'
      durationMinutes: number | null
      videoUrl: string | null
      isPreview: boolean
      isRequired: boolean
      status: ContentStatus
    },
  ]
}>()

const title = ref('')
const summary = ref('')
const content = ref('')
const lessonType = ref<'article' | 'video'>('article')
const durationMinutes = ref<number | null>(null)
const videoUrl = ref('')
const isPreview = ref(false)
const isRequired = ref(true)
const status = ref<ContentStatus>('draft')
const titleError = ref('')
const videoUrlError = ref('')

watch(
  () => props.lesson,
  (value) => {
    title.value = value?.title ?? ''
    summary.value = value?.summary ?? ''
    content.value = value?.content ?? ''
    lessonType.value = value?.lessonType ?? 'article'
    durationMinutes.value = value?.durationMinutes ?? null
    videoUrl.value = value?.videoUrl ?? ''
    isPreview.value = value?.isPreview ?? false
    isRequired.value = value?.isRequired ?? true
    status.value = value?.status ?? 'draft'
    titleError.value = ''
  },
  { immediate: true },
)

function submit(): void {
  titleError.value = ''
  videoUrlError.value = ''

  const trimmed = title.value.trim()
  if (trimmed === '') {
    titleError.value = 'Give the lesson a title.'
    return
  }

  // The same scheme check `MaterialForm.vue` applies to a material link, and which this
  // form had no version of at all. `lessons.video_url` is rendered into an iframe or an
  // anchor on the student lesson page, so a `javascript:` value stored here is the same
  // stored-XSS primitive the material check was written to close.
  const url = videoUrl.value.trim()
  if (url !== '' && !isSafeUrl(url)) {
    videoUrlError.value = `That video address cannot be saved. ${UNSAFE_URL_REASON}`
    return
  }

  emit('submit', {
    title: trimmed,
    summary: summary.value.trim() === '' ? null : summary.value.trim(),
    content: content.value.trim() === '' ? null : content.value,
    lessonType: lessonType.value,
    durationMinutes:
      durationMinutes.value === null || Number.isNaN(durationMinutes.value)
        ? null
        : Number(durationMinutes.value),
    videoUrl: url === '' ? null : url,
    isPreview: isPreview.value,
    isRequired: isRequired.value,
    status: status.value,
  })
}
</script>

<template>
  <form
    class="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02]"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="section-heading">
      {{ lesson ? 'Edit lesson' : 'New lesson' }}
      <span v-if="moduleTitle" class="font-normal text-gray-500 dark:text-gray-400">
        in {{ moduleTitle }}
      </span>
    </h3>

    <div class="mt-4 flex flex-col gap-4">
      <div>
        <label for="lesson-title" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Title
        </label>
        <input
          id="lesson-title"
          v-model="title"
          type="text"
          maxlength="255"
          placeholder="What a program actually is"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-slate focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
          :aria-invalid="Boolean(titleError)"
        />
        <p v-if="titleError" class="mt-1.5 text-sm text-error-600 dark:text-error-400">
          {{ titleError }}
        </p>
      </div>

      <div>
        <label for="lesson-summary" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          One-line summary
        </label>
        <p class="mt-0.5 text-xs text-slate">
          Shown under the title in the course outline. This is what makes the outline scannable.
        </p>
        <input
          id="lesson-summary"
          v-model="summary"
          type="text"
          maxlength="255"
          placeholder="Instructions in order, and why the order is the whole idea."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-slate focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div>
        <label for="lesson-type" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Kind
        </label>
        <select id="lesson-type" v-model="lessonType" ::class="formSelectClass">
          <option value="article">Reading — written notes on the page</option>
          <option value="video">Video — played on the page</option>
        </select>
      </div>

      <div v-if="lessonType === 'video'">
        <label for="lesson-video" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Video URL
        </label>
        <input
          id="lesson-video"
          v-model="videoUrl"
          type="url"
          :aria-invalid="Boolean(videoUrlError)"
          :aria-describedby="videoUrlError ? 'lesson-video-error' : 'lesson-video-help'"
          placeholder="https://example.com/lesson.mp4"
          class="mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-slate focus:outline-none dark:bg-white/[0.03] dark:text-white/90"
          :class="
            videoUrlError
              ? 'border-error-500 focus:border-error-500 dark:border-error-500'
              : 'border-gray-300 focus:border-brand-500 dark:border-gray-700'
          "
        />
        <p
          v-if="videoUrlError"
          id="lesson-video-error"
          class="mt-1.5 text-sm text-error-600 dark:text-error-400"
        >
          {{ videoUrlError }}
        </p>
        <p v-else id="lesson-video-help" class="mt-1.5 text-xs text-slate">
          A direct link to a video file plays on the page. A link to a YouTube page opens in a new
          tab — attach that as a material instead.
        </p>
      </div>

      <div>
        <label for="lesson-content" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Lesson notes
        </label>
        <p class="mt-0.5 text-xs text-slate">
          Leave a blank line between paragraphs. Text only — no formatting is interpreted.
        </p>
        <textarea
          id="lesson-content"
          v-model="content"
          rows="8"
          placeholder="A program is a list of instructions, and the computer follows them strictly from top to bottom."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-slate focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="lesson-duration" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            How long it takes
          </label>
          <div class="mt-1.5 flex items-center gap-2">
            <input
              id="lesson-duration"
              v-model.number="durationMinutes"
              type="number"
              min="0"
              step="1"
              placeholder="15"
              class="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-slate focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
            />
            <span class="shrink-0 section-subheading">minutes</span>
          </div>
        </div>

        <div>
          <label for="lesson-status" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Visibility
          </label>
          <select id="lesson-status" v-model="status" ::class="formSelectClass">
            <option value="draft">Draft — only you can see this</option>
            <option value="published">Published — students can see this</option>
            <option value="archived">Archived — hidden from everyone</option>
          </select>
        </div>
      </div>

      <!-- Two checkboxes, both off by default on the create path so the intent is
           explicit. `is_preview` is the odd one: an instructor ticking it is
           deliberately showing a lesson before enrolling anyone. -->
      <div class="flex flex-col gap-2.5">
        <label class="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
          <input
            v-model="isRequired"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
          />
          <span>
            Required
            <span class="block text-xs text-slate">
              Counts toward this student's course progress and toward the certificate.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
          <input
            v-model="isPreview"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
          />
          <span>
            Free preview
            <span class="block text-xs text-slate">
              Anyone can read this lesson without enrolling. Use it for the first lesson.
            </span>
          </span>
        </label>
      </div>
    </div>

    <p v-if="error" class="mt-4 text-sm text-error-600 dark:text-error-400">{{ error }}</p>

    <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" variant="primary" :disabled="saving">
        {{ lesson ? 'Save lesson' : 'Add lesson' }}
      </Button>
    </div>
  </form>
</template>
